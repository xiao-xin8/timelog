import { readPasswordIterations, readSessionConfig } from '../config';
import * as db from '../db/queries';
import type { UserRow } from '../db/queries';
import { randomToken, sha256Hex } from '../lib/encoding';
import { Errors } from '../lib/errors';
import { signAccessToken } from '../lib/jwt';
import { burnPasswordTime, hashPassword, verifyPassword } from '../lib/password';
import { ok } from '../lib/response';
import { toPublicUser, type PublicUser } from '../lib/serialize';
import {
  asRecord,
  assertEmail,
  assertPassword,
  assertUsername,
  readJson,
  requireString,
  str,
} from '../lib/validate';
import { requireUserId } from '../middleware/auth';

/**
 * 认证路由
 *
 * 双 Token 模型：
 *   - access token：JWT，2 小时，**无状态、不查库**（普通请求只验签）
 *   - refresh token：随机串，落库的是它的 SHA-256，180 天滑动窗口
 *
 * 「像微信一样只要在用就不掉线」靠的是 refresh 接口的**滑动续期**：
 * 每次用它换 access 时，把过期时间重新推后 180 天。
 * 也就是说 —— 只要 180 天内有任何一次打开 App，登录态就永远不会失效。
 */

const DEVICE_MAX_LENGTH = 64;

interface SessionResponse {
  accessToken: string;
  refreshToken: string;
  /** access token 有效期（秒），客户端据此决定何时提前静默刷新 */
  expiresIn: number;
  user: PublicUser;
}

/** 用户 id：256 bit 随机串里取 16 字节，够用且不暴露注册时间 */
function generateUserId(): string {
  return randomToken(16);
}

async function issueSession(env: Env, user: UserRow, device: string | undefined): Promise<SessionResponse> {
  const config = readSessionConfig(env);
  const now = Date.now();

  const accessToken = await signAccessToken(user.id, config.jwtSecret, config.accessTokenTtl);


  const refreshToken = randomToken(32);
  const tokenHash = await sha256Hex(refreshToken);

  await db.insertRefreshToken(env.DB, {
    token_hash: tokenHash,
    user_id: user.id,
    device: device ?? null,
    created_at: now,
    last_used_at: now,
    expires_at: now + config.refreshTokenTtl * 1000,
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: config.accessTokenTtl,
    user: toPublicUser(user),
  };
}

function readDevice(body: Record<string, unknown>): string | undefined {
  const device = str(body, 'device');
  return device ? device.slice(0, DEVICE_MAX_LENGTH) : undefined;
}

/** 注册（成功后直接返回会话，客户端无需再登录一次） */
export async function register(request: Request, env: Env): Promise<Response> {
  const body = asRecord(await readJson(request));
  const username = assertUsername(str(body, 'username'));
  const email = assertEmail(str(body, 'email'));
  const password = assertPassword(str(body, 'password'));
  const device = readDevice(body);


  const conflict = await db.findUserConflict(env.DB, username, email);
  if (conflict === 'username') throw Errors.conflict('用户名已被注册', 'USERNAME_TAKEN');
  if (conflict === 'email') throw Errors.conflict('邮箱已被注册', 'EMAIL_TAKEN');

  const passwordHash = await hashPassword(password, readPasswordIterations(env));
  const userId = generateUserId();
  const now = Date.now();

  await db.insertUser(env.DB, {
    id: userId,
    username,
    email,
    passwordHash: passwordHash.hash,
    passwordSalt: passwordHash.salt,
    passwordIterations: passwordHash.iterations,
    now,
  });

  const user = await db.getUserById(env.DB, userId);
  if (!user) throw Errors.internal('账号创建失败，请重试');

  return ok(await issueSession(env, user, device), 201);
}

/** 登录：账号可以是用户名或邮箱 */
export async function login(request: Request, env: Env): Promise<Response> {
  const body = asRecord(await readJson(request));
  const account = requireString(str(body, 'account'), '账号');
  const password = requireString(str(body, 'password'), '密码');
  const device = readDevice(body);

  const userId = await db.findUserIdByAccount(env.DB, account);
  const user = userId ? await db.getUserById(env.DB, userId) : null;

  if (!user) {

    await burnPasswordTime(readPasswordIterations(env));
    throw Errors.unauthorized('账号或密码错误', 'INVALID_CREDENTIALS');
  }

  const passwordValid = await verifyPassword(password, {
    hash: user.password_hash,
    salt: user.password_salt,
    iterations: user.password_iterations,
  });
  if (!passwordValid) {
    throw Errors.unauthorized('账号或密码错误', 'INVALID_CREDENTIALS');
  }

  if (!user.is_active) {
    throw Errors.forbidden('账号已被禁用，请联系管理员', 'ACCOUNT_DISABLED');
  }

  const now = Date.now();
  await db.touchLastLogin(env.DB, user.id, now);

  return ok(await issueSession(env, { ...user, last_login_at: now }, device));
}

/**
 * 换 access token（滑动续期）
 *
 * 客户端两种时候会调它：
 *   1. access 快过期了（提前静默刷）
 *   2. 某个请求撞到 401（刷完重放那次请求）
 */
export async function refresh(request: Request, env: Env): Promise<Response> {
  const body = asRecord(await readJson(request));
  const refreshToken = requireString(str(body, 'refreshToken'), 'refreshToken');
  const config = readSessionConfig(env);
  const now = Date.now();

  const tokenHash = await sha256Hex(refreshToken);
  const record = await db.findRefreshToken(env.DB, tokenHash);

  if (!record || record.expires_at <= now) {
    throw Errors.unauthorized('登录已失效，请重新登录', 'REFRESH_TOKEN_INVALID');
  }

  const user = await db.getUserById(env.DB, record.user_id);
  if (!user || !user.is_active) {
    throw Errors.unauthorized('账号不可用，请重新登录', 'REFRESH_TOKEN_INVALID');
  }

  const accessToken = await signAccessToken(user.id, config.jwtSecret, config.accessTokenTtl);


  await db.touchRefreshToken(env.DB, tokenHash, now, now + config.refreshTokenTtl * 1000);

  return ok({
    accessToken,
    expiresIn: config.accessTokenTtl,
    user: toPublicUser(user),
  });
}

/**
 * 登出
 *
 * 刻意**不要求 access token 有效** —— 否则 access 刚好过期时用户连登出都做不到，
 * 那就退化回旧版「必须手动退出再登录」的糟糕体验了。
 * 谁能出示 refresh token，谁就有权把它作废。
 *
 * body: { refreshToken?: string, all?: boolean }
 *   all = true 时作废该用户全部设备（需要 access token 证明身份）
 */
export async function logout(request: Request, env: Env): Promise<Response> {
  const body = await readOptionalJson(request);
  const all = body['all'] === true;

  if (all) {
    const userId = await requireUserId(request, env);
    await db.deleteUserRefreshTokens(env.DB, userId);
    return ok({ loggedOut: true, scope: 'all' });
  }

  const refreshToken = str(body, 'refreshToken');
  if (refreshToken) {
    await db.deleteRefreshToken(env.DB, await sha256Hex(refreshToken));
  }

  return ok({ loggedOut: true, scope: 'single' });
}

/** 登出请求体允许为空 */
async function readOptionalJson(request: Request): Promise<Record<string, unknown>> {
  try {
    return asRecord(await request.json());
  } catch {
    return {};
  }
}

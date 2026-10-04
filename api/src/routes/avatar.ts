import * as db from '../db/queries';
import { base64ToBytes } from '../lib/encoding';
import { Errors } from '../lib/errors';
import { ok } from '../lib/response';
import { toPublicUser } from '../lib/serialize';
import { asRecord, readJson, str } from '../lib/validate';
import { requireUserId } from '../middleware/auth';



/** 客户端压完大约 30–50KB。留足余量，超了基本就是没压或者有人在乱传 */
const MAX_AVATAR_BYTES = 400 * 1024;

function detectImageMime(bytes: Uint8Array): string | null {

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  return null;
}

function avatarKey(userId: string, version: number): string {
  return `avatar:${userId}:${version}`;
}

/** POST /api/user/avatar —— 上传（base64 JSON） */
export async function upload(request: Request, env: Env): Promise<Response> {
  const userId = await requireUserId(request, env);
  const body = asRecord(await readJson(request));
  const encoded = str(body, 'data');

  if (!encoded) throw Errors.badRequest('缺少头像数据', 'AVATAR_DATA_MISSING');

  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(encoded);
  } catch {
    throw Errors.badRequest('头像数据不是合法的 base64', 'AVATAR_DATA_INVALID');
  }

  if (bytes.length === 0) throw Errors.badRequest('头像数据是空的', 'AVATAR_DATA_INVALID');
  if (bytes.length > MAX_AVATAR_BYTES) {
    throw Errors.badRequest('图片太大了，请重新选择', 'AVATAR_TOO_LARGE');
  }

  const mime = detectImageMime(bytes);
  if (!mime) throw Errors.badRequest('只支持 JPG 或 PNG 图片', 'AVATAR_FORMAT_UNSUPPORTED');

  const current = await db.getUserById(env.DB, userId);
  if (!current) throw Errors.unauthorized('账号不存在，请重新登录', 'USER_NOT_FOUND');

  const version = Date.now();

  await env.AVATARS.put(avatarKey(userId, version), bytes, { metadata: { mime } });
  await db.updateUserAvatar(env.DB, userId, version, version);


  if (current.avatar_version > 0) {
    try {
      await env.AVATARS.delete(avatarKey(userId, current.avatar_version));
    } catch (error) {
      console.error('[avatar] 删除旧版本失败，忽略', error);
    }
  }

  const updated = await db.getUserById(env.DB, userId);
  return ok({ user: updated ? toPublicUser(updated) : null });
}

/** DELETE /api/user/avatar —— 清掉头像，回到默认的「色块 + 首字母」 */
export async function remove(request: Request, env: Env): Promise<Response> {
  const userId = await requireUserId(request, env);

  const current = await db.getUserById(env.DB, userId);
  if (!current) throw Errors.unauthorized('账号不存在，请重新登录', 'USER_NOT_FOUND');

  if (current.avatar_version > 0) {
    try {
      await env.AVATARS.delete(avatarKey(userId, current.avatar_version));
    } catch (error) {
      console.error('[avatar] 删除 KV 对象失败，忽略', error);
    }
  }

  await db.clearUserAvatar(env.DB, userId, Date.now());

  const updated = await db.getUserById(env.DB, userId);
  return ok({ user: updated ? toPublicUser(updated) : null });
}

/**
 * GET /api/avatar/<userId>?v=<版本号> —— 输出图片字节
 *
 * **不要求 token**：头像是公开信息（别人看你的资料时要能显示），
 * 而且少一次鉴权就少一次开销。版本号是毫秒时间戳，不可猜；即使猜到，
 * 看到的也只是对方本来就公开的头像。
 */
export async function serve(request: Request, env: Env, userId: string): Promise<Response> {
  const raw = new URL(request.url).searchParams.get('v');
  let version = raw && /^\d+$/.test(raw) ? Number(raw) : 0;


  if (!version) {
    const user = await db.getUserById(env.DB, userId);
    version = user?.avatar_version ?? 0;
  }
  if (!version) throw Errors.notFound('头像不存在', 'AVATAR_NOT_FOUND');

  const { value, metadata } = await env.AVATARS.getWithMetadata<{ mime?: string }>(
    avatarKey(userId, version),
    'arrayBuffer',
  );
  if (!value) throw Errors.notFound('头像不存在', 'AVATAR_NOT_FOUND');

  return new Response(value, {
    headers: {
      'Content-Type': metadata?.mime ?? 'image/jpeg',

      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

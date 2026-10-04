import * as db from '../db/queries';
import type { ProfileColumn } from '../db/queries';
import { Errors } from '../lib/errors';
import { ok } from '../lib/response';
import { toPublicUser } from '../lib/serialize';
import { asRecord, readJson } from '../lib/validate';
import { requireUserId } from '../middleware/auth';



/**
 * 客户端字段名 → 数据库列名，同时充当白名单
 *
 * ⚠️ 头像是服务端管的：客户端只能走 `POST /api/user/avatar` 上传，
 * 不能自己传 `avatarUrl` / `avatarVersion` 之类的字段。
 */
const PROFILE_FIELDS: ReadonlyArray<readonly [string, ProfileColumn]> = [
  ['nickname', 'nickname'],
  ['avatarId', 'avatar_id'],
  ['bio', 'bio'],
  ['gender', 'gender'],
  ['birthday', 'birthday'],
  ['location', 'location'],
];

/** 各字段长度上限（照抄旧版表单的限制） */
const MAX_LENGTH: Record<string, number> = {
  nickname: 20,
  avatarId: 64,
  bio: 200,
  gender: 10,
  birthday: 20,
  location: 50,
};

export async function getProfile(request: Request, env: Env): Promise<Response> {
  const userId = await requireUserId(request, env);
  const user = await db.getUserById(env.DB, userId);

  if (!user) throw Errors.unauthorized('账号不存在，请重新登录', 'USER_NOT_FOUND');

  return ok({ user: toPublicUser(user) });
}

export async function updateProfile(request: Request, env: Env): Promise<Response> {
  const userId = await requireUserId(request, env);
  const body = asRecord(await readJson(request));

  const patch: Partial<Record<ProfileColumn, string | null>> = {};

  for (const [field, column] of PROFILE_FIELDS) {
    if (!(field in body)) continue;

    const value = body[field];

    if (value === null) {
      patch[column] = null;
      continue;
    }

    if (typeof value !== 'string') {
      throw Errors.badRequest(`${field} 必须是字符串或 null`);
    }

    const trimmed = value.trim();
    const max = MAX_LENGTH[field] ?? 200;
    if (trimmed.length > max) {
      throw Errors.badRequest(`${field} 最多 ${max} 个字符`);
    }

    patch[column] = trimmed.length > 0 ? trimmed : null;
  }

  if (Object.keys(patch).length === 0) {
    throw Errors.badRequest('没有需要更新的字段');
  }

  await db.updateUserProfile(env.DB, userId, patch, Date.now());

  const user = await db.getUserById(env.DB, userId);
  if (!user) throw Errors.unauthorized('账号不存在，请重新登录', 'USER_NOT_FOUND');

  return ok({ user: toPublicUser(user) });
}

import * as db from '../db/queries';
import { Errors } from '../lib/errors';
import { ok } from '../lib/response';
import { toPublicUser } from '../lib/serialize';
import { requireUserId } from '../middleware/auth';



/**
 * GET /api/users
 *
 * 返回**所有**其他用户，不是"聊过天的会话"。
 *
 * 旧版就是这个语义，好处是新人一进来就能看到所有人、直接开聊，
 * 不需要先"加好友"。聊过和没聊过的区分交给前端（按最后消息排序）。
 */
export async function list(request: Request, env: Env): Promise<Response> {
  const userId = await requireUserId(request, env);

  const result = await db.listOtherUsersStatement(env.DB, userId).all<db.UserRow>();
  return ok({ users: (result.results ?? []).map(toPublicUser) });
}

/** GET /api/users/:id —— 某个用户的公开资料 */
export async function detail(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
  await requireUserId(request, env);

  const user = await db.getUserById(env.DB, params.id);
  if (!user) throw Errors.notFound('用户不存在');

  return ok({ user: toPublicUser(user) });
}

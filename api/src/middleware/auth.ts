import { Errors } from '../lib/errors';
import { verifyAccessToken } from '../lib/jwt';

/**
 * 取当前用户 id。
 *
 * 纯验签，不查库 —— 所以这里对每个业务请求都是「零存储成本」。
 * 任何失败都返回 401：客户端的约定是「见到 401 就去换 access 再重放一次」，
 * 所以这里不需要区分「没带头」还是「签名过期」，那只会让客户端多写分支。
 */
export async function requireUserId(request: Request, env: Env): Promise<string> {
  const header = request.headers.get('Authorization');
  if (!header || !header.startsWith('Bearer ')) {
    throw Errors.unauthorized('缺少登录凭证', 'UNAUTHORIZED');
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    throw Errors.unauthorized('缺少登录凭证', 'UNAUTHORIZED');
  }

  const userId = await verifyAccessToken(token, env.JWT_SECRET);
  if (!userId) {
    throw Errors.unauthorized('登录已失效，请重新登录', 'TOKEN_INVALID');
  }

  return userId;
}

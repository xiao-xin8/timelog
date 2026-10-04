import { purgeExpiredTokens, purgeTombstones } from './db/queries';
import { Errors, toAppError } from './lib/errors';
import { fail, ok, preflight } from './lib/response';
import * as authRoutes from './routes/auth';
import * as avatarRoutes from './routes/avatar';
import * as chatRoutes from './routes/chat';
import * as storyRoutes from './routes/story';
import * as syncRoutes from './routes/sync';
import * as userRoutes from './routes/user';
import * as usersRoutes from './routes/users';



/**
 * 带参数的路由
 *
 * 下面的 `switch` 只能精确匹配，而故事有 5 个带 `:id` 的路径。
 * 与其给每一条都写一段 `startsWith`，不如列一张表 + 一个极简的模式匹配。
 *
 * 匹配规则只支持一种通配：**`:` 开头的整段**。够用了，别引框架。
 */
const PARAM_ROUTES: Array<{
  method: string;
  pattern: string;
  handler(request: Request, env: Env, params: Record<string, string>): Promise<Response>;
}> = [
  { method: 'GET', pattern: '/api/stories/:id', handler: storyRoutes.detail },

  { method: 'GET', pattern: '/api/stories/:id/detail', handler: storyRoutes.detailWithComments },
  { method: 'DELETE', pattern: '/api/stories/:id', handler: storyRoutes.remove },
  { method: 'POST', pattern: '/api/stories/:id/like', handler: storyRoutes.toggleLike },
  { method: 'GET', pattern: '/api/stories/:id/comments', handler: storyRoutes.listComments },
  { method: 'POST', pattern: '/api/stories/:id/comment', handler: storyRoutes.addComment },

  { method: 'DELETE', pattern: '/api/stories/comments/:id', handler: storyRoutes.removeComment },
  { method: 'GET', pattern: '/api/users/:id', handler: usersRoutes.detail },
];

/**
 * 把 `/api/stories/:id/like` 这种模式套到实际路径上。
 *
 * 段数必须一致，`:xxx` 段吃掉任意非空值（空的 `:id` 不算匹配，
 * 否则 `/api/stories//like` 会被当成 id 为空的故事）。
 */
function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const patternParts = pattern.split('/');
  const pathParts = pathname.split('/');
  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};

  for (let i = 0; i < patternParts.length; i += 1) {
    const segment = patternParts[i];

    if (segment.startsWith(':')) {
      const value = decodeURIComponent(pathParts[i]);
      if (!value) return null;
      params[segment.slice(1)] = value;
      continue;
    }

    if (segment !== pathParts[i]) return null;
  }

  return params;
}

/** 墓碑保留 30 天：给长期离线的设备留出同步窗口 */
const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * 用 `${method} ${path}` 字符串做路由键。
 *
 * 不用框架：8 个接口，一个 switch 就写完，少一层抽象、少一份依赖。
 */
async function handle(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);


  const AVATAR_PREFIX = '/api/avatar/';
  if (request.method === 'GET' && pathname.startsWith(AVATAR_PREFIX)) {
    const userId = decodeURIComponent(pathname.slice(AVATAR_PREFIX.length));
    if (userId) return await avatarRoutes.serve(request, env, userId);
  }


  for (const route of PARAM_ROUTES) {
    if (route.method !== request.method) continue;

    const params = matchPath(route.pattern, pathname);
    if (params) return await route.handler(request, env, params);
  }

  switch (`${request.method} ${pathname}`) {
    case 'GET /api/health':
      return ok({ service: 'timelog-api', time: new Date().toISOString() });

    case 'POST /api/auth/register':
      return await authRoutes.register(request, env);
    case 'POST /api/auth/login':
      return await authRoutes.login(request, env);
    case 'POST /api/auth/refresh':
      return await authRoutes.refresh(request, env);
    case 'POST /api/auth/logout':
      return await authRoutes.logout(request, env);

    case 'GET /api/sync':
      return await syncRoutes.pull(request, env);
    case 'POST /api/sync':
      return await syncRoutes.push(request, env);

    case 'GET /api/users':
      return await usersRoutes.list(request, env);


    case 'GET /api/chat/stats':
      return await chatRoutes.stats(request, env);

    case 'GET /api/chat/overview':
      return await chatRoutes.overview(request, env);
    case 'GET /api/chat/room':
      return await chatRoutes.room(request, env);
    case 'GET /api/chat/messages':
      return await chatRoutes.listMessages(request, env);
    case 'POST /api/chat/messages':
      return await chatRoutes.sendMessage(request, env);
    case 'DELETE /api/chat/messages':
      return await chatRoutes.clearMessages(request, env);
    case 'GET /api/chat/online':
      return await chatRoutes.online(request, env);
    case 'GET /api/chat/ws':
      return await chatRoutes.socket(request, env);

    case 'GET /api/user':
      return await userRoutes.getProfile(request, env);
    case 'PUT /api/user':
      return await userRoutes.updateProfile(request, env);
    case 'POST /api/user/avatar':
      return await avatarRoutes.upload(request, env);
    case 'DELETE /api/user/avatar':
      return await avatarRoutes.remove(request, env);


    case 'GET /api/stories':
      return await storyRoutes.list(request, env);
    case 'POST /api/stories':
      return await storyRoutes.publish(request, env);
    case 'POST /api/stories/delete-batch':
      return await storyRoutes.removeBatch(request, env);

    default:
      throw Errors.notFound();
  }
}


export { ChatHub } from './chat/ChatHub';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return preflight();
    }

    try {


      return await handle(request, env);
    } catch (error) {
      return fail(toAppError(error));
    }
  },

  /** 定时维护（wrangler.toml 里的 [triggers] 配的是每天一次） */
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runMaintenance(env));
  },
} satisfies ExportedHandler<Env>;

async function runMaintenance(env: Env): Promise<void> {
  try {
    const expiredTokens = await purgeExpiredTokens(env.DB);
    const tombstones = await purgeTombstones(env.DB, Date.now() - TOMBSTONE_TTL_MS);
    console.log(`[maintenance] 清理过期会话 ${expiredTokens} 条 / 过期墓碑 ${tombstones} 条`);
  } catch (error) {

    console.error('[maintenance] 清理失败', error);
  }
}

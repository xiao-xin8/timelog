/**
 * 接口缓存的**纯策略**（Slice 15）
 *
 * 这里只有"怎么算"，没有"存哪儿"—— 落盘、内存、去重那些都在
 * `services/httpCache.ts`。这么拆是为了能脱离 RN 运行时直接测
 * （`npm run verify:slice15`）。
 */

/**
 * 缓存档位
 *
 * ⚠️ 档位是"给这一类数据定的"，不是"给这个接口定的" —— 同一个接口的不同分页
 * 可能用不同档（比如故事列表只缓存第一页）。
 */
export type CacheTier =

  | 'realtime'
  /**
   * 15 秒：挡"来回切页面 / 狂点"。
   *
   * **只给未读数（`/chat/stats`）用** —— 红点晚 15 秒还能接受，再长就明显了。
   */
  | 'short'
  /**
   * 2 分钟：**内容列表类**（故事列表 / 第一页评论 / 故事详情 / 会话摘要）。
   *
   * 这一档是用户明确要求的（"故事列表至少缓存 2 分钟"），
   * 单独立一档是因为它和未读数**需求正好相反**：
   * 列表 2 分钟不刷新完全无所谓，红点 2 分钟不刷新就是 bug。
   * 早先两者共用 `short`，只能二选一，怎么调都不对。
   */
  | 'list'
  /** 10 分钟：变化很慢的东西（他人资料） */
  | 'normal'
  /** 30 分钟：几乎不变的目录类数据（用户列表） */
  | 'long'
  /** 24 小时：留给将来的版本信息、用户协议之类 */
  | 'day';

/** 各档的存活时长（毫秒）。0 = 不缓存 */
export const TIER_TTL_MS: Record<CacheTier, number> = {
  realtime: 0,
  short: 15_000,
  list: 2 * 60_000,
  normal: 10 * 60_000,
  long: 30 * 60_000,
  day: 24 * 60 * 60_000,
};

/**
 * 落盘格式版本号
 *
 * 以后改了 `CacheEntry` 的结构就把它 +1：旧数据会被整体丢弃，
 * 而不是让新代码去啃一个结构对不上的对象。
 */
export const CACHE_FORMAT_VERSION = 1;

/**
 * 拼缓存键
 *
 * **必须带 `owner`**（当前登录用户 id）：否则换账号之后会命中上一个账号的数据。
 * `path` 用已经拼好查询串的完整路径，这样不同分页/不同过滤条件天然是不同键。
 */
export function makeCacheKey(owner: string | null, path: string): string {
  return `${owner ?? 'anon'}:${path}`;
}

/** 这一档要不要缓存结果（`realtime` 只做去重，不留结果） */
export function isCacheable(tier: CacheTier): boolean {
  return TIER_TTL_MS[tier] > 0;
}

/** 没过期？`expireAt` 是绝对时间戳 */
export function isFresh(expireAt: number, now: number): boolean {
  return expireAt > now;
}

/**
 * 失效用的前缀匹配（**按路径段**，不是裸 `startsWith`）
 *
 * 用前缀而不是精确匹配，是因为路径里带查询串（`/chat/messages?targetUserId=x`）
 * 和路径参数（`/stories/:id/comments`）—— 逐个精确列出太容易漏，
 * 漏了就是"改完看不到"这种最难查的问题。
 *
 * ⚠️ 但**不能直接 `path.startsWith(prefix)`**：那样 `/user` 会匹配上 `/userx`
 * 这种半截段（现在是 `/users`，看着"正好想要"，其实纯属巧合，将来加个
 * `/usernames` 之类就会误伤）。
 *
 * 规则：路径要么**正好等于**前缀，要么在它后面紧跟 `/` 或 `?`。
 *
 * ```
 * pathMatchesPrefix('/users/abc', '/users')  → true   （子路径）
 * pathMatchesPrefix('/stories?page=1', '/stories') → true（查询串）
 * pathMatchesPrefix('/users', '/user')      → false  （半截段，不匹配）
 * ```
 *
 * 所以想一次盖住"自己的资料 + 用户目录"要写成两个前缀：
 * `invalidate('/user', '/users')`。
 */
export function pathMatchesPrefix(path: string, prefix: string): boolean {
  if (!path.startsWith(prefix)) return false;

  const rest = path.slice(prefix.length);
  return rest === '' || rest.startsWith('/') || rest.startsWith('?');
}

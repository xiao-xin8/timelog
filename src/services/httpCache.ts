import { STORAGE_KEYS } from '../constants/storageKeys';
import {
  CACHE_FORMAT_VERSION,
  TIER_TTL_MS,
  isFresh,
  makeCacheKey,
  pathMatchesPrefix,
  type CacheTier,
} from '../utils/httpCachePolicy';
import { request } from './api';
import { loadJSON, removeKey, saveJSON } from './storage';

/**
 * 全局接口缓存（Slice 15）
 *
 * ## 它解决什么
 *
 * 「进页面就请求一次」的弱实时接口（用户目录、他人资料、故事详情…）在本地命中，
 * 直接不发请求。另外顺带做了 **同一请求去重**：并发/连点只真的发一次。
 *
 * ## 它放在哪一层
 *
 * ```
 * 页面 / store
 *    └─ services/chat.ts · story.ts     ← 改用 cachedGet
 *         └─ services/httpCache.ts      ← 这里：缓存 + 去重 + 失效
 *              └─ services/api.ts       ← 不动（token、401 刷新、错误处理都还在它那儿）
 * ```
 *
 * 之所以不塞进 `api.ts`：那一层是"每个请求都必须走"的地基（401 → 刷新 → 重放），
 * 缓存是"某些请求可以不走网络"的策略。混在一起会让刷新逻辑变得难以推理。
 *
 * ## 明确不做的事
 *
 * - ❌ **不做后台定时刷新、不做 stale-while-revalidate 自动回源**。
 *   项目原则是「数据上下行只由用户操作驱动」；缓存只负责"少发一次"，
 *   不负责"偷偷帮你刷一次"。要刷新由用户动作触发（进页面 / 下拉 / focus）。
 * - ❌ **不缓存聊天记录和在线状态**。聊天记录那个接口的语义是
 *   「拉取时顺手把对方发来的标成已读」（见 `api/src/routes/chat.ts`），
 *   缓存命中 = 请求没发出去 = 对方的"已读"永远标不上。这是硬性禁止，
 *   连去重都不做（去重可能让 WS 推来新消息后的那次重拉拿到同一份旧响应）。
 * - ❌ **不缓存写接口的响应**，只用它们来失效。
 *
 * ## 两级缓存
 *
 * | 层 | 存哪 | 作用 |
 * |---|---|---|
 * | L1 | 模块级 `Map` | 同一会话内命中（切 tab、返回再进） |
 * | L2 | AsyncStorage | **冷启动**也命中（只有 `persist: true` 的才写） |
 */

interface CacheEntry {
  /** 原始 path（失效时按它做前缀匹配，不带 owner） */
  path: string;
  value: unknown;
  /** 绝对过期时间戳 */
  expireAt: number;
}

interface DiskShape {
  v: number;
  entries: Record<string, CacheEntry>;
}

export interface CachedGetOptions {
  tier: CacheTier;
  /** 是否落盘（只有冷启动也该命中的数据才需要） */
  persist?: boolean;
  /**
   * 强制绕开缓存（下拉刷新、脏标记刷新、错误重试用）。
   *
   * 注意：**绕开缓存不等于不合并** —— 如果已经有一个同样的请求在飞，
   * 依然会复用它（那份数据是新鲜的）。
   */
  force?: boolean;
}



/** L1：内存缓存（同时承载从 L2 读上来的条目） */
const memory = new Map<string, CacheEntry>();

/** 应该在落盘里保留的键（从 L2 读上来的 + 新写入 persist 的） */
const persistedKeys = new Set<string>();

/** 正在飞的请求，按 key 去重 */
const inflight = new Map<string, Promise<unknown>>();

/** 当前登录用户 id —— 缓存键的一部分，换账号天然不命中 */
let owner: string | null = null;

let diskLoaded = false;
let diskLoading: Promise<void> | null = null;

/** 落盘串行队列：避免并发写把同一个 Storage 键互相覆盖 */
let writeChain: Promise<void> = Promise.resolve();



export function setCacheOwner(userId: string | null): void {
  owner = userId;
}

export function getCacheOwner(): string | null {
  return owner;
}



/**
 * 带缓存的 GET。
 *
 * 命中（L1 或 L2 且未过期）就直接返回，**不发请求**；否则发一次，
 * 并把结果按档位的 TTL 记下来。
 */
export async function cachedGet<T>(path: string, options: CachedGetOptions): Promise<T> {
  const ttl = TIER_TTL_MS[options.tier];


  if (ttl <= 0) return await request<T>(path);

  const key = makeCacheKey(owner, path);

  if (!options.force) {
    const hit = memory.get(key);
    if (hit && isFresh(hit.expireAt, Date.now())) return hit.value as T;


    if (options.persist) {
      await ensureDiskLoaded();
      const fromDisk = memory.get(key);
      if (fromDisk && isFresh(fromDisk.expireAt, Date.now())) return fromDisk.value as T;
    }
  }


  const existing = inflight.get(key);
  if (existing) return (await existing) as T;

  const pending = request<T>(path)
    .then(value => {
      store(key, path, value, ttl, Boolean(options.persist));
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, pending);
  return await pending;
}



function store(key: string, path: string, value: unknown, ttl: number, persist: boolean): void {
  memory.set(key, { path, value, expireAt: Date.now() + ttl });
  if (persist) {
    persistedKeys.add(key);
    scheduleDiskSave();
  }
}

/**
 * 按 **path 前缀** 失效（可一次给多个前缀）。
 *
 * 写操作成功后必须调它，否则就是"改完看不到"：
 *
 * ```
 * invalidate('/chat')              发消息 / 清空会话   → 会话摘要（未读数、最后一条）
 * invalidate('/stories')           点赞 / 评论 / 发布删除 → 列表、详情、评论
 * invalidate('/user', '/users')    改资料 / 换头像      → 自己的资料 + 用户目录里那条
 * ```
 *
 * 注意前缀是**按路径段**匹配的（见 `httpCachePolicy.pathMatchesPrefix`）：
 * `/user` 不会匹配 `/users`，所以上面那两个要分别给。
 *
 * 同步生效（内存立刻清掉），落盘异步补上 —— 调用处不用 await。
 */
export function invalidate(...pathPrefixes: string[]): void {
  let touched = false;

  for (const [key, entry] of memory) {
    if (!pathPrefixes.some(prefix => pathMatchesPrefix(entry.path, prefix))) continue;
    memory.delete(key);
    persistedKeys.delete(key);
    touched = true;
  }

  if (touched) scheduleDiskSave();
}

/** 全清（登录 / 登出 / 登录态失效时调） */
export async function clearHttpCache(): Promise<void> {
  memory.clear();
  persistedKeys.clear();
  inflight.clear();
  await removeKey(STORAGE_KEYS.HTTP_CACHE);
}



async function ensureDiskLoaded(): Promise<void> {
  if (diskLoaded) return;
  if (diskLoading) return await diskLoading;

  diskLoading = (async () => {
    const shape = await loadJSON<DiskShape | null>(STORAGE_KEYS.HTTP_CACHE, null);


    if (!shape || shape.v !== CACHE_FORMAT_VERSION) {
      diskLoaded = true;
      return;
    }

    const now = Date.now();
    for (const [key, entry] of Object.entries(shape.entries ?? {})) {
      if (!entry || !isFresh(entry.expireAt, now)) continue;
      memory.set(key, entry);
      persistedKeys.add(key);
    }

    diskLoaded = true;
  })();

  try {
    await diskLoading;
  } finally {
    diskLoading = null;
  }
}

/** 排队落盘：多次调用会串成一条链，不会并发写同一个键 */
function scheduleDiskSave(): void {
  writeChain = writeChain.then(saveDiskNow).catch(() => {
    // 落盘失败不影响内存缓存，下次写入再试
  });
}

async function saveDiskNow(): Promise<void> {
  if (persistedKeys.size === 0) {
    await removeKey(STORAGE_KEYS.HTTP_CACHE);
    return;
  }

  const now = Date.now();
  const entries: Record<string, CacheEntry> = {};

  for (const key of persistedKeys) {
    const entry = memory.get(key);
    if (!entry) continue;
    if (!isFresh(entry.expireAt, now)) continue;
    entries[key] = entry;
  }

  await saveJSON<DiskShape>(STORAGE_KEYS.HTTP_CACHE, {
    v: CACHE_FORMAT_VERSION,
    entries,
  });
}

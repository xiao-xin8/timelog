import { STORAGE_KEYS } from '../constants/storageKeys';
import type { CategoryItem, EventItem } from '../types/event';
import {
  emptyPending,
  extractSyncPayload,
  isPendingEmpty,
  markCategoryDelete,
  markCategoryUpsert,
  markEventDelete,
  markEventUpsert,
  pendingCount,
  toPushBody,
  type PendingChanges,
  type SyncOutcome,
  type SyncPayload,
} from '../utils/syncQueue';
import { ApiError, hasRefreshToken, requestRaw } from './api';
import { loadJSON, loadString, removeKey, saveJSON, saveString } from './storage';



/** 本地改动攒多久合并成一次推送 */
const SYNC_DEBOUNCE_MS = 3000;



/** 上次同步到的水位，作为下次的 `since` */
let since = 0;

/** 待推送的改动 */
let pending: PendingChanges = emptyPending();

/** 上次同步所属的用户 id，用来识别"换了账号" */
let ownerId: string | null = null;

/** 把云端 delta 应用到本地数据的回调，由 store 层注册 */
let applier: RemoteApplier | null = null;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/** 正在跑的那次同步；同一时刻只允许一次，避免打乱水位 */
let inflight: Promise<SyncOutcome> | null = null;

/** 同步途中又有新改动 → 跑完再补一轮 */
let rerun = false;



/**
 * 应用云端增量之后，回报「事件 / 分类各**真的**改了几条」。
 *
 * 为什么不在这里自己数：要算"真的改了几条"必须跟本地数据逐条比对，
 * 而本地数据在 store 里 —— 同步层不认识 store（见文件头注释）。
 * 所以交给 store 自己算完带回来。
 */
export interface AppliedCounts {
  events: number;
  categories: number;
}

type RemoteApplier = (payload: SyncPayload) => Promise<AppliedCounts> | AppliedCounts;

/**
 * 注册"如何把云端结果写回本地"。
 *
 * 由 `store/useSyncStore` 在模块加载时注册一次，指向两个数据 store 的
 * `applyRemote`。同步层本身不 import 任何 store（见文件头注释）。
 */
export function setRemoteApplier(fn: RemoteApplier): void {
  applier = fn;
}

/** 当前待推送的改动条数 */
export function getPendingCount(): number {
  return pendingCount(pending);
}

/** 上次同步所属的用户 id（换账号检测用） */
export function getSyncOwner(): string | null {
  return ownerId;
}

export function setSyncOwner(userId: string): void {
  ownerId = userId;
  void saveString(STORAGE_KEYS.SYNC_OWNER, userId);
}



/**
 * 冷启动读一次持久化状态。
 *
 * ⚠️ 必须在 `useAuthStore.load()` **之前**完成 —— 登录态一恢复就可能触发同步，
 * 那时候队列和水位得已经在内存里了。
 */
export async function initSync(): Promise<void> {
  since = await loadJSON<number>(STORAGE_KEYS.SYNC_SEQ, 0);
  pending = await loadJSON<PendingChanges>(STORAGE_KEYS.SYNC_PENDING, emptyPending());
  ownerId = await loadString(STORAGE_KEYS.SYNC_OWNER);
}

/**
 * 清空同步状态（登出时调）。
 *
 * 水位归零 = 下次登录会**全量拉一次**，这正是想要的：
 * 换了账号就该以云端为准。
 *
 * `ownerId` 故意留着 —— 它是"上一个账号是谁"的记忆，
 * 下次登录时靠它判断要不要清掉本地残留数据。
 */
export async function resetSync(): Promise<void> {
  since = 0;
  pending = emptyPending();

  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  await Promise.all([
    removeKey(STORAGE_KEYS.SYNC_SEQ),
    removeKey(STORAGE_KEYS.SYNC_PENDING),
  ]);
}



/**
 * 记一条事件改动。
 *
 * 页面/store 只管调这个，**不要直接发请求** —— 合并成一次 POST 是省额度的关键。
 */
export function queueEventUpsert(event: EventItem): void {
  pending = markEventUpsert(pending, event);
  void persistPending();
  scheduleSync();
}

export function queueEventDelete(id: string): void {
  pending = markEventDelete(pending, id);
  void persistPending();
  scheduleSync();
}

export function queueCategoryUpsert(category: CategoryItem): void {
  pending = markCategoryUpsert(pending, category);
  void persistPending();
  scheduleSync();
}

export function queueCategoryDelete(key: string): void {
  pending = markCategoryDelete(pending, key);
  void persistPending();
  scheduleSync();
}

async function persistPending(): Promise<void> {
  await saveJSON(STORAGE_KEYS.SYNC_PENDING, pending);
}



/**
 * 防抖：3 秒内的 N 次改动合并成一次同步。
 *
 * 用户连续编辑多个事件（或者 AddEvent 里保存一次触发多个字段变更），
 * 都只会走一次网络。
 */
export function scheduleSync(delay = SYNC_DEBOUNCE_MS): void {
  if (debounceTimer) clearTimeout(debounceTimer);

  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void runSync().catch(() => {
      // 后台静默失败：队列原样留着，下次再推
    });
  }, Math.max(0, delay));
}

/** 取消防抖、立刻同步一次（手动点同步时用） */
export async function flushSync(): Promise<SyncOutcome> {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  return await runSync();
}

/** 什么都没发生（未登录 / 304 / 本地没改动且云端也没变） */
const NOTHING: SyncOutcome = { pushed: 0, pulled: 0 };

/**
 * 同步一次，并如实报告干了什么。
 *
 * 未登录直接返回空结果（静默跳过、不报错）—— 未登录时的增删改只需要落本地，
 * 等登录后整体同步上去。
 */
export async function runSync(): Promise<SyncOutcome> {
  if (inflight) {

    rerun = true;
    return inflight;
  }

  inflight = execute().finally(() => {
    inflight = null;
  });

  try {
    return await inflight;
  } finally {
    if (rerun) {
      rerun = false;
      void runSync().catch(() => {});
    }
  }
}

async function execute(): Promise<SyncOutcome> {
  if (!hasRefreshToken()) return NOTHING;

  if (isPendingEmpty(pending)) return await pullOnly();
  return await pushPending();
}



/**
 * 只拉不推。
 *
 * 后端在没有变化时回 **304**，那一路只读了一行 `user_state`。
 * 所以"点一下同步、结果什么都没变"这件事几乎不花额度。
 */
async function pullOnly(): Promise<SyncOutcome> {
  const response = await requestRaw(`/sync?since=${since}`, { method: 'GET' });

  if (response.status === 304) return NOTHING;

  if (response.status !== 200) {
    throw new ApiError('SYNC_FAILED', '同步失败，请稍后重试', response.status);
  }

  const payload = extractSyncPayload(response.data);
  if (!payload) {
    throw new ApiError('SYNC_BAD_RESPONSE', '服务器返回的数据看不懂，请稍后重试', response.status);
  }

  const applied = await applyPayload(payload);
  await commitSince(payload.seq);


  return { pushed: 0, pulled: applied.events + applied.categories };
}

/**
 * 推本地改动 —— 顺带把别人的改动拉回来。
 *
 * 服务端返回的是「自 `since` 以来的**全部**变化」，**包含刚上传的这批自己**。
 * 这是故意的：合并完之后客户端才能安全地把水位推到 `seq`。要是只回别人的改动，
 * 客户端会以为"我已经有到 seq 的全量数据了"，从而漏掉其他设备在它编辑期间写的东西。
 */
async function pushPending(): Promise<SyncOutcome> {

  const pushed = pendingCount(pending);

  const body = toPushBody(pending, since);
  const response = await requestRaw('/sync', { method: 'POST', body });

  if (response.status !== 200) {
    throw new ApiError('SYNC_FAILED', '同步失败，请稍后重试', response.status);
  }

  const payload = extractSyncPayload(response.data);
  if (!payload) {
    throw new ApiError('SYNC_BAD_RESPONSE', '服务器返回的数据看不懂，请稍后重试', response.status);
  }


  const applied = await applyPayload(payload);

  pending = emptyPending();
  await Promise.all([
    saveJSON(STORAGE_KEYS.SYNC_PENDING, pending),
    commitSince(payload.seq),
  ]);

  return { pushed, pulled: applied.events + applied.categories };
}

async function applyPayload(payload: SyncPayload): Promise<AppliedCounts> {

  if (!applier) return { events: 0, categories: 0 };
  return await applier(payload);
}

/** 水位只涨不跌 —— 万一服务端返回了小于当前的值，不回退 */
async function commitSince(next: number): Promise<void> {
  since = Math.max(since, next);
  await saveJSON(STORAGE_KEYS.SYNC_SEQ, since);
}

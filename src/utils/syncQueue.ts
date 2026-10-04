import type { AuthUser } from '../services/api';
import type { CategoryItem, EventItem } from '../types/event';
import { formatRelativeTime } from './time';





/**
 * 单调递增的同步水位
 *
 * 后端每写一条记录就 +1（每个用户独立计数）。客户端存下最大那个，
 * 下次当 `since` 传回去，服务端只回 `seq > since` 的记录 —— 这就是增量同步。
 *
 * **不用时间戳做游标**：设备时钟不准（手动改时间、时区、夏令时）会让游标
 * 跳到未来，那一整段时间的改动就永远同步不下来了。
 */
export type SyncSeq = number;

/** 一个集合的增量：要更新的 + 要删除的 */
export interface SyncDelta<T> {
  upsert: T[];
  /** 被删除的 id（服务端存的是墓碑，不是真删） */
  delete: string[];
}

/** `GET /api/sync` 与 `POST /api/sync` 的响应体 */
export interface SyncPayload {
  seq: SyncSeq;
  events: SyncDelta<EventItem>;
  categories: SyncDelta<CategoryItem>;
  /** 资料变了才带；没变时服务端仍会带上（一次 batch 顺路读的） */
  user: AuthUser | null;
}

/**
 * 待推送的改动
 *
 * ## 为什么存「数据快照」而不是只存 id
 *
 * 只存 id 的话，推送时得反过来去 store 里捞数据，同步层就要认识两个 store，
 * 依赖方向会变成环（store → sync → store）。
 *
 * 存快照则完全相反：**改动发生时就地取一份数据放进来**，
 * 同步层只认这个队列，对 store 一无所知。同一 id 改多次只留最后一次
 * （`Record` 的天然语义），队列不会无限膨胀。
 *
 * ## 为什么不存"改动日志"
 *
 * 不需要。后端是**后写覆盖**，不是按操作回放。
 */
export interface PendingChanges {
  events: {
    /** id → 事件快照 */
    upsert: Record<string, EventItem>;
    /** 待删除的事件 id */
    delete: string[];
  };
  categories: {
    /** key → 分类快照 */
    upsert: Record<string, CategoryItem>;
    delete: string[];
  };
}

/** `POST /api/sync` 的请求体 */
export interface PushBody {
  since: SyncSeq;
  events: SyncDelta<EventItem>;
  categories: SyncDelta<CategoryItem>;
}

/**
 * 一次同步到底干了什么
 *
 * 手动同步之后只回一句「同步成功」等于什么都没说 —— 什么都没变也是"成功"，
 * 上传了 20 条也是"成功"，用户没法判断到底同没同。
 */
export interface SyncOutcome {
  /** 本次上传了几项本地改动（事件 + 分类，含删除） */
  pushed: number;
  /**
   * 云端**真的**带回来几项变化
   *
   * 注意不是 `delta.upsert.length`：`POST /api/sync` 返回的 delta
   * **包含你刚上传的那批自己**，直接数长度会把自己的改动也算成"拉回来的"。
   */
  pulled: number;
}



export function emptyPending(): PendingChanges {
  return {
    events: { upsert: {}, delete: [] },
    categories: { upsert: {}, delete: [] },
  };
}

/**
 * 记一条事件改动（新增或编辑）。
 *
 * 顺带把该 id 从"待删除"里摘掉：先删了又重建、或者先建了又删再建，
 * 只有最后一次操作作数。
 */
export function markEventUpsert(pending: PendingChanges, event: EventItem): PendingChanges {
  return {
    ...pending,
    events: {
      upsert: { ...pending.events.upsert, [event.id]: event },
      delete: pending.events.delete.filter(id => id !== event.id),
    },
  };
}

/**
 * 记一条事件删除。
 *
 * 同时把该 id 从"待更新"里摘掉 —— 否则一次 push 里同一条既 upsert 又 delete，
 * 后端会按顺序执行（先写后删），虽然结果也对，但白写一次、白占一个 seq。
 */
export function markEventDelete(pending: PendingChanges, id: string): PendingChanges {
  const upsert = { ...pending.events.upsert };
  delete upsert[id];

  return {
    ...pending,
    events: {
      upsert,
      delete: pending.events.delete.includes(id)
        ? pending.events.delete
        : [...pending.events.delete, id],
    },
  };
}

export function markCategoryUpsert(
  pending: PendingChanges,
  category: CategoryItem,
): PendingChanges {
  return {
    ...pending,
    categories: {
      upsert: { ...pending.categories.upsert, [category.key]: category },
      delete: pending.categories.delete.filter(key => key !== category.key),
    },
  };
}

export function markCategoryDelete(pending: PendingChanges, key: string): PendingChanges {
  const upsert = { ...pending.categories.upsert };
  delete upsert[key];

  return {
    ...pending,
    categories: {
      upsert,
      delete: pending.categories.delete.includes(key)
        ? pending.categories.delete
        : [...pending.categories.delete, key],
    },
  };
}

export function isPendingEmpty(pending: PendingChanges): boolean {
  return pendingCount(pending) === 0;
}

/** 待推送的改动条数（界面拿它显示"有 N 项待同步"） */
export function pendingCount(pending: PendingChanges): number {
  return (
    Object.keys(pending.events.upsert).length +
    pending.events.delete.length +
    Object.keys(pending.categories.upsert).length +
    pending.categories.delete.length
  );
}

/** 组装 `POST /api/sync` 的请求体 */
export function toPushBody(pending: PendingChanges, since: SyncSeq): PushBody {
  return {
    since,
    events: {
      upsert: Object.values(pending.events.upsert),
      delete: pending.events.delete,
    },
    categories: {
      upsert: Object.values(pending.categories.upsert),
      delete: pending.categories.delete,
    },
  };
}



/**
 * 把云端的事件增量合并进本地列表。
 *
 * 规则：**后写覆盖**（个人多设备够用，不做字段级合并）。
 *   - `delete` 里的 id 直接从本地去掉
 *   - `upsert` 里的条目：本地有同 id 就**原地替换**（保住位置），没有就追加到末尾
 *
 * 存储顺序不是展示顺序（首页会按时间重排、置顶另外拎出来），
 * 所以"追加到末尾"不会让界面看起来乱。
 *
 * 不修改传入数组。
 */
export function mergeEvents(local: EventItem[], delta: SyncDelta<EventItem>): EventItem[] {
  const removed = new Set(delta.delete);
  const next = local.filter(item => !removed.has(item.id));

  for (const incoming of delta.upsert) {
    const index = next.findIndex(item => item.id === incoming.id);
    if (index === -1) {
      next.push(incoming);
    } else {
      next[index] = incoming;
    }
  }

  return next;
}

/** 同 `mergeEvents`，分类的主键是 `key` */
export function mergeCategories(
  local: CategoryItem[],
  delta: SyncDelta<CategoryItem>,
): CategoryItem[] {
  const removed = new Set(delta.delete);
  const next = local.filter(item => !removed.has(item.key));

  for (const incoming of delta.upsert) {
    const index = next.findIndex(item => item.key === incoming.key);
    if (index === -1) {
      next.push(incoming);
    } else {
      next[index] = incoming;
    }
  }

  return next;
}



function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toDelta<T>(value: unknown): SyncDelta<T> {
  if (!isRecord(value)) return { upsert: [], delete: [] };

  const upsert = Array.isArray(value.upsert) ? (value.upsert as T[]) : [];
  const deleted = Array.isArray(value.delete)
    ? value.delete.filter((item): item is string => typeof item === 'string')
    : [];

  return { upsert, delete: deleted };
}

/**
 * 这次合并会**真的**改动本地几条记录。
 *
 * 为什么要单独算：`POST /api/sync` 返回的 delta 包含你刚上传的那批自己
 * （后端故意的，见 `api/README.md`）。直接拿 `upsert.length` 当
 * "从云端拉回来几条"，会把自己的改动也算进去，数字虚高。
 *
 * 这里逐条跟本地比对，只数"本地没有的"和"内容真的不一样的"。
 * 删除同理 —— 本地早就没有的墓碑不算变化。
 *
 * 比较用 `JSON.stringify`：服务端存的就是我们传上去的那份 JSON，
 * 读出来属性顺序一致，所以逐字节相等就是真的没变。
 */
export function countRemoteChanges<T>(
  local: T[],
  delta: SyncDelta<T>,
  keyOf: (item: T) => string,
): number {
  const localMap = new Map(local.map(item => [keyOf(item), item]));
  let changed = 0;

  for (const id of delta.delete) {
    if (localMap.has(id)) changed += 1;
  }

  for (const incoming of delta.upsert) {
    const existing = localMap.get(keyOf(incoming));
    if (existing === undefined || JSON.stringify(existing) !== JSON.stringify(incoming)) {
      changed += 1;
    }
  }

  return changed;
}



/**
 * 同步结果的文案。
 *
 * 四种组合都要说人话，`pushed: 0, pulled: 0` 是最常见的那个
 * （用户手滑点了两下同步）—— 它得显示「数据已是最新」而不是「同步成功」。
 */
export function formatSyncOutcome(outcome: SyncOutcome): string {
  const { pushed, pulled } = outcome;

  if (pushed === 0 && pulled === 0) return '数据已是最新';
  if (pushed > 0 && pulled > 0) return `已上传 ${pushed} 项，云端更新了 ${pulled} 项`;
  if (pushed > 0) return `已上传 ${pushed} 项改动`;
  return `云端更新了 ${pulled} 项`;
}

/**
 * 「上次同步」的文案。
 *
 * 相对时间的算法本身在 `utils/time.ts`（故事列表也要用同一套），
 * 这里只负责"没同步过"这一种情况。
 */
export function formatLastSyncAt(timestamp: number | null, now = Date.now()): string {
  if (!timestamp) return '还没有同步过';
  return formatRelativeTime(timestamp, now);
}

/**
 * 从 `requestRaw` 拿到的原始响应体里抠出同步载荷。
 *
 * 校验每一层的形状，缺什么补什么 —— 后端和客户端是两个独立部署的东西，
 * 版本可能一前一后，宁可当"这一层没有变化"也不要让同步整个抛异常。
 * 返回 null 表示这不是一个能认的响应（调用方按失败处理）。
 */
export function extractSyncPayload(raw: unknown): SyncPayload | null {
  if (!isRecord(raw) || raw.success !== true || !isRecord(raw.data)) return null;

  const data = raw.data;
  const seqRaw = data.seq;

  return {
    seq: typeof seqRaw === 'number' && Number.isFinite(seqRaw) && seqRaw > 0 ? Math.floor(seqRaw) : 0,
    events: toDelta<EventItem>(data.events),
    categories: toDelta<CategoryItem>(data.categories),
    user: isRecord(data.user) ? (data.user as unknown as AuthUser) : null,
  };
}

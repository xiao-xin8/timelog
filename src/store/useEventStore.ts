import { create } from 'zustand';

import { STORAGE_KEYS } from '../constants/storageKeys';
import { queueEventDelete, queueEventUpsert } from '../services/sync';
import { loadJSON, saveJSON } from '../services/storage';
import type { EventItem } from '../types/event';
import { countRemoteChanges, mergeEvents, type SyncDelta } from '../utils/syncQueue';



/** 置顶事件数量上限 */
export const MAX_TOP_EVENTS = 3;

/** 置顶超限时的提示语，与旧版文案完全一致 */
export const TOP_LIMIT_MESSAGE = '置顶事件最多只能有3个';

/** 写操作结果：失败时带原因，交给调用方决定怎么提示 */
export type WriteResult = { ok: true } | { ok: false; reason: string };

interface EventState {
  /** 全量事件（存储顺序，不是展示顺序） */
  events: EventItem[];
  /** 是否已从本地存储读完 */
  loaded: boolean;

  /** 启动时调一次 */
  load(): Promise<void>;
  /** 新增；置顶超限时返回失败 */
  add(event: EventItem): Promise<WriteResult>;
  /** 按 id 局部更新；置顶超限时返回失败 */
  update(id: string, patch: Partial<EventItem>): Promise<WriteResult>;
  /** 删除 */
  remove(id: string): Promise<void>;
  /** 按 id 查 */
  getById(id: string): EventItem | undefined;
  /** 当前置顶数量；传 excludeId 可排除自身（编辑时用） */
  countTop(excludeId?: string): number;
  /** 把某个分类下的事件批量改到另一个分类（删除自定义分类时用） */
  reassignCategory(fromKey: string, toKey: string): Promise<void>;

  /**
   * 同步用：把云端的增量合并进来（**不入队**，否则会自己推自己）
   *
   * 返回「本地真的被改了几条」，同步层拿它拼提示文案。
   */
  applyRemote(delta: SyncDelta<EventItem>): Promise<number>;
  /** 同步用：换了账号，清掉上一个账号残留的本地数据 */
  clearAll(): Promise<void>;
}

/**
 * 计算新事件在数组中的插入位置。
 *
 * 照搬旧版 `add.js` 的规则：
 * - 置顶     → 插到最前面
 * - 普通     → 插到「第一个非置顶事件」之前
 * - 全是置顶 → 追加到末尾
 *
 * 注意这是**存储顺序**，跟首页展示排序（按时间绝对差）是两套独立逻辑。
 */
function insertEvent(list: EventItem[], event: EventItem): EventItem[] {
  if (event.isTop) {
    return [event, ...list];
  }

  const firstNonTopIndex = list.findIndex(item => !item.isTop);
  if (firstNonTopIndex === -1) {
    return [...list, event];
  }

  const next = [...list];
  next.splice(firstNonTopIndex, 0, event);
  return next;
}

export const useEventStore = create<EventState>((set, get) => ({
  events: [],
  loaded: false,

  load: async () => {
    const events = await loadJSON<EventItem[]>(STORAGE_KEYS.EVENTS, []);
    set({ events, loaded: true });
  },

  add: async event => {
    const { events } = get();


    if (event.isTop && get().countTop() >= MAX_TOP_EVENTS) {
      return { ok: false, reason: TOP_LIMIT_MESSAGE };
    }

    const next = insertEvent(events, event);
    set({ events: next });
    await saveJSON(STORAGE_KEYS.EVENTS, next);



    queueEventUpsert(event);

    return { ok: true };
  },

  update: async (id, patch) => {
    const { events } = get();
    const current = events.find(event => event.id === id);
    if (!current) {
      return { ok: false, reason: '事件不存在' };
    }

    const merged: EventItem = { ...current, ...patch };


    if (merged.isTop && get().countTop(id) >= MAX_TOP_EVENTS) {
      return { ok: false, reason: TOP_LIMIT_MESSAGE };
    }


    const rest = events.filter(event => event.id !== id);
    const next = insertEvent(rest, merged);
    set({ events: next });
    await saveJSON(STORAGE_KEYS.EVENTS, next);

    queueEventUpsert(merged);

    return { ok: true };
  },

  remove: async id => {
    const next = get().events.filter(event => event.id !== id);
    set({ events: next });
    await saveJSON(STORAGE_KEYS.EVENTS, next);

    queueEventDelete(id);
  },

  getById: id => get().events.find(event => event.id === id),

  countTop: excludeId =>
    get().events.filter(event => event.isTop && event.id !== excludeId).length,

  reassignCategory: async (fromKey, toKey) => {
    const { events } = get();
    const changed: EventItem[] = [];

    const next = events.map(event => {
      if (event.category !== fromKey) return event;
      const moved = { ...event, category: toKey };
      changed.push(moved);
      return moved;
    });


    if (changed.length === 0) return;

    set({ events: next });
    await saveJSON(STORAGE_KEYS.EVENTS, next);


    for (const event of changed) queueEventUpsert(event);
  },

  applyRemote: async delta => {

    if (!get().loaded) {
      throw new Error('本地事件还没读完，本次同步作废');
    }

    const before = get().events;
    const next = mergeEvents(before, delta);
    set({ events: next });
    await saveJSON(STORAGE_KEYS.EVENTS, next);

    return countRemoteChanges(before, delta, item => item.id);
  },

  clearAll: async () => {
    set({ events: [] });
    await saveJSON(STORAGE_KEYS.EVENTS, []);
  },
}));

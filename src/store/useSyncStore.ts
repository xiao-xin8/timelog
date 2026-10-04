import { create } from 'zustand';

import { STORAGE_KEYS } from '../constants/storageKeys';
import { ApiError } from '../services/api';
import {
  flushSync,
  getSyncOwner,
  initSync,
  resetSync,
  runSync,
  setRemoteApplier,
  setSyncOwner,
} from '../services/sync';
import { loadJSON, saveJSON } from '../services/storage';
import type { SyncOutcome } from '../utils/syncQueue';
import { useAuthStore } from './useAuthStore';
import { useCategoryStore } from './useCategoryStore';
import { useEventStore } from './useEventStore';

/**
 * 云同步的「接线层」（Slice 10）
 *
 * 这里是依赖方向唯一拐弯的地方：
 *
 * ```
 *   useEventStore / useCategoryStore  ──>  services/sync（不认识 store）
 *                                               ↑
 *                                         useSyncStore（两边都认识）
 * ```
 *
 * 它干三件事：
 *   1. 告诉同步引擎「云端结果怎么落到本地」（`setRemoteApplier`）
 *   2. 监听登录态：「变成已登录」就拉一次，「退出登录」就清同步状态
 *   3. 给界面一个可观察的同步状态（同步中 / 上次同步时间 / 错误）
 *
 * 页面**不应该**直接调 `services/sync`，走这里。
 */

export type SyncStatus = 'idle' | 'syncing' | 'error';

interface SyncState {
  status: SyncStatus;
  /** 上次同步成功的时间戳（毫秒） */
  lastSyncAt: number | null;
  error: string | null;

  /** 启动时调一次（会顺带初始化同步引擎） */
  bootstrap(): Promise<void>;
  /** 手动同步：带状态、失败会抛错（界面拿去弹提示）；成功返回干了什么 */
  syncNow(): Promise<SyncOutcome>;
  /** 后台静默同步：不打扰用户 */
  syncQuietly(): Promise<void>;
}

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return '同步失败，请稍后重试';
}

/**
 * 换账号保护。
 *
 * 如果本地数据其实是**上一个账号**的，直接合并会出两件事：本账号看不到自己的数据，
 * 而且上一个账号的事件会被当成本账号的改动推上云端 —— 那是实打实的数据污染。
 *
 * 所以发现 userId 变了就先把本地清空，水位归零，走一次全量拉取。
 * （上一个账号的数据不会丢：它要么在云端，要么从来没同步过 —— 后者本来就不该混进来。）
 */
async function prepareAccount(userId: string): Promise<void> {
  const owner = getSyncOwner();

  if (owner && owner !== userId) {
    await useEventStore.getState().clearAll();
    await useCategoryStore.getState().clearAll();
    await resetSync();
  }

  if (owner !== userId) setSyncOwner(userId);
}



setRemoteApplier(async payload => {

  const events = await useEventStore.getState().applyRemote(payload.events);
  const categories = await useCategoryStore.getState().applyRemote(payload.categories);


  if (payload.user) useAuthStore.getState().applyUser(payload.user);


  return { events, categories };
});



export const useSyncStore = create<SyncState>((set, get) => ({
  status: 'idle',
  lastSyncAt: null,
  error: null,

  bootstrap: async () => {

    await initSync();
    const lastSyncAt = await loadJSON<number | null>(STORAGE_KEYS.LAST_SYNC_TIME, null);
    set({ lastSyncAt });
  },

  syncNow: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return { pushed: 0, pulled: 0 };

    set({ status: 'syncing', error: null });

    try {
      await prepareAccount(user.id);

      const outcome = await flushSync();

      const now = Date.now();
      set({ status: 'idle', lastSyncAt: now });
      await saveJSON(STORAGE_KEYS.LAST_SYNC_TIME, now);

      return outcome;
    } catch (error) {
      set({ status: 'error', error: messageOf(error) });
      throw error;
    }
  },

  syncQuietly: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;


    if (get().status === 'syncing') return;

    try {
      await prepareAccount(user.id);
      await runSync();

      const now = Date.now();
      set({ lastSyncAt: now });
      await saveJSON(STORAGE_KEYS.LAST_SYNC_TIME, now);
    } catch {
      /*
       * 静默失败。
       *
       * 网络不通、服务端抽风都不该弹提示 —— 用户可能正在地铁里记事件，
       * 未推送的改动留在队列里，下次同步会自动重推。
       * 登录态失效（401）由 `services/api.ts` 统一处理，这里不用管。
       */
    }
  },
}));




useAuthStore.subscribe((state, prev) => {

  if (state.status === 'signedIn' && prev.status === 'signedOut') {
    void useSyncStore.getState().syncQuietly();
    return;
  }

  if (state.status !== 'signedIn' && prev.status === 'signedIn') {

    void resetSync();
  }
});

import { create } from 'zustand';

import {
  BUILTIN_CATEGORY_KEYS,
  CATEGORY_NAME_MAX_LENGTH,
  CUSTOM_CATEGORY_PREFIX,
  DEFAULT_CATEGORIES,
  FALLBACK_CATEGORY_KEY,
} from '../constants';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { queueCategoryDelete, queueCategoryUpsert } from '../services/sync';
import { loadJSON, saveJSON } from '../services/storage';
import type { CategoryItem } from '../types/event';
import { countRemoteChanges, mergeCategories, type SyncDelta } from '../utils/syncQueue';
import { useEventStore } from './useEventStore';

/**
 * 分类数据层（Slice 02）
 *
 * 旧项目把自定义分类存在 `custom_categories`，内置 7 个分类是写死在页面里的。
 * 这里统一成「内置 + 自定义」的合成视图 `all`，页面只读 `all` 就行。
 */

export type AddCategoryResult =
  | { ok: true; category: CategoryItem }
  | { ok: false; reason: string };

interface CategoryState {
  /** 用户自建分类 */
  custom: CategoryItem[];
  /** 内置 7 个 + 自定义，供页面直接渲染 */
  all: CategoryItem[];
  loaded: boolean;

  load(): Promise<void>;
  addCategory(name: string, icon: string): Promise<AddCategoryResult>;
  removeCategory(key: string): Promise<void>;
  /** 该分类是否可删除（内置的不行） */
  isRemovable(key: string): boolean;

  /** 同步用：把云端的增量合并进来（**不入队**）；返回真的改了几条 */
  applyRemote(delta: SyncDelta<CategoryItem>): Promise<number>;
  /** 同步用：换了账号，清掉上一个账号残留的自定义分类 */
  clearAll(): Promise<void>;
}

/** 把内置与自定义合并成完整列表 */
function buildAll(custom: CategoryItem[]): CategoryItem[] {
  return [...DEFAULT_CATEGORIES, ...custom];
}

export const useCategoryStore = create<CategoryState>((set, get) => ({
  custom: [],
  all: buildAll([]),
  loaded: false,

  load: async () => {
    const custom = await loadJSON<CategoryItem[]>(STORAGE_KEYS.CATEGORIES, []);
    set({ custom, all: buildAll(custom), loaded: true });
  },

  addCategory: async (name, icon) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return { ok: false, reason: '分类名不能为空' };
    }
    if (trimmed.length > CATEGORY_NAME_MAX_LENGTH) {
      return { ok: false, reason: `分类名最多 ${CATEGORY_NAME_MAX_LENGTH} 个字` };
    }

    const { custom } = get();
    if (custom.some(item => item.name === trimmed)) {
      return { ok: false, reason: '已存在同名分类' };
    }

    const category: CategoryItem = {
      key: `${CUSTOM_CATEGORY_PREFIX}${Date.now()}`,
      name: trimmed,
      icon,
    };

    const next = [...custom, category];
    set({ custom: next, all: buildAll(next) });
    await saveJSON(STORAGE_KEYS.CATEGORIES, next);

    queueCategoryUpsert(category);

    return { ok: true, category };
  },

  removeCategory: async key => {

    if (!get().isRemovable(key)) return;

    const next = get().custom.filter(item => item.key !== key);
    set({ custom: next, all: buildAll(next) });
    await saveJSON(STORAGE_KEYS.CATEGORIES, next);

    queueCategoryDelete(key);



    await useEventStore.getState().reassignCategory(key, FALLBACK_CATEGORY_KEY);
  },

  isRemovable: key => !BUILTIN_CATEGORY_KEYS.includes(key),

  applyRemote: async delta => {

    if (!get().loaded) {
      throw new Error('本地分类还没读完，本次同步作废');
    }

    const before = get().custom;
    const next = mergeCategories(before, delta);
    set({ custom: next, all: buildAll(next) });
    await saveJSON(STORAGE_KEYS.CATEGORIES, next);


    const deletedKeys = delta.delete.filter(key => !delta.upsert.some(item => item.key === key));
    if (deletedKeys.length > 0) {
      for (const key of deletedKeys) {
        await useEventStore.getState().reassignCategory(key, FALLBACK_CATEGORY_KEY);
      }
    }

    return countRemoteChanges(before, delta, item => item.key);
  },

  clearAll: async () => {
    set({ custom: [], all: buildAll([]) });
    await saveJSON(STORAGE_KEYS.CATEGORIES, []);
  },
}));

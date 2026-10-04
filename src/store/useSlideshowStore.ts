import { create } from 'zustand';

import {
  DEFAULT_SLIDESHOW_CONFIG,
  mergeSlideshowConfig,
  type SlideshowConfig,
  type SlideshowDisplay,
} from '../constants/slideshow';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { loadJSON, saveJSON } from '../services/storage';

/**
 * 轮播放映配置（Slice 14）
 *
 * 存储键沿用旧版 `slideshowConfig`，值结构也一致，方便直接读旧数据。
 * 每次改动立刻落盘（旧版也是 `setConfig` 里同步写）—— 放映设置页改动不频繁，
 * 不做防抖，简单可靠。
 */

interface SlideshowState {
  config: SlideshowConfig;
  /** 是否已从本地存储读完 */
  loaded: boolean;

  /** 进放映设置 / 播放器时各调一次（幂等） */
  load(): Promise<void>;
  /** 改单个标量字段（display 请用 setDisplay） */
  setConfig<K extends keyof Omit<SlideshowConfig, 'display'>>(
    key: K,
    value: SlideshowConfig[K],
  ): void;
  /** 切换「显示元素」里的某一项 */
  setDisplay(key: keyof SlideshowDisplay, value: boolean): void;
  /** 恢复默认 */
  reset(): void;
}

function persist(config: SlideshowConfig) {

  void saveJSON(STORAGE_KEYS.SLIDESHOW_CONFIG, config);
}

export const useSlideshowStore = create<SlideshowState>((set, get) => ({
  config: { ...DEFAULT_SLIDESHOW_CONFIG, display: { ...DEFAULT_SLIDESHOW_CONFIG.display } },
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    const saved = await loadJSON<Partial<SlideshowConfig> | null>(
      STORAGE_KEYS.SLIDESHOW_CONFIG,
      null,
    );
    set({ config: mergeSlideshowConfig(saved), loaded: true });
  },

  setConfig: (key, value) => {
    const next = { ...get().config, [key]: value } as SlideshowConfig;
    set({ config: next });
    persist(next);
  },

  setDisplay: (key, value) => {
    const next: SlideshowConfig = {
      ...get().config,
      display: { ...get().config.display, [key]: value },
    };
    set({ config: next });
    persist(next);
  },

  reset: () => {
    const next: SlideshowConfig = {
      ...DEFAULT_SLIDESHOW_CONFIG,
      display: { ...DEFAULT_SLIDESHOW_CONFIG.display },
    };
    set({ config: next });
    persist(next);
  },
}));

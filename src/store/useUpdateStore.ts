import { create } from 'zustand';

import { DEV_FORCE_UPDATE } from '../constants/update';
import { STORAGE_KEYS } from '../constants/storageKeys';
import {
  cancelApkDownload,
  downloadApk,
  installApk,
  openUnknownSourcesSettings,
  openUrlInBrowser,
} from '../services/apkInstaller';
import { loadJSON, saveJSON } from '../services/storage';
import { fetchUpdateInfo, getCurrentVersionCode } from '../services/update';
import { decideUpdate, progressRatio, type UpdateInfo, type UpdateReason } from '../utils/update';

/**
 * 应用内更新的状态机（Slice 17）
 *
 * ```
 *   idle ──check──▶ available ──立即更新──▶ downloading ──▶ installing ──▶ idle
 *     ▲                │                        │
 *     └──稍后/跳过──────┘                        └──失败/取消──▶ error
 * ```
 *
 * 拿不到更新信息（网络失败等）**不进入这个状态机**，直接回到 `idle` ——
 * 没有弹窗，没有错误提示。理由见 `services/update.ts` 顶部注释。
 */

export type UpdatePhase =

  | 'idle'
  | 'checking'
  /** 有新版本，弹窗等用户决定 */
  | 'available'
  | 'downloading'
  /** 已经调起系统安装器 */
  | 'installing'
  /** 下载或安装失败，弹窗上给"用浏览器下载"兜底 */
  | 'error';

/** 检查结果的原因码（`skipped` 是"被用户跳过过，本次不弹"） */
export type CheckReason = UpdateReason | 'skipped';

export interface CheckResult {
  available: boolean;
  force: boolean;
  reason: CheckReason;
  /** 线上最新版本的 versionName（拿不到就是空串） */
  version: string;
}

interface UpdateState {
  phase: UpdatePhase;
  info: UpdateInfo | null;
  /** 强制更新：非强制时用户能选"稍后"，强制时只能"立即更新 / 退出应用" */
  force: boolean;

  /** 0~1；**null 表示总大小未知**，进度条要走"不确定"态 */
  ratio: number | null;
  bytesWritten: number;
  totalBytes: number;
  /** 失败时的用户可见文案 */
  errorText: string;
  /**
   * 失败发生在哪一步
   *
   * 界面要靠它决定给哪个兜底按钮：下载失败给「重试」，
   * 安装被拦给「去设置」—— 给错了用户会一直重试下载，而问题根本不在下载。
   */
  errorKind: 'download' | 'install' | null;

  /** 用户点过"跳过此版本"的 versionCode（0 = 没跳过任何版本） */
  skippedVersion: number;
  /** 是否已从本地存储读完 */
  loaded: boolean;

  /** 读"跳过此版本"的记录（启动时调一次） */
  load(): Promise<void>;
  /** 检查更新；`manual` 表示用户在关于页主动点的（会忽略跳过记录） */
  check(options?: { manual?: boolean }): Promise<CheckResult>;
  /** 稍后更新 / 关掉弹窗 */
  dismiss(): void;
  /** 不再提示这个版本（**强制更新不允许跳过**） */
  skipVersion(): void;
  startDownload(): Promise<void>;
  /** 取消下载，回到"有新版本"的弹窗 */
  cancelDownload(): void;
  /** 兜底：用系统浏览器打开 APK 直链 */
  useBrowser(): Promise<void>;
  /** 跳到「安装未知应用」设置页 */
  goUnknownSources(): Promise<void>;
}

/** 把各种异常翻译成一句人话（用户看不懂 "Network request failed"） */
function describeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const text = raw.toLowerCase();

  if (text.includes('abort') || text.includes('cancel')) return '下载已取消';
  if (text.includes('network') || text.includes('timeout') || text.includes('timed out')) {
    return '网络连接失败，请检查网络后重试';
  }
  if (text.includes('space') || text.includes('enospc')) return '存储空间不足';

  return '下载失败，请稍后重试';
}

const initialState = {
  phase: 'idle' as UpdatePhase,
  info: null as UpdateInfo | null,
  force: false,
  ratio: null as number | null,
  bytesWritten: 0,
  totalBytes: 0,
  errorText: '',
  errorKind: null as 'download' | 'install' | null,
  skippedVersion: 0,
  loaded: false,
};

export const useUpdateStore = create<UpdateState>((set, get) => ({
  ...initialState,

  load: async () => {
    if (get().loaded) return;
    const saved = await loadJSON<number>(STORAGE_KEYS.SKIPPED_VERSION, 0);
    set({
      skippedVersion: typeof saved === 'number' && saved > 0 ? saved : 0,
      loaded: true,
    });
  },

  check: async (options = {}) => {
    const { manual = false } = options;


    const busy = get().phase;
    if (busy === 'downloading' || busy === 'installing') {
      return { available: false, force: false, reason: 'invalid', version: '' };
    }

    set({ phase: 'checking' });

    const info = await fetchUpdateInfo();
    const decision = decideUpdate(getCurrentVersionCode(), info);

    if (!decision.available || !info) {
      set({ phase: 'idle', info: null, force: false });
      return { available: false, force: false, reason: decision.reason, version: info?.version ?? '' };
    }


    const devMode = DEV_FORCE_UPDATE !== 'off';
    if (!decision.force && !manual && !devMode && get().skippedVersion === info.versionCode) {
      set({ phase: 'idle', info: null, force: false });
      return { available: false, force: false, reason: 'skipped', version: info.version };
    }

    set({
      phase: 'available',
      info,
      force: decision.force,
      ratio: null,
      bytesWritten: 0,

      totalBytes: info.sizeBytes,
      errorText: '',
    });
    return { available: true, force: decision.force, reason: 'ok', version: info.version };
  },

  dismiss: () => {
    set({ phase: 'idle', info: null, force: false, ratio: null, errorText: '', errorKind: null });
  },

  skipVersion: () => {
    const { info, force } = get();
    if (!info || force) return;

    void saveJSON(STORAGE_KEYS.SKIPPED_VERSION, info.versionCode);
    set({
      skippedVersion: info.versionCode,
      phase: 'idle',
      info: null,
      force: false,
      ratio: null,
      errorText: '',
    });
  },

  startDownload: async () => {
    const info = get().info;
    if (!info) return;

    set({
      phase: 'downloading',
      ratio: null,
      bytesWritten: 0,
      totalBytes: info.sizeBytes,
      errorText: '',
      errorKind: null,
    });

    let contentUri: string;
    try {
      const apk = await downloadApk({
        url: info.apkUrl,
        versionCode: info.versionCode,
        onProgress: (written, total) => {
          set({ bytesWritten: written, totalBytes: total, ratio: progressRatio(written, total) });
        },
      });
      contentUri = apk.contentUri;
    } catch (error) {
      console.warn('[update] 下载失败', error);
      set({ phase: 'error', errorText: describeError(error), errorKind: 'download' });
      return;
    }

    set({ phase: 'installing' });

    try {
      await installApk(contentUri);
    } catch (error) {

      console.warn('[update] 调起安装器失败', error);
      set({
        phase: 'error',
        errorKind: 'install',
        errorText: '没能打开安装程序，可能需要在系统设置里允许本应用「安装未知应用」',
      });
      return;
    }


    set({ phase: 'idle', info: null, force: false, ratio: null, errorText: '' });
  },

  cancelDownload: () => {
    cancelApkDownload();

    set({ phase: 'available', ratio: null, bytesWritten: 0, errorText: '', errorKind: null });
  },

  useBrowser: async () => {
    const url = get().info?.apkUrl;
    if (!url) return;

    try {
      await openUrlInBrowser(url);
    } catch (error) {
      console.warn('[update] 打开浏览器失败', error);
      set({ errorText: '没能打开浏览器，请手动复制下载地址' });
    }
  },

  goUnknownSources: async () => {
    try {
      await openUnknownSourcesSettings();
    } catch (error) {
      console.warn('[update] 打开设置页失败', error);
      set({ errorText: '没能打开系统设置，请到「设置 → 应用 → 安装未知应用」里手动允许' });
    }
  },
}));

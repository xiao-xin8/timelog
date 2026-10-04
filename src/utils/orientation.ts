import * as ScreenOrientation from 'expo-screen-orientation';

import { STORAGE_KEYS } from '../constants/storageKeys';
import { loadString, saveString } from '../services/storage';

/**
 * 屏幕方向（设置页 / Slice 14 轮播共用）
 *
 * 旧版就是这个两档：**竖屏正向** 与 **竖屏反向**（手机倒过来拿，少见但照旧版保留）。
 *
 * ⚠️ 为什么 `app.json` 里的 `orientation` 必须写成 `default`：
 * 如果那里写死 `portrait`，构建时会把 `android:screenOrientation="portrait"`
 * 钉进 AndroidManifest —— 原生层锁死了方向，这里的 `lockAsync()` 运行时改不动它。
 * 所以现在是「声明为可旋转 + 启动时用代码锁回用户选的方向」。
 */

export type OrientationPreference = 'portrait-primary' | 'portrait-secondary';

export const ORIENTATION_OPTIONS: ReadonlyArray<{
  value: OrientationPreference;
  label: string;
}> = [
  { value: 'portrait-primary', label: '竖屏正向' },
  { value: 'portrait-secondary', label: '竖屏反向' },
];

/** 旧版默认值（orientation.js 的 DEFAULT_ORIENTATION） */
export const DEFAULT_ORIENTATION: OrientationPreference = 'portrait-primary';

export function isOrientationPreference(value: string | null): value is OrientationPreference {
  return value === 'portrait-primary' || value === 'portrait-secondary';
}

export async function loadOrientationPreference(): Promise<OrientationPreference> {
  const stored = await loadString(STORAGE_KEYS.SCREEN_ORIENTATION);
  return isOrientationPreference(stored) ? stored : DEFAULT_ORIENTATION;
}

/** 真正去锁方向。设备不支持某个方向时抛错，交给调用方兜底 */
export async function applyOrientation(preference: OrientationPreference): Promise<void> {
  const lock =
    preference === 'portrait-secondary'
      ? ScreenOrientation.OrientationLock.PORTRAIT_DOWN
      : ScreenOrientation.OrientationLock.PORTRAIT_UP;

  await ScreenOrientation.lockAsync(lock);
}

/** 设置页：存偏好 + 立刻生效 */
export async function setOrientationPreference(preference: OrientationPreference): Promise<void> {
  await saveString(STORAGE_KEYS.SCREEN_ORIENTATION, preference);
  await applyOrientation(preference);
}

/**
 * App 启动时调一次，把上次选的方向锁回来。
 *
 * 失败只记日志不抛 —— 方向锁不住不至于让 App 起不来。
 */
export async function restoreOrientation(): Promise<void> {
  try {
    await applyOrientation(await loadOrientationPreference());
  } catch (error) {
    console.warn('[orientation] 恢复屏幕方向失败', error);
  }
}

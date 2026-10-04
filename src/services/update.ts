import Constants from 'expo-constants';

import {
  DEV_FAKE_APK_URL,
  DEV_FAKE_SIZE_BYTES,
  DEV_FORCE_UPDATE,
  UPDATE_FETCH_TIMEOUT_MS,
  UPDATE_JSON_URLS,
} from '../constants/update';
import { parseUpdateInfo, resolveVersionCode, type UpdateInfo } from '../utils/update';



/**
 * 当前安装包的 versionCode
 *
 * ⚠️ 两个来源都是**构建时嵌进包里的**，开发时改 app.json 不会立刻变
 * （要 Reload 或装新包）。`nativeBuildVersion` 是字符串，交给纯函数去转。
 */
export function getCurrentVersionCode(): number {
  return resolveVersionCode(
    Constants.nativeBuildVersion,
    Constants.expoConfig?.android?.versionCode,
  );
}

/** 当前 versionName（给人看，不参与比较） */
export function getCurrentVersionName(): string {
  return Constants.expoConfig?.version || Constants.nativeAppVersion || '';
}

/**
 * 开发开关造出来的假更新
 *
 * 仍然走 `parseUpdateInfo` —— 和真实数据同一条解析路径，
 * 这样开关验的才是真链路（包括"apkUrl 必须合法"那条兜底）。
 */
function buildDevInfo(): UpdateInfo | null {
  return parseUpdateInfo({
    enabled: true,
    version: '0.9.9-dev',

    versionCode: getCurrentVersionCode() + 1,
    minVersionCode: 1,
    forceUpdate: DEV_FORCE_UPDATE === 'force',
    updateContent: '1. 这是开发开关造出来的假更新\n2. 用来点验弹窗和下载安装链路',
    apkUrl: DEV_FAKE_APK_URL,
    sizeBytes: DEV_FAKE_SIZE_BYTES,
    publishedAt: '',
  });
}

/**
 * 拉取单个地址的更新信息
 *
 * 任何失败都返回 `null`，**绝不抛错**（超时 / 断网 / 404 / 不是 JSON 都一样）。
 */
async function fetchOneUrl(url: string): Promise<UpdateInfo | null> {

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPDATE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {

      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      signal: controller.signal,
    });

    if (!response.ok) return null;

    return parseUpdateInfo(await response.json());
  } catch {

    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 拉取更新信息
 *
 * 返回 `null` = 拿不到（**和"没有新版本"是两回事**，但界面上的表现一样：
 * 什么都不弹）。判定要不要提示交给 `decideUpdate`。
 *
 * 按 `UPDATE_JSON_URLS` 的顺序试（正式域名 → Pages 备用域名）：
 * 前一个拿到合法结果就立刻返回，**正常情况下只发一个请求**。
 * 都在最坏情况下会等两轮超时（各 8 秒），但这是启动后后台跑的、失败也静默，
 * 比"域名解析出问题就永远收不到更新"划算。
 */
export async function fetchUpdateInfo(): Promise<UpdateInfo | null> {
  if (DEV_FORCE_UPDATE !== 'off') return buildDevInfo();

  for (const url of UPDATE_JSON_URLS) {
    const info = await fetchOneUrl(url);


    if (info) return info;
  }

  return null;
}

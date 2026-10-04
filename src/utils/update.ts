/**
 * 应用内更新的**纯逻辑**（Slice 17）
 *
 * 只有"怎么算"，没有网络、没有原生调用 —— 所以能脱离 RN 直接测
 * （`npm run verify:slice17`）。
 *
 * 设计基调是**保守**：这个功能第一版没法完整测试（要有第二版才验得到），
 * 所以任何"不确定"都往"不提示更新"这一边倒 —— 宁可不弹，也不能弹错。
 */

/** 后端（静态文件）给的更新信息，**每个字段都是可选的** */
export interface UpdateInfo {
  /** 总开关，false = 本次完全静默（发版出事时的一键关闭） */
  enabled: boolean;
  /** versionName，只给人看 */
  version: string;
  /** **唯一的比较依据**（旧版用 versionName 逐段比数字，没必要且容易踩坑） */
  versionCode: number;
  /** 用户 versionCode 低于它 → 强制更新 */
  minVersionCode: number;
  /** 后端临时强推 */
  forceUpdate: boolean;
  /** 更新说明，`\n` 换行 */
  updateContent: string;
  /** APK 直链；**空 → 视为没有更新**（绝不去下载一个空地址） */
  apkUrl: string;
  /** 体积（0 = 不显示） */
  sizeBytes: number;
  /** 预留：当前版本不校验（见文档） */
  sha256: string;
  publishedAt: string;
}

/** 判定结果里的原因码，方便测试和排查（界面上不显示） */
export type UpdateReason =

  | 'ok'
  /** 拿不到/解析不了更新信息 */
  | 'invalid'
  /** 被后端关掉了 */
  | 'disabled'
  /** 没有可用的下载地址 */
  | 'no-apk'
  /** 已经是最新 */
  | 'latest';

export interface UpdateDecision {
  /** 要不要提示更新 */
  available: boolean;
  /** 是不是强制更新（true 时不给"稍后"） */
  force: boolean;
  reason: UpdateReason;
}

/** 兜底用的空信息（`parseUpdateInfo` 失败时用它，等价于"没有更新"） */
export const EMPTY_UPDATE_INFO: UpdateInfo = {
  enabled: false,
  version: '',
  versionCode: 0,
  minVersionCode: 0,
  forceUpdate: false,
  updateContent: '',
  apkUrl: '',
  sizeBytes: 0,
  sha256: '',
  publishedAt: '',
};

/** 把 JSON 里的任意值读成字符串（缺字段、类型不对都退化成空串） */
function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** 读成正整数；读不出来返回 0（0 永远不比当前版本大，等于"没有更新"） */
function asPositiveInt(value: unknown): number {

  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.floor(num);
}

/** 读成非负整数（用于体积之类，0 是合法值） */
function asNonNegativeInt(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.floor(num);
}

/**
 * 解析 `update.json`
 *
 * **容错优先**：字段缺失/类型不对一律退化成默认值，不抛错。
 * 只有"整体结构不对"或"versionCode 无效"才返回 `null` ——
 * 那两种情况都等价于"没有更新"，不需要区分。
 */
export function parseUpdateInfo(raw: unknown): UpdateInfo | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const source = raw as Record<string, unknown>;
  const versionCode = asPositiveInt(source.versionCode);


  if (versionCode <= 0) return null;

  return {

    enabled: source.enabled === undefined ? true : source.enabled === true,
    version: asString(source.version),
    versionCode,
    minVersionCode: asPositiveInt(source.minVersionCode),
    forceUpdate: source.forceUpdate === true,
    updateContent: normalizeUpdateContent(asString(source.updateContent)),
    apkUrl: asString(source.apkUrl).trim(),
    sizeBytes: asNonNegativeInt(source.sizeBytes),
    sha256: asString(source.sha256).trim(),
    publishedAt: asString(source.publishedAt),
  };
}

/**
 * 只认 http/https 的绝对地址
 *
 * ⚠️ 这条是**安全兜底**，不是洁癖：`apkUrl` 是要交给系统安装器去装的，
 * 万一 update.json 被写错（比如漏了协议头、指向一个相对路径），
 * 宁可"不提示更新"，也不能让 App 去下载一个来路不明的东西。
 */
export function isValidApkUrl(url: string): boolean {
  if (!url) return false;
  return /^https?:\/\/[^\s]+$/i.test(url);
}

/**
 * 决定要不要提示更新
 *
 * 强制判定用**两个条件取或**：`forceUpdate === true`（后端临时强推）
 * 或 `当前 versionCode < minVersionCode`（太老的版本必须升）。
 * 两者都在后端配置里，改配置不用发版。
 */
export function decideUpdate(
  currentVersionCode: number,
  info: UpdateInfo | null,
): UpdateDecision {
  if (!info) return { available: false, force: false, reason: 'invalid' };
  if (!info.enabled) return { available: false, force: false, reason: 'disabled' };

  if (!isValidApkUrl(info.apkUrl)) return { available: false, force: false, reason: 'no-apk' };
  if (info.versionCode <= currentVersionCode) {
    return { available: false, force: false, reason: 'latest' };
  }

  const force = info.forceUpdate || currentVersionCode < info.minVersionCode;
  return { available: true, force, reason: 'ok' };
}

/**
 * 取当前安装包的 versionCode
 *
 * 两个来源，**优先用原生那个**：
 *   1. `nativeBuildVersion` —— 安装包里真实的 versionCode（字符串！）
 *   2. `expoConfig.android.versionCode` —— 来自 app.json
 *
 * ⚠️ 两个都是**构建时嵌进包里的**：开发时改 app.json 不会立刻变，
 * 要 Reload（开发）或装新包（发布）。这和"关于页版本号"是同一个坑。
 */
export function resolveVersionCode(
  nativeBuildVersion: string | null | undefined,
  configVersionCode: number | null | undefined,
): number {
  const fromNative = asPositiveInt(nativeBuildVersion);
  if (fromNative > 0) return fromNative;
  return asPositiveInt(configVersionCode);
}

/**
 * 整理更新说明
 *
 * JSON 里的 `\n` 解析出来就是真换行，这里只做三件事：
 * 统一换行符、（Windows 编辑器存的）`\r\n` 归到 `\n`、去掉首尾空白和连续空行。
 */
export function normalizeUpdateContent(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 把字节数变成给人看的体积；0 或非法值返回空串（界面据此决定不显示） */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${Math.round(bytes)} B`;

  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;

  const mb = kb / 1024;

  return mb < 10 ? `${mb.toFixed(1)} MB` : `${Math.round(mb)} MB`;
}

/**
 * 下载进度 → 0~1；**null 表示"总大小未知"**
 *
 * `totalBytes` 会是 `-1`（服务器没给 `Content-Length`，核对过
 * expo-file-system 的类型定义）。这时候不能拿它算百分比，
 * 界面要退化成"不确定进度"的动画。
 */
export function progressRatio(bytesWritten: number, totalBytes: number): number | null {
  if (!Number.isFinite(totalBytes) || totalBytes <= 0) return null;
  if (!Number.isFinite(bytesWritten) || bytesWritten <= 0) return 0;
  return Math.min(1, bytesWritten / totalBytes);
}

/** 进度条上的文字：0~1 → "42%"；null → 空串 */
export function formatProgressPercent(ratio: number | null): string {
  if (ratio === null) return '';
  return `${Math.round(ratio * 100)}%`;
}

/** 下载文件名：带 versionCode，**绝不复用同名文件**（否则可能装到上一版） */
export function buildApkFileName(versionCode: number): string {
  return `timelog-update-${versionCode}.apk`;
}

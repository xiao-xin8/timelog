import Constants from 'expo-constants';
import { File, Paths, type DownloadTask } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { Linking } from 'react-native';

import {
  ACTION_MANAGE_UNKNOWN_APP_SOURCES,
  ACTION_VIEW,
  APK_MIME_TYPE,
  FLAG_GRANT_READ_URI_PERMISSION,
} from '../constants/update';
import { buildApkFileName } from '../utils/update';

/**
 * 下载并调起系统安装器（Slice 17 · B 档）
 *
 * ## 为什么不用写原生代码
 *
 * Android 7 起不允许把 `file://` 传给别的应用（`FileUriExposedException`），
 * 传统做法是自己声明一个 FileProvider + 写个原生方法。
 * 但 SDK 57 的 `expo-file-system` 已经把这活干完了：
 *
 *   - `File.contentUri` 直接给出可用的 `content://` URI；
 *   - 它自带的 `FileSystemFileProvider`（authority = `${applicationId}.FileSystemFileProvider`）
 *     的 paths 暴露了**整个 cache 目录**（`<cache-path path="." />`）。
 *
 * 所以只要把 APK 下到 `Paths.cache` 里，`contentUri` 天然就能被安装器读到。
 * 这条链路是查过包内 `AndroidManifest.xml` 和 `file_system_provider_paths.xml`
 * 确认的，不是猜的。
 *
 * ## 仍然要小心的两件事
 *
 * 1. **`REQUEST_INSTALL_PACKAGES` 权限**（Android 8+）：没它安装器直接不干活。
 *    必须在 `AndroidManifest.xml` 里声明（app.json 那条只有 prebuild 才写进 manifest）。
 * 2. **"安装未知应用"开关**：这是用户级的，权限声明了也还要他手动打开。
 *    被拦下时要把他送到设置页（`openUnknownSourcesSettings`），否则表现就是"点了没反应"。
 */

export interface DownloadedApk {
  /** `file://` 本地路径（用来打日志、删文件） */
  uri: string;
  /** `content://` URI —— 交给系统安装器的就是它 */
  contentUri: string;
  size: number;
  fileName: string;
}

export interface DownloadApkOptions {
  url: string;
  /** 用来拼文件名 —— **带上版本号，绝不复用同名文件**（否则可能装到上一版） */
  versionCode: number;
  /** 进度回调；total 为 -1 表示服务器没给 Content-Length */
  onProgress?: (bytesWritten: number, totalBytes: number) => void;
}

/** 正在跑的下载任务（用来支持"取消下载"） */
let currentTask: DownloadTask | null = null;

/** 取消当前下载；没有任务时什么都不做 */
export function cancelApkDownload(): void {
  const task = currentTask;
  currentTask = null;
  try {
    task?.cancel();
  } catch (error) {

    console.warn('[update] 取消下载失败', error);
  }
}

/** 本应用包名（拼 `package:` 那种 data 时要用） */
export function getApplicationId(): string {
  return Constants.expoConfig?.android?.package || 'com.example.timelog';
}

/**
 * 下载 APK 到缓存目录
 *
 * 失败一律抛错，由调用方（store）决定怎么提示 —— 这一层不做任何 UI 决定。
 */
export async function downloadApk(options: DownloadApkOptions): Promise<DownloadedApk> {
  const { url, versionCode, onProgress } = options;
  const fileName = buildApkFileName(versionCode);


  const target = new File(Paths.cache, fileName);
  if (target.exists) {
    try {
      target.delete();
    } catch (error) {
      console.warn('[update] 清理旧安装包失败，继续尝试下载', error);
    }
  }

  const task = File.createDownloadTask(url, target, {
    onProgress: ({ bytesWritten, totalBytes }) => onProgress?.(bytesWritten, totalBytes),
  });
  currentTask = task;

  try {
    const file = await task.downloadAsync();


    if (!file) throw new Error('下载被中断');

    if (!file.exists) throw new Error('下载的文件不见了');
    if (file.size <= 0) throw new Error('下载到的文件是空的');

    return {
      uri: file.uri,
      contentUri: file.contentUri,
      size: file.size,
      fileName,
    };
  } finally {

    if (currentTask === task) currentTask = null;
    try {
      task.release();
    } catch {
      // 已经释放过了，无所谓
    }
  }
}

/**
 * 调起系统安装器
 *
 * ⚠️ `startActivityAsync` 是**用户从安装界面返回时才 resolve** 的，
 * 所以"resolve 了"不等于"装上了" —— 装没装成功只有系统知道。
 * 这里只保证一件事：**安装界面被成功拉起来了**（拉不起来才会抛错）。
 */
export async function installApk(contentUri: string): Promise<void> {
  await IntentLauncher.startActivityAsync(ACTION_VIEW, {
    data: contentUri,
    type: APK_MIME_TYPE,

    flags: FLAG_GRANT_READ_URI_PERMISSION,
  });
}

/** 打开「安装未知应用」设置页，并定位到本应用那一项 */
export async function openUnknownSourcesSettings(): Promise<void> {
  await IntentLauncher.startActivityAsync(ACTION_MANAGE_UNKNOWN_APP_SOURCES, {
    data: `package:${getApplicationId()}`,
  });
}

/**
 * 用系统浏览器打开链接（兜底方案 / A 档）
 *
 * 下载和安装都交给系统组件，我们只负责给个地址。
 * 这条路径几乎不可能出问题，所以下载或安装失败时用它兜底。
 */
export async function openUrlInBrowser(url: string): Promise<void> {
  await Linking.openURL(url);
}

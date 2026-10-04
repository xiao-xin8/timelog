import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { API_BASE_URL } from '../services/config';

/**
 * 「能画出头像」所需的最小字段集合
 *
 * 用它而不是 `AuthUser`：故事作者（`types/story.ts` 的 `StoryAuthor`）
 * 只有这几个字段，为了塞进 `UserAvatar` 去凑齐 `email` / `createdAt` 是没道理的。
 * 反过来 `AuthUser` 天然满足它，所以现有调用一处都不用改。
 */
export interface AvatarUser {
  id: string;
  username?: string;
  nickname?: string | null;
  avatarPath?: string | null;
}



/** 头像边长：400×400，够清晰，压完 JPEG 大约 30–50KB */
export const AVATAR_SIZE = 400;

/** JPEG 质量 0–1。0.8 是肉眼无损和体积的平衡点 */
export const AVATAR_COMPRESS = 0.8;

export type PickAvatarResult =
  | { ok: true; base64: string }
  /** 用户自己取消了，不该弹任何提示 */
  | { ok: false; reason: 'cancelled' }
  | { ok: false; reason: 'permission' | 'failed'; message: string };

/**
 * 选图参数
 *
 * `allowsEditing: true` + `aspect: [1, 1]` 让系统先裁成正方形 ——
 * 这样后面 resize 到 400×400 才是**等比**的。
 * 如果不裁就直接拉到正方形，非正方形的图会被拉伸变形。
 */
const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: true,
  aspect: [1, 1],
  quality: 1,
};

async function compressToBase64(uri: string): Promise<string> {

  const context = ImageManipulator.manipulate(uri);
  context.resize({ width: AVATAR_SIZE, height: AVATAR_SIZE });

  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: AVATAR_COMPRESS,
    base64: true,
  });

  if (!saved.base64) throw new Error('压缩后的图片没有 base64 数据');
  return saved.base64;
}

export async function pickAvatar(source: 'library' | 'camera'): Promise<PickAvatarResult> {
  try {
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        return { ok: false, reason: 'permission', message: '需要相机权限才能拍照' };
      }
    } else if (Platform.OS === 'ios') {

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        return { ok: false, reason: 'permission', message: '需要相册权限才能选图' };
      }
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS)
        : await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);

    if (result.canceled) return { ok: false, reason: 'cancelled' };

    const asset = result.assets?.[0];
    if (!asset?.uri) {
      return { ok: false, reason: 'failed', message: '没能读到这张图片，请换一张试试' };
    }

    return { ok: true, base64: await compressToBase64(asset.uri) };
  } catch (error) {
    console.error('[avatar] 选图或压缩失败', error);
    return { ok: false, reason: 'failed', message: '处理图片失败了，请换一张试试' };
  }
}

/**
 * 拼出头像的完整地址；没有自定义头像时返回 null。
 *
 * 服务端返回的是**相对路径**（`/api/avatar/xxx?v=…`），域名只有前端知道，
 * 所以在这里拼。注意不能走 `apiUrl()` —— 它会再加一遍 `/api`。
 */
export function avatarUri(user: AvatarUser | null | undefined): string | null {
  if (!user?.avatarPath) return null;
  return `${API_BASE_URL}${user.avatarPath}`;
}

/** 默认头像上显示的那个字：昵称优先，其次用户名 */
export function avatarLetter(user: AvatarUser | null | undefined): string {
  const source = user?.nickname?.trim() || user?.username || '';
  if (!source) return '?';
  return source.slice(0, 1).toUpperCase();
}

/**
 * 默认头像的底色。
 *
 * 照旧版的做法：按用户 id 稳定地挑一个颜色，同一个人每次进来颜色都一样。
 * 只从主题色板里取色（项目约定：页面不写死色值）。
 */
export const AVATAR_FALLBACK_COLORS = [
  '#FFB380', // palette.peach
  '#FF9A66', // palette.peachDeep
  '#AA8899', // palette.mauve
  '#7A5566', // palette.cocoaSoft
] as const;

export function avatarColor(seed: string | null | undefined): string {
  const key = seed ?? '';
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) % 100000;
  }
  return AVATAR_FALLBACK_COLORS[hash % AVATAR_FALLBACK_COLORS.length];
}

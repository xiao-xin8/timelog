/**
 * 用户资料相关的格式化（Slice 09）
 *
 * 文案格式照抄旧版 `legacy/uniapp/pages/profile/profile.js` 的 `formatJoinDate`
 * 与 `pages/profile/edit.js` 的同名函数 —— 注意这两个函数**格式不一样**：
 * 个人中心只要年月，编辑页要年月日。别合并成一个。
 */

/** 个人中心用：`2026年10月` */
export function formatJoinMonth(timestamp: number | null | undefined): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

/** 编辑资料页的「加入时间」用：`2026年10月04日` */
export function formatJoinDate(timestamp: number | null | undefined): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}年${month}月${day}日`;
}

/** 性别值 → 显示文案（旧版 genderText 的映射，去掉设不到的 other 分支） */
export const GENDER_LABELS: Record<string, string> = {
  male: '男',
  female: '女',
  '': '保密',
};

export function genderLabel(value: string | null | undefined): string {
  if (!value) return '';
  return GENDER_LABELS[value] ?? '';
}



export const NICKNAME_MIN_LENGTH = 2;
export const NICKNAME_MAX_LENGTH = 20;
export const BIO_MAX_LENGTH = 200;
export const LOCATION_MAX_LENGTH = 50;

/**
 * 昵称校验
 *
 * 旧版规则有个容易漏的点：**空值不算错**（可以清空昵称），
 * 只有「填了但不足 2 个字」才报错。别写成必填。
 */
export function validateNickname(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.length < NICKNAME_MIN_LENGTH
    ? `昵称至少需要${NICKNAME_MIN_LENGTH}个字符`
    : '';
}

/** 简介、地区这类只限长度、不做格式校验的字段 */
export function clampLength(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

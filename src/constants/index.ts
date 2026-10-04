import type { CategoryItem } from '../types/event';



/** 7 个内置分类 */
export const DEFAULT_CATEGORIES: readonly CategoryItem[] = [
  { key: 'birthday', name: '生日', icon: '🎂' },
  { key: 'anniversary', name: '纪念日', icon: '💕' },
  { key: 'work', name: '工作', icon: '💼' },
  { key: 'study', name: '学习', icon: '📚' },
  { key: 'travel', name: '旅行', icon: '✈️' },
  { key: 'holiday', name: '节日', icon: '🎄' },
  { key: 'other', name: '其他', icon: '📌' },
] as const;

/** 内置分类的 key，用于判断哪些不可删除 */
export const BUILTIN_CATEGORY_KEYS: readonly string[] = DEFAULT_CATEGORIES.map(
  category => category.key,
);

/** 事件分类命中「其他」时的兜底 key（删除自定义分类时会把事件改成它） */
export const FALLBACK_CATEGORY_KEY = 'other';

export interface TextColorOption {
  key: string;
  value: string;
  name: string;
}

/** 字体颜色（12 个） */
export const TEXT_COLOR_OPTIONS: readonly TextColorOption[] = [
  { key: 'default', value: '#007AFF', name: '默认蓝' },
  { key: 'red', value: '#FF3B30', name: '红色' },
  { key: 'orange', value: '#FF9500', name: '橙色' },
  { key: 'yellow', value: '#FFCC00', name: '黄色' },
  { key: 'green', value: '#34C759', name: '绿色' },
  { key: 'teal', value: '#5AC8FA', name: '青色' },
  { key: 'blue', value: '#007AFF', name: '蓝色' },
  { key: 'indigo', value: '#5856D6', name: '靛蓝' },
  { key: 'purple', value: '#AF52DE', name: '紫色' },
  { key: 'pink', value: '#FF2D55', name: '粉色' },
  { key: 'brown', value: '#A2845E', name: '棕色' },
  { key: 'gray', value: '#8E8E93', name: '灰色' },
] as const;

export type BgColorType = 'follow' | 'preset' | 'custom';

export interface BgColorOption {
  key: string;
  value: string;
  name: string;
  type: BgColorType;
}

/** 背景颜色（15 个，含「跟随应用」与「自定义」） */
export const BG_COLOR_OPTIONS: readonly BgColorOption[] = [
  { key: 'follow', value: 'follow', name: '跟随应用', type: 'follow' },
  { key: 'white', value: '#FFFFFF', name: '纯白', type: 'preset' },
  { key: 'gray', value: '#F7F8FA', name: '浅灰', type: 'preset' },
  { key: 'blue', value: '#E3F2FD', name: '淡蓝', type: 'preset' },
  { key: 'green', value: '#E8F5E9', name: '淡绿', type: 'preset' },
  { key: 'yellow', value: '#FFFDE7', name: '淡黄', type: 'preset' },
  { key: 'pink', value: '#FCE4EC', name: '淡粉', type: 'preset' },
  { key: 'purple', value: '#F3E5F5', name: '淡紫', type: 'preset' },
  { key: 'orange', value: '#FFF3E0', name: '淡橙', type: 'preset' },
  { key: 'red', value: '#FFEBEE', name: '淡红', type: 'preset' },
  { key: 'dark_blue', value: '#1976D2', name: '深蓝', type: 'preset' },
  { key: 'dark_green', value: '#388E3C', name: '深绿', type: 'preset' },
  { key: 'dark_purple', value: '#7B1FA2', name: '深紫', type: 'preset' },
  { key: 'dark_gray', value: '#424242', name: '深灰', type: 'preset' },
  { key: 'custom', value: 'custom', name: '自定义', type: 'custom' },
] as const;

export interface CardSizeOption {
  key: string;
  name: string;
  desc: string;
}

/** 卡片尺寸（3 种），默认 medium */
export const CARD_SIZE_OPTIONS: readonly CardSizeOption[] = [
  { key: 'small', name: '小卡片', desc: '紧凑布局，显示更多内容' },
  { key: 'medium', name: '中卡片', desc: '平衡布局，推荐尺寸' },
  { key: 'large', name: '大卡片', desc: '突出显示，重点事件' },
] as const;

export const DEFAULT_CARD_SIZE = 'medium';

/** 新建自定义分类时可选的图标 */
export const CATEGORY_ICONS: readonly string[] = [
  '📁', '📂', '🗂️', '📊', '📈', '💼', '📚', '✏️', '🎨', '🎭', '🎪', '🎯',
  '🎲', '🎸', '🎺', '🎻', '🏆', '🏅', '🥇', '🥈', '🥉', '🎖️', '🎗️', '🎟️',
  '🎫', '🎁', '🎀', '🎊', '🎉', '🎈', '🎂', '🎄', '🎃', '🎎', '🎏', '🎐',
  '🎑', '🧧', '💕', '❤️', '⭐', '☀️', '🔥', '💧', '🌸', '🍀',
] as const;

/** 分类名长度上限 */
export const CATEGORY_NAME_MAX_LENGTH = 10;

/** 备注长度上限 */
export const REMARK_MAX_LENGTH = 200;

/** 自定义分类 key 前缀 */
export const CUSTOM_CATEGORY_PREFIX = 'custom_';



/** 版权主体 */
export const COMPANY_NAME = 'xiaoxin';

/** 底部版权标识（年份写死，跨年了记得回来改） */
export const COPYRIGHT_TEXT = `© 2026 ${COMPANY_NAME} · All rights reserved`;

/** 关于页那句一句话介绍 */
export const APP_INTRO =
  '时光日志是一个记录重要日子的小工具：倒计时、分类整理、日历视图、云同步，' +
  '还可以把故事分享到时光社区，或和朋友写信聊天。愿每一个值得纪念的日子，都被温柔记住。';

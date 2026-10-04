import type { EventItem } from '../types/event';

/**
 * 轮播放映（Slice 14）常量
 *
 * 配置结构**逐字段照搬旧版** `legacy/uniapp/pages/slideshow/settings.js` 的
 * `DEFAULT_CONFIG`，键名保持一致 —— 这样从旧版迁移过来的 `slideshowConfig`
 * 可以直接读，不用做字段映射。
 */

export type SlideshowOrder = 'priority' | 'asc' | 'desc' | 'random';

export type SlideshowAnimation =
  | 'fade'
  | 'slide'
  | 'slide-v'
  | 'flip'
  | 'cube'
  | 'zoom'
  | 'stack'
  | 'blinds'
  | 'blur'
  | 'rotate'
  | 'card'
  | 'random';

export type SlideshowEasing = 'linear' | 'ease-in-out' | 'ease-out' | 'spring' | 'bounce';

export type SlideshowCountdownFormat = 'days' | 'hours' | 'seconds';

export type SlideshowFontSize = 'small' | 'medium' | 'large';

export type SlideshowOrientation =
  | 'portrait-primary'
  | 'portrait-secondary'
  | 'landscape-primary'
  | 'landscape-secondary';

/** 每一张幻灯片上显示哪些元素 */
export interface SlideshowDisplay {
  showIcon: boolean;
  showTitle: boolean;
  showCountdown: boolean;
  showUnit: boolean;
  showDate: boolean;
  showWeekday: boolean;
  showCategory: boolean;
  showNote: boolean;
}

export interface SlideshowConfig {
  /** 每张停留时长（毫秒） */
  duration: number;
  /** 过渡时长（毫秒） */
  transitionDuration: number;
  order: SlideshowOrder;
  loop: boolean;
  autoPlay: boolean;
  animation: SlideshowAnimation;
  easing: SlideshowEasing;
  /** 3D 类动画（翻转 / 立方体 / 卡片）是否带透视 */
  enable3D: boolean;
  /** 视差效果（旧版实现里实际是关掉的，这里保留字段） */
  enableParallax: boolean;
  screenOrientation: SlideshowOrientation;
  display: SlideshowDisplay;
  countdownFormat: SlideshowCountdownFormat;
  fontSize: SlideshowFontSize;
  /** 是否包含未来事件 */
  futureEvents: boolean;
  /** 是否包含已过事件 */
  pastEvents: boolean;
  /** 置顶优先 */
  priorityFirst: boolean;
  useCustomBg: boolean;
  /** 自定义背景图片地址（相册 / 拍照得到的本地 URI） */
  customBgImage: string;
}

/** 默认配置：与旧版 DEFAULT_CONFIG 完全一致 */
export const DEFAULT_SLIDESHOW_CONFIG: SlideshowConfig = {
  duration: 5000,
  transitionDuration: 500,
  order: 'priority',
  loop: true,
  autoPlay: true,
  animation: 'fade',
  easing: 'ease-in-out',
  enable3D: true,
  enableParallax: false,
  screenOrientation: 'portrait-primary',
  display: {
    showIcon: true,
    showTitle: true,
    showCountdown: true,
    showUnit: true,
    showDate: true,
    showWeekday: true,
    showCategory: true,
    showNote: false,
  },
  countdownFormat: 'days',
  fontSize: 'medium',
  futureEvents: true,
  pastEvents: true,
  priorityFirst: true,
  useCustomBg: false,
  customBgImage: '',
};

export interface ValueOption<T> {
  label: string;
  value: T;
}

export const DURATION_OPTIONS: ReadonlyArray<ValueOption<number>> = [
  { label: '3秒', value: 3000 },
  { label: '5秒', value: 5000 },
  { label: '8秒', value: 8000 },
  { label: '10秒', value: 10000 },
];

export const TRANSITION_OPTIONS: ReadonlyArray<ValueOption<number>> = [
  { label: '0.3秒', value: 300 },
  { label: '0.5秒', value: 500 },
  { label: '0.8秒', value: 800 },
  { label: '1秒', value: 1000 },
];

export const ORDER_OPTIONS: ReadonlyArray<ValueOption<SlideshowOrder>> = [
  { label: '置顶优先', value: 'priority' },
  { label: '时间正序', value: 'asc' },
  { label: '时间倒序', value: 'desc' },
  { label: '随机播放', value: 'random' },
];

/** 12 种过渡动画（含「随机混合」） */
export const ANIMATION_OPTIONS: ReadonlyArray<ValueOption<SlideshowAnimation>> = [
  { label: '淡入淡出', value: 'fade' },
  { label: '左右滑动', value: 'slide' },
  { label: '上下滑动', value: 'slide-v' },
  { label: '3D翻转', value: 'flip' },
  { label: '立方体', value: 'cube' },
  { label: '缩放弹出', value: 'zoom' },
  { label: '层叠堆叠', value: 'stack' },
  { label: '百叶窗', value: 'blinds' },
  { label: '模糊渐变', value: 'blur' },
  { label: '旋转飞入', value: 'rotate' },
  { label: '卡片翻转', value: 'card' },
  { label: '随机混合', value: 'random' },
];

/**
 * 「随机混合」的候选池
 *
 * 与旧版 `getCurrentAnimation()` 里写死的 11 种一致（不含 random 自己）。
 */
export const ANIMATION_POOL: ReadonlyArray<Exclude<SlideshowAnimation, 'random'>> = [
  'fade',
  'slide',
  'slide-v',
  'flip',
  'cube',
  'zoom',
  'stack',
  'blinds',
  'blur',
  'rotate',
  'card',
];

export const EASING_OPTIONS: ReadonlyArray<ValueOption<SlideshowEasing>> = [
  { label: '线性', value: 'linear' },
  { label: '平滑', value: 'ease-in-out' },
  { label: '减速', value: 'ease-out' },
  { label: '弹性', value: 'spring' },
  { label: '弹跳', value: 'bounce' },
];

export interface DisplayOption {
  key: keyof SlideshowDisplay;
  label: string;
}

export const DISPLAY_OPTIONS: ReadonlyArray<DisplayOption> = [
  { key: 'showIcon', label: '事件图标' },
  { key: 'showTitle', label: '事件标题' },
  { key: 'showCountdown', label: '倒计时数字' },
  { key: 'showUnit', label: '天数单位' },
  { key: 'showDate', label: '完整日期' },
  { key: 'showWeekday', label: '星期显示' },
  { key: 'showCategory', label: '分类标签' },
  { key: 'showNote', label: '备注信息' },
];

export const COUNTDOWN_FORMAT_OPTIONS: ReadonlyArray<ValueOption<SlideshowCountdownFormat>> = [
  { label: '仅天数', value: 'days' },
  { label: '天:时:分', value: 'hours' },
  { label: '天:时:分:秒', value: 'seconds' },
];

export const FONT_SIZE_OPTIONS: ReadonlyArray<ValueOption<SlideshowFontSize>> = [
  { label: '小', value: 'small' },
  { label: '中', value: 'medium' },
  { label: '大', value: 'large' },
];

export const SLIDESHOW_ORIENTATION_OPTIONS: ReadonlyArray<ValueOption<SlideshowOrientation>> = [
  { label: '竖屏正向', value: 'portrait-primary' },
  { label: '竖屏反向', value: 'portrait-secondary' },
  { label: '横屏正向', value: 'landscape-primary' },
  { label: '横屏反向', value: 'landscape-secondary' },
];

/**
 * 字号倍率
 *
 * 放映页是「远看」的场景，字号本身是可调的**功能**（旧版三档 small/medium/large），
 * 不完全适用「页面里不写 fontSize」的 UI 约定 —— 所以基准字号统一收在这里，
 * 页面只按倍率缩放，不在页面里散写数字。
 */
export const SLIDESHOW_FONT_SCALE: Record<SlideshowFontSize, number> = {
  small: 0.8,
  medium: 1,
  large: 1.35,
};

/** 放映卡片的基准字号（medium 档），页面按倍率乘 */
export const SLIDESHOW_BASE_FONT = {
  icon: 64,
  title: 32,
  countdownLabel: 24,
  countdownNumber: 72,
  countdownUnit: 22,
  date: 20,
  weekday: 20,
  category: 16,
  note: 16,
} as const;

/** 分类 key → 名称 / 图标兜底（自定义分类读 store，这里只兜内置与未知） */
export const SLIDESHOW_CATEGORY_FALLBACK: Record<string, { icon: string; name: string }> = {
  birthday: { icon: '🎂', name: '生日' },
  anniversary: { icon: '💕', name: '纪念日' },
  work: { icon: '💼', name: '工作' },
  study: { icon: '📚', name: '学习' },
  travel: { icon: '✈️', name: '旅行' },
  holiday: { icon: '🎉', name: '节日' },
  other: { icon: '📌', name: '其他' },
};

/** 供 store 合并旧版配置时做「缺字段兜底」 */
export function mergeSlideshowConfig(saved: Partial<SlideshowConfig> | null): SlideshowConfig {
  if (!saved) return { ...DEFAULT_SLIDESHOW_CONFIG, display: { ...DEFAULT_SLIDESHOW_CONFIG.display } };
  return {
    ...DEFAULT_SLIDESHOW_CONFIG,
    ...saved,
    display: { ...DEFAULT_SLIDESHOW_CONFIG.display, ...(saved.display ?? {}) },
  };
}

/** 便于外部引用事件类型（放映页数据来自事件 store） */
export type SlideshowEvent = EventItem;

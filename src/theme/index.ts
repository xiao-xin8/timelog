import { MD3DarkTheme, MD3LightTheme, MD3Theme } from 'react-native-paper';

/**
 * ============================================================
 *  色板 · 可爱萌系卡通风
 * ------------------------------------------------------------
 *  色值全部取自旧项目，出处：
 *    legacy/uniapp/styles/theme.css  →  .theme-cute 段落
 *
 *  规则：只认这张表。要改配色，改这里，不要在页面里写死色值。
 * ============================================================
 */
export const palette = {

  peach: '#FFB380', // 旧：.btn-primary 渐变起点 / 卡片装饰星 / 侧栏激活文字
  peachDeep: '#FF9A66', // 旧：.btn-primary 渐变终点
  peachSoft: '#FFE4EC', // 旧：.nav-btn 渐变终点
  peachTint: '#FFF0F5', // 旧：.nav-btn 渐变起点


  pinkBlush: '#FFD6E0', // 旧：.card 渐变 0%
  pinkMist: '#FFE4E9', // 旧：.card 渐变 50%
  pinkVeil: '#FFF0F3', // 旧：.card 渐变 100%


  cream: '#FFFAF5', // 旧：.solid-bg-cute 渐变起点 / 侧边栏底色
  creamRose: '#FFF5F7', // 旧：.solid-bg-cute 渐变终点


  cocoa: '#5C3D2E', // 旧：导航标题 / 倒计时数字 / 事件标题
  cocoaSoft: '#7A5566', // 旧：倒计时单位
  cocoaFaint: '#9A7B8A', // 旧：日期备注
  mauve: '#AA8899', // 旧：图标
  mauveLight: '#B898A8', // 旧：分类计数文字


  peachLine20: 'rgba(255, 179, 128, 0.20)', // 旧：卡片边框 / 侧栏分隔线
  peachLine15: 'rgba(255, 179, 128, 0.15)', // 旧：计数底色
  peachLine30: 'rgba(255, 179, 128, 0.30)', // 旧：侧栏激活计数底色


  danger: '#E5484D',
  dangerSoft: '#FFE5E5',

  online: '#3FBF7F',


  strengthWeak: '#FF3B30',
  strengthMedium: '#FF9500',
  strengthStrong: '#34C759',
} as const;

/** 卡片渐变：旧 .card 的三段粉（135deg） */
export const cardGradient = [palette.pinkBlush, palette.pinkMist, palette.pinkVeil] as const;

/** 主按钮渐变：旧 .btn-primary 的两段橙（135deg） */
export const primaryGradient = [palette.peach, palette.peachDeep] as const;

/** 页面背景渐变：旧 .solid-bg-cute（180deg） */
export const backgroundGradient = [palette.cream, palette.creamRose] as const;

/**
 * 进度条渐变：旧日历页 `.progress-fill.month` / `.progress-fill.year`（可爱风）
 *
 * 本月用蜜桃橙；本年旧版用的是一档青绿→天蓝，主题色板里没有对应色，
 * 这里照搬旧值，需要调整配色时改这一处即可。
 */
export const monthProgressGradient = [palette.peach, palette.peachDeep] as const;
export const yearProgressGradient = ['#95E1D3', '#5AC8FA'] as const;

/** 事件卡底：旧日历页 `.theme-cute .event-item`（135deg） */
export const eventCardGradient = [palette.peachTint, palette.peachSoft] as const;



/**
 * 亮色主题 —— 映射到 Material Design 3 的颜色角色。
 * 左列是 MD3 角色名，右列是它在本设计里对应什么。
 */
export const lightTheme: MD3Theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,


    primary: palette.peach,
    onPrimary: '#FFFFFF',
    primaryContainer: palette.peachSoft,
    onPrimaryContainer: palette.cocoa,


    secondary: palette.peachDeep,
    onSecondary: '#FFFFFF',
    secondaryContainer: palette.peachTint,
    onSecondaryContainer: palette.cocoaSoft,


    tertiary: palette.pinkBlush,
    onTertiary: palette.cocoa,
    tertiaryContainer: palette.pinkVeil,
    onTertiaryContainer: palette.cocoa,


    background: palette.cream,
    onBackground: palette.cocoa,
    surface: '#FFFFFF',
    onSurface: palette.cocoa,
    surfaceVariant: palette.creamRose,
    onSurfaceVariant: palette.cocoaFaint,
    surfaceDisabled: 'rgba(92, 61, 46, 0.12)',
    onSurfaceDisabled: 'rgba(92, 61, 46, 0.38)',


    outline: '#EBD5DD',
    outlineVariant: palette.pinkVeil,


    inverseSurface: palette.cocoa,
    inverseOnSurface: palette.cream,
    inversePrimary: palette.peachSoft,


    error: palette.danger,
    onError: '#FFFFFF',
    errorContainer: palette.dangerSoft,
    onErrorContainer: '#7A1F1F',


    elevation: {
      ...MD3LightTheme.colors.elevation,
      level0: 'transparent',
      level1: '#FFFFFF',
      level2: palette.pinkVeil,
      level3: '#FFE9EE',
      level4: '#FFE4EA',
      level5: '#FFDFE6',
    },
  },
};

/**
 * 深色主题 —— 暖棕夜色调，与可爱风同源（旧项目 .theme-dark 是蓝调，
 * 这里不照搬，只保证暗色下也是暖色系，风格统一）。
 */
export const darkTheme: MD3Theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: palette.peach,
    onPrimary: '#3A1F0E',
    primaryContainer: '#5C3D2E',
    onPrimaryContainer: palette.pinkBlush,
    secondary: palette.peachDeep,
    onSecondary: '#3A1F0E',
    secondaryContainer: '#4A3226',
    onSecondaryContainer: palette.peachSoft,
    tertiary: palette.pinkBlush,
    onTertiary: '#3A1F0E',
    background: '#1A1310',
    onBackground: '#F5E9E4',
    surface: '#231A16',
    onSurface: '#F5E9E4',
    surfaceVariant: '#3A2C25',
    onSurfaceVariant: '#C9B3AC',
    outline: '#5C4A42',
    outlineVariant: '#3A2C25',
    elevation: {
      ...MD3DarkTheme.colors.elevation,
      level0: 'transparent',
      level1: '#231A16',
      level2: '#2A201B',
      level3: '#312520',
      level4: '#352823',
      level5: '#3A2C25',
    },
  },
};

/** 间距刻度（dp） */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/**
 * 圆角刻度（dp）
 * 旧项目用 rpx，此处按 24rpx≈16dp 的比例折算，仅保留四档，避免出现任意值。
 */
export const radius = {
  sm: 8, // 小元素：标签、输入框
  md: 12, // 中等：列表项、按钮组
  lg: 16, // 大：卡片（旧 .card 24rpx）
  xl: 24, // 特大：弹窗、底部面板
  pill: 999, // 胶囊：主按钮（旧 .btn-primary 32rpx）
} as const;

/**
 * 弹窗底部按钮的统一样式
 *
 * Paper 的 Dialog 操作按钮默认是紧凑的文本按钮，点击区域偏小。
 * 这里统一放大到 48dp 高（安卓的最小推荐触控尺寸），字号也提到 16。
 */
export const dialogButtonStyle = {
  button: {
    borderRadius: radius.md,
  },
  content: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
} as const;

/**
 * 输入框统一圆角
 *
 * Paper 的 outlined 输入框默认圆角很小（约 4dp），跟本项目卡片式的大圆角放在一起
 * 会显得"方"，所以统一提到 md 档。
 */
export const inputRoundness = radius.md;

/**
 * 所有输入框共用的 theme 覆盖 —— **统一走这个，别各处自己写**
 *
 * 曾经项目里两种写法混着用：
 *   - `theme={{ roundness: inputRoundness }}`
 *   - `outlineStyle={{ borderRadius: inputRoundness }}`
 * 效果一样，但写法两种，"改一处漏一处"就是这么来的。
 *
 * 用法：
 * ```
 * <TextInput mode="outlined" label="昵称" theme={inputTheme} />
 * ```
 *
 * ## 输入框的全局规范（新增输入框照这个来）
 *
 * 1. `mode="outlined"` + `theme={inputTheme}`
 * 2. **有语义的字段一律给 `label`** —— 点一下它会浮到边框上，这是本项目的统一观感。
 *    `placeholder` 只用来补例子（如"比如：妈妈生日"）。
 *    只有"搜索框"这类**没有语义标签**的才光用 placeholder。
 * 3. 多行输入必须加 `textAlignVertical="top"` —— 安卓上多行默认垂直居中，
 *    字会浮在框中间（iOS 默认就是 top，所以只有安卓露馅）。
 */
export const inputTheme = { roundness: inputRoundness };

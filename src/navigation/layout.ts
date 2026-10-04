/**
 * 全 App 的导航尺寸
 *
 * ## 统一约定
 *
 * 页面**没有系统导航栏**，只有上下两根**悬浮胶囊**：
 *
 * ```
 *   ╭─────────────────────────────╮   ← 顶部胶囊：返回 / 标题 / 操作
 *   │  ←     时光日志        ☰  ▶  │      top = 状态栏 + EDGE_GAP
 *   ╰─────────────────────────────╯
 *
 *          （页面内容，可滚动）
 *
 *   ╭─────────────────────────────╮   ← 底部胶囊：四个 tab
 *   │   🏠    📅    👥    👤       │      bottom = 安全区 + EDGE_GAP
 *   ╰─────────────────────────────╯
 * ```
 *
 * 两根胶囊**尺寸完全一致**（同高、同左右留白、同圆角），只是贴的边不同。
 * 页面内容需要自己避开它们，用下面的通用留白常量算，不要各写各的。
 */

/** 胶囊高度（上下两根共用） */
export const CAPSULE_HEIGHT = 52;

/**
 * 胶囊左右两侧距屏幕边缘的留白
 *
 * 上下两根胶囊**共用这一个值**，所以调它两根一起动，不会出现一宽一窄。
 *
 * 底部那根是在 `tabBarStyle` 里通过 `start` / `end` 生效的
 * （不能用 `left` / `right`，原因见 `TabNavigator` 里的注释）。
 */
export const CAPSULE_MARGIN = 4;

/**
 * 胶囊距状态栏 / 底部安全区的额外间距
 *
 * 上下两根共用，所以调它两根一起动。
 * 只算「安全区之外的额外留白」—— 安全区本身由 `insets` 提供。
 */
export const CAPSULE_EDGE_GAP = 4;

/**
 * 页面内容需要避让的留白（上下通用）
 *
 * = 间距 + 胶囊高 + 16 的呼吸位。
 *
 * 用法（页面自己还要叠系统的安全区）：
 * ```
 * paddingTop:    insets.top + CONTENT_CLEARANCE
 * paddingBottom: insets.bottom + CONTENT_CLEARANCE
 * ```
 *
 * 顶部避让的是顶部胶囊，底部避让的是底部胶囊 —— 两者高度和位置对称，所以共用一个值。
 */
export const CONTENT_CLEARANCE = CAPSULE_EDGE_GAP + CAPSULE_HEIGHT + 16;



/** 悬浮按钮的直径（40 是圆形图标钮的舒适值，再小就不好点了） */
export const FLOATING_BUTTON_SIZE = 40;

/**
 * 主操作按钮（FAB）的直径
 *
 * 比 `FLOATING_BUTTON_SIZE` 大一档，用来区分「主动作」和「次要入口」。
 *
 * ⚠️ 必须显式设死：Paper 的 `FAB` 默认 `size="large"`，在 M3 主题下
 * 渲染出来是 **96dp** 的巨物 —— 一列里塞三个会撑成一柱擎天。
 * 56 才是 FAB 的经典尺寸（和 Material 规范一致）。
 */
export const FAB_SIZE = 56;

/** 悬浮按钮距屏幕左右边缘与状态栏的留白 */
export const FLOATING_MARGIN = 8;

/**
 * 内容顶部与按钮**底边**之间留的那一点点呼吸位
 *
 * 只留一点点是有意的：按钮是圆的、只占左右两个角，
 * 下面的卡片是通栏的，不需要为了让开按钮而空出一大块。
 */
export const FLOATING_BREATHING = 4;

/**
 * 顶部**有**悬浮按钮时，页面内容要避让的高度
 *
 * = 上留白 + 按钮直径 + 呼吸位（8 + 40 + 4 = **52**）
 *
 * ⚠️ 这里算的是「从按钮**底边**起算」，不是「按钮全高 + 上下留白」。
 * 曾经的写法是 `按钮 + 留白 × 2 = 68`，结果首页状态栏下面白白空了近一屏的
 * 十分之一，看着就是「顶上莫名空了一截」。避让的基准永远是**按钮的下边缘**。
 */
export const FLOATING_CLEARANCE = FLOATING_MARGIN + FLOATING_BUTTON_SIZE + FLOATING_BREATHING;

/** 顶部**没有**任何悬浮按钮时，内容距状态栏的留白（只是别贴着状态栏） */
export const TOP_CONTENT_GAP = 8;

/** 底部 tab 的图标尺寸 */
export const TAB_ICON_SIZE = 24;

/**
 * tab 左右滑的转场时长（毫秒）
 *
 * `TabNavigator` 的 `transitionSpec` 用它。整屏转场是原生的、时长由
 * react-native-screens 的动画资源决定（Android 上写死 ≈400ms），不受这个常量影响 ——
 * 原因和「为什么不能用 JS 自己驱动」见 `.codebuddy/rules/rn-modal-and-transition/RULE.mdc`
 * 第 6 条。
 */
export const TRANSITION_DURATION = 180;

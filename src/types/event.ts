/**
 * 核心数据模型
 *
 * 字段定义照搬旧项目 legacy/uniapp 的本地存储结构，不要随意增删字段，
 * 否则从旧版迁移过来的数据会对不上。
 */

/** 日期类型：公历 / 农历 */
export type CalendarType = 'solar' | 'lunar';

/** 卡片尺寸 */
export type CardSize = 'small' | 'medium' | 'large';

/**
 * 农历信息（只有日历类型为「农历」的事件才有）
 *
 * 由 `utils/lunar.ts` 的 `lunarInfoFromSolar` 生成。
 *
 * ⚠️ `year/month/day` 存的是**公历**的年月日，而且**全项目没有地方读它** ——
 * 旧版的 `solarToLunar` 根本没返回过这三个字段（类型里的它们是早期设计的残留），
 * 所以老数据里它们可能是 `undefined`，故标成可选。
 * 真正被界面使用的是 `fullDate`（卡片、详情页、海报都在读）。
 */
export interface LunarInfo {
  year?: number;
  month?: number;
  day?: number;
  lunarYear: number;
  lunarMonth: number;
  lunarDay: number;
  isLeap: boolean;
  monthName: string;
  dayName: string;
  fullDate: string;
}

/** 一个倒计时事件 */
export interface EventItem {
  /** 新增时用 String(Date.now()) */
  id: string;

  /** 事件名称 */
  title: string;

  /** 图标（Emoji） */
  icon: string;

  /** 分类：7 个内置 key 之一，或 'custom_<timestamp>' */
  category: string;

  /** 公历 / 农历 */
  calendarType: CalendarType;

  /** 表单里的日期，格式 'YYYY-MM-DD' */
  date: string;

  /** 表单里的时间，格式 'HH:mm' */
  time: string;

  /** 目标时间（ISO），排序和倒计时都用它 */
  targetDateTime: string;

  /** 是否显示到时分（false 时只算到天） */
  showPreciseTime: boolean;

  /** 是否显示秒 */
  showSeconds: boolean;

  /** 字体颜色 key，对应 TEXT_COLOR_OPTIONS */
  textColor: string;

  /** 背景色：'follow' | 预设 key | 'custom' */
  bgColor: string;

  /** bgColor 为 'custom' 时的自定义色值，'#RRGGBB' */
  customBgColorValue?: string;

  /** 是否置顶（全局最多 3 个） */
  isTop: boolean;

  /** 备注，最长 200 字 */
  remark: string;

  /** 卡片尺寸 */
  cardSize: CardSize;

  /** 农历信息 */
  lunarInfo?: LunarInfo;

  /** 详情页：是否显示进度条 */
  showProgressBar?: boolean;

  /** 详情页：进度条起始时间（ISO），未设时回退到 createTime */
  startDateTime?: string;

  /** 创建时间（ISO） */
  createTime: string;

  /** 来源：从故事保存的事件会是 'story' */
  source?: 'story';

  /** 来源故事 id */
  sourceStoryId?: string;


  tag?: string;
  color?: string;
}

/** 自定义分类 */
export interface CategoryItem {
  /** 'custom_<timestamp>' */
  key: string;
  /** 分类名，最长 10 字 */
  name: string;
  /** 分类图标（Emoji） */
  icon: string;
}

/** 倒计时计算结果 */
export interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** 目标时间是否已过 */
  isPast: boolean;
  totalSeconds: number;
}

/** 进度条计算结果 */
export interface Progress {
  /** 0 - 100 */
  percent: number;
  label: '即将开始' | '进行中' | '已完成';
}

import type { Countdown, EventItem, Progress } from '../types/event';

/**
 * 倒计时 / 排序 / 日期格式化
 *
 * 规则全部照搬旧项目 legacy/uniapp，不要自行改动，否则显示结果和旧版不一致。
 * 旧版对应文件：pages/index/index.js、pages/detail/detail.js
 *
 * ⚠️ 记牢一点：天数是「毫秒差 ÷ 86400000 向下取整」，**不是自然日差**。
 *    今天 23:00 → 明天 01:00 的结果是 0 天，不是 1 天。旧版就是这么算的。
 */

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const MS_PER_HOUR = 1000 * 60 * 60;
const MS_PER_MINUTE = 1000 * 60;
const MS_PER_SECOND = 1000;

const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const;

/** 统一把字符串/Date 转成 Date；非法值返回 Invalid Date 由调用方兜底 */
function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * 计算倒计时。
 *
 * - `showPreciseTime = false`：只算到「天」，时/分/秒一律为 0
 * - `showPreciseTime = true`：拆出天/时/分/秒
 *
 * 已过去的事件同样返回正数（配合 `isPast` 判断方向），旧版就是这么显示的。
 */
export function calcCountdown(targetDateTime: string, showPreciseTime: boolean): Countdown {
  const target = toDate(targetDateTime).getTime();
  const now = Date.now();
  const diff = target - now;
  const absDiff = Math.abs(diff);

  return {
    days: Math.floor(absDiff / MS_PER_DAY),
    hours: showPreciseTime ? Math.floor((absDiff % MS_PER_DAY) / MS_PER_HOUR) : 0,
    minutes: showPreciseTime ? Math.floor((absDiff % MS_PER_HOUR) / MS_PER_MINUTE) : 0,
    seconds: showPreciseTime ? Math.floor((absDiff % MS_PER_MINUTE) / MS_PER_SECOND) : 0,
    isPast: diff < 0,
    totalSeconds: Math.floor(absDiff / MS_PER_SECOND),
  };
}

/**
 * 首页排序：按「目标时间与当前时间的绝对差值」升序。
 *
 * 含义是「快到的排前面，刚过去的也排前面」——过去的事件不会沉底。
 * 注意：**置顶不参与这把尺子**，置顶的前置是在渲染层另做的（见 splitTopEvents）。
 *
 * 不修改传入数组（旧版用的 sort 是原地排序，这里改成返回副本）。
 */
export function sortByClosest(events: EventItem[]): EventItem[] {

  const now = Date.now();
  const diffOf = (event: EventItem) =>
    Math.abs(toDate(event.targetDateTime).getTime() - now);

  return [...events].sort((a, b) => diffOf(a) - diffOf(b));
}

/**
 * 按「置顶在前」把列表拆成两段并拼接：`[...top, ...normal]`。
 *
 * 置顶最多取 3 个（排序后截断），旧版首页同样做了这层兜底，
 * 防止历史数据里置顶超过 3 个时显示错乱。
 */
export function splitTopEvents(events: EventItem[]): {
  top: EventItem[];
  normal: EventItem[];
  list: EventItem[];
} {
  const top = events.filter(event => event.isTop).slice(0, 3);
  const normal = events.filter(event => !event.isTop);
  return { top, normal, list: [...top, ...normal] };
}

/**
 * 计算进度条。
 *
 * 起始时间取值顺序（照搬旧版 `detail.js` 的 `updateProgress`）：
 *   1. `startDateTime`
 *   2. 回退到 `createTime`
 *   3. 再没有 → 「目标时间往前推 365 天」
 *
 * 状态判定：
 *   - `elapsed < 0`              → 0%，即将开始
 *   - `total > 0 && elapsed >= 0` → 实际百分比，进行中
 *   - 其余（目标早于起始）        → 100%，已完成
 */
export function calcProgress(
  startDateTime: string | undefined,
  targetDateTime: string,
  createTime?: string,
): Progress {
  const target = toDate(targetDateTime).getTime();
  const now = Date.now();

  let start: number;
  if (startDateTime) {
    start = toDate(startDateTime).getTime();
  } else if (createTime) {
    start = toDate(createTime).getTime();
  } else {
    start = target - 365 * MS_PER_DAY;
  }

  const total = target - start;
  const elapsed = now - start;

  if (elapsed < 0) {
    return { percent: 0, label: '即将开始' };
  }

  if (total > 0) {
    const raw = (elapsed / total) * 100;
    const clamped = Math.min(100, Math.max(0, raw));

    return { percent: Math.round(clamped * 10) / 10, label: '进行中' };
  }

  return { percent: 100, label: '已完成' };
}

/** 星期几，如 `周六` */
export function getWeekday(value: string | Date): string {
  return WEEKDAY_NAMES[toDate(value).getDay()];
}

/** 短日期，如 `2月6日`（不补零） */
export function formatShortDate(value: string | Date): string {
  const date = toDate(value);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/** 完整日期，如 `2027年2月6日`（不补零） */
export function formatFullDate(value: string | Date): string {
  const date = toDate(value);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

/** 首页卡片用的日期串，如 `2027年02月06日 周六`（补零 + 星期） */
export function formatDateWithWeekday(value: string | Date): string {
  const date = toDate(value);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}年${month}月${day}日 ${getWeekday(date)}`;
}

/** 把倒计时数字格式化成展示用文本，如 `3天 05:09` */
export function formatCountdownText(countdown: Countdown, showPreciseTime: boolean): string {
  if (!showPreciseTime) {
    return `${countdown.days}天`;
  }
  const hours = String(countdown.hours).padStart(2, '0');
  const minutes = String(countdown.minutes).padStart(2, '0');
  return `${countdown.days}天 ${hours}:${minutes}`;
}

const pad2 = (value: number) => String(value).padStart(2, '0');

/** `YYYY-MM-DD`，日历页按天归组事件时用 */
export function toDateKey(value: string | Date): string {
  const date = toDate(value);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** 是否同一天（比较年月日，忽略时分秒） */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

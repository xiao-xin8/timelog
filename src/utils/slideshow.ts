import { BG_COLOR_OPTIONS, TEXT_COLOR_OPTIONS } from '../constants';
import type { SlideshowConfig, SlideshowCountdownFormat } from '../constants/slideshow';
import type { EventItem } from '../types/event';
import { formatFullDate, getWeekday } from './countdown';

/**
 * 轮播放映的纯逻辑
 *
 * 筛选 / 排序 / 报错码**逐条照搬旧版**
 * `legacy/uniapp/pages/slideshow/settings.js` 的 `getFilteredEvents()`，
 * 连「未来 / 已过」判定用**日粒度**、而放映数据用**时间粒度**这种不一致也一并保留 ——
 * 改了会让新旧表现对不上（见下方注释）。
 *
 * 这里不碰任何 RN API，方便用 `npm run verify:slice14` 直接跑。
 */

export type SlideshowResultCode =
  | 'ok'
  | 'no_events'
  | 'no_future_events'
  | 'no_past_events'
  | 'all_filtered';

/** 旧版错误码对应文案，逐字照抄 */
export const SLIDESHOW_ERROR_MESSAGE: Record<Exclude<SlideshowResultCode, 'ok'>, string> = {
  no_events: '还没有添加任何事件，先去首页添加吧',
  no_future_events: '没有未来的事件，请开启"包含已过事件"或添加新事件',
  no_past_events: '没有已过的事件，请开启"包含未来事件"或添加新事件',
  all_filtered: '所有事件都被筛选条件排除了，请调整筛选设置',
};

/** 一张幻灯片：事件本体 + 放映时算出来的展示数据 */
export interface SlideItem extends EventItem {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isPast: boolean;
  fullDate: string;
  weekday: string;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const MS_PER_HOUR = 1000 * 60 * 60;
const MS_PER_MINUTE = 1000 * 60;

/**
 * 事件背景色。
 *
 * 与首页 `EventCard` 同一套取值：`follow` 返回 null（走卡片默认渐变），
 * `custom` 取自定义色，其余按 `BG_COLOR_OPTIONS` 的 key 取预设值。
 */
export function resolveEventBgColor(event: EventItem): string | null {
  if (event.bgColor === 'follow') return null;
  if (event.bgColor === 'custom') return event.customBgColorValue ?? '#FFFFFF';
  return BG_COLOR_OPTIONS.find(option => option.key === event.bgColor)?.value ?? null;
}

/** 事件文字色，取 `TEXT_COLOR_OPTIONS`，兜底可可色 */
export function resolveEventTextColor(event: EventItem): string {
  return (
    TEXT_COLOR_OPTIONS.find(option => option.key === event.textColor)?.value ?? TEXT_COLOR_OPTIONS[0].value
  );
}

/** 旧版用「只比较年月日」的天数差判未来 / 已过（与卡片倒计时不是同一把尺子） */
function isPastByDay(targetDateTime: string, now: number): boolean {
  const target = new Date(targetDateTime);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((target.getTime() - today.getTime()) / MS_PER_DAY);
  return diffDays < 0;
}

/** 把事件补全成幻灯片数据（倒计时按「此刻」算，时间粒度） */
export function buildSlide(event: EventItem, now: number): SlideItem {
  const diff = new Date(event.targetDateTime).getTime() - now;
  const abs = Math.abs(diff);

  return {
    ...event,
    days: Math.floor(abs / MS_PER_DAY),
    hours: Math.floor((abs % MS_PER_DAY) / MS_PER_HOUR),
    minutes: Math.floor((abs % MS_PER_HOUR) / MS_PER_MINUTE),
    seconds: Math.floor((abs % MS_PER_MINUTE) / 1000),
    isPast: diff < 0,
    fullDate: formatFullDate(event.targetDateTime),
    weekday: getWeekday(event.targetDateTime),
  };
}

/**
 * 筛选 + 排序，返回可直接放映的列表或错误码。
 *
 * 顺序（照搬旧版）：
 *   1. 空列表 → `no_events`
 *   2. 按「未来 / 已过」开关过滤（日粒度判定）
 *   3. 过滤后为空 → 按「哪一类被开关排除了」给出对应错误码
 *   4. 排序：`random` 打乱；否则先置顶，再按 order 排
 */
export function filterAndSortForSlideshow(
  events: EventItem[],
  config: SlideshowConfig,
  now: number = Date.now(),
): { code: SlideshowResultCode; events: SlideItem[] } {
  if (!events || events.length === 0) {
    return { code: 'no_events', events: [] };
  }

  let futureCount = 0;
  let pastCount = 0;

  const filtered = events.filter(event => {
    const past = isPastByDay(event.targetDateTime, now);
    if (past) pastCount += 1;
    else futureCount += 1;

    if (past && !config.pastEvents) return false;
    if (!past && !config.futureEvents) return false;
    return true;
  });

  if (filtered.length === 0) {
    if (futureCount > 0 && !config.futureEvents) {
      return { code: 'no_future_events', events: [] };
    }
    if (pastCount > 0 && !config.pastEvents) {
      return { code: 'no_past_events', events: [] };
    }
    return { code: 'all_filtered', events: [] };
  }

  const slides = filtered.map(event => buildSlide(event, now));

  if (config.order === 'random') {

    for (let i = slides.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [slides[i], slides[j]] = [slides[j], slides[i]];
    }
    return { code: 'ok', events: slides };
  }

  const shouldPrioritizeTop = config.order === 'priority' || config.priorityFirst;

  slides.sort((a, b) => {
    if (shouldPrioritizeTop) {
      if (a.isTop && !b.isTop) return -1;
      if (!a.isTop && b.isTop) return 1;
    }

    if (config.order === 'asc') {
      return new Date(a.targetDateTime).getTime() - new Date(b.targetDateTime).getTime();
    }
    if (config.order === 'desc') {
      return new Date(b.targetDateTime).getTime() - new Date(a.targetDateTime).getTime();
    }
    if (config.order === 'priority') {

      return a.days - b.days;
    }
    return 0;
  });

  return { code: 'ok', events: slides };
}

/** 倒计时里的一块（数字 + 单位） */
export interface CountdownBlock {
  value: number;
  unit: string;
  /** 单位是否受「显示天数单位」开关控制（只有「天」这一块是） */
  unitOptional: boolean;
}

/**
 * 按倒计时格式拆出天数 / 时分 / 秒的展示块。
 *
 * 与旧版模板一致：
 *   - `days`    → 只有「天」
 *   - `hours`   → 天 + 时 + 分
 *   - `seconds` → 天 + 时 + 分 + 秒
 */
export function getCountdownBlocks(
  slide: Pick<SlideItem, 'days' | 'hours' | 'minutes' | 'seconds'>,
  format: SlideshowCountdownFormat,
): CountdownBlock[] {
  const blocks: CountdownBlock[] = [{ value: slide.days, unit: '天', unitOptional: true }];

  if (format !== 'days') {
    blocks.push({ value: slide.hours, unit: '时', unitOptional: false });
    blocks.push({ value: slide.minutes, unit: '分', unitOptional: false });
  }
  if (format === 'seconds') {
    blocks.push({ value: slide.seconds, unit: '秒', unitOptional: false });
  }

  return blocks;
}

/** 「还有 / 已过」标签 */
export function getCountdownLabel(slide: Pick<SlideItem, 'isPast'>): string {
  return slide.isPast ? '已过' : '还有';
}

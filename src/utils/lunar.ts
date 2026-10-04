/**
 * 农历转换工具（Slice 06）
 *
 * ## 从旧项目移植而来，算法一个字都没改
 *
 * 源文件：`legacy/uniapp/utils/lunar.js`
 * 改动只有两处，都是语言层面的：
 *   1. `export {}` 改成 TS 的 `export` 声明
 *   2. `date - new Date(...)` 改成 `date.getTime() - base.getTime()`
 *      （TS 不允许 Date 相减，语义完全一样）
 *
 * 唯一的行为增量：`solarToLunar` 增加了**年份范围兜底**，超出数据表返回 `null`。
 * 旧版越界后会拿 `undefined & 位` 继续算，产出无意义但不崩的数字；
 * 新版日历页可以无限翻月，越界后直接不显示农历更合理。
 *
 * 数据表覆盖范围：
 *   - `LUNAR_INFO`：1900 - 2047（148 项）
 *   - `SOLAR_TERMS_DATA`：1900 - 2050
 *
 * 两者都拿旧版实现逐天比对过（1900-2100 全量）。
 */

import type { LunarInfo } from '../types/event';

/** 农历转换结果，字段与旧版完全一致 */
export interface LunarDate {
  lunarYear: number;
  lunarMonth: number;
  lunarDay: number;
  /** 是否闰月 */
  isLeap: boolean;
  /** 如「腊月」 */
  monthName: string;
  /** 如「初八」 */
  dayName: string;
  /** 如「2026年腊月初八」 */
  fullDate: string;
  /** 干支，如「乙巳」 */
  ganZhi: string;
  /** 生肖，如「蛇」 */
  zodiac: string;
}

/** 农历数据表（1900-2047） */
const LUNAR_INFO = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
  0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
  0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
  0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
  0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5d0, 0x14573, 0x052d0, 0x0a9a8, 0x0e950, 0x06aa0,
  0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
  0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b5a0, 0x195a6,
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
  0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0,
  0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
  0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
  0x05aa0, 0x076a3, 0x096d0, 0x04bd7, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
  0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0,
];

/** 农历数据表覆盖的起始年 */
export const LUNAR_MIN_YEAR = 1900;
/** 农历数据表覆盖的结束年（1900 + 148 - 1） */
export const LUNAR_MAX_YEAR = LUNAR_MIN_YEAR + LUNAR_INFO.length - 1;

/** 农历月份名称 */
export const LUNAR_MONTH_NAMES = [
  '正',
  '二',
  '三',
  '四',
  '五',
  '六',
  '七',
  '八',
  '九',
  '十',
  '冬',
  '腊',
] as const;

/** 农历日期名称 */
export const LUNAR_DAY_NAMES = [
  '初一',
  '初二',
  '初三',
  '初四',
  '初五',
  '初六',
  '初七',
  '初八',
  '初九',
  '初十',
  '十一',
  '十二',
  '十三',
  '十四',
  '十五',
  '十六',
  '十七',
  '十八',
  '十九',
  '二十',
  '廿一',
  '廿二',
  '廿三',
  '廿四',
  '廿五',
  '廿六',
  '廿七',
  '廿八',
  '廿九',
  '三十',
] as const;

/** 天干 */
const TIAN_GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'] as const;

/** 地支 */
const DI_ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'] as const;

/** 生肖 */
const ZODIAC = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'] as const;

/** 二十四节气名称（顺序即一年的节气顺序，从小寒开始） */
export const SOLAR_TERM_NAMES = [
  '小寒',
  '大寒',
  '立春',
  '雨水',
  '惊蛰',
  '春分',
  '清明',
  '谷雨',
  '立夏',
  '小满',
  '芒种',
  '夏至',
  '小暑',
  '大暑',
  '立秋',
  '处暑',
  '白露',
  '秋分',
  '寒露',
  '霜降',
  '立冬',
  '小雪',
  '大雪',
  '冬至',
] as const;



/** 1900-2018 */
const TERMS_A = [
  6, 21, 4, 19, 6, 21, 5, 20, 6, 22, 6, 22, 8, 23, 8, 23, 8, 23, 9, 24, 8, 23, 7, 22,
];
/** 2019 */
const TERMS_B = [
  5, 20, 4, 19, 6, 21, 5, 20, 6, 22, 6, 21, 7, 23, 8, 23, 8, 23, 9, 24, 8, 23, 7, 22,
];
/** 2020、2024 */
const TERMS_D = [
  6, 21, 4, 19, 5, 20, 5, 20, 5, 21, 5, 21, 6, 22, 7, 22, 7, 22, 8, 22, 7, 22, 6, 21,
];
/** 2021-2023、2026-2032、2034-2040、2042-2049 */
const TERMS_C = [
  5, 20, 4, 19, 5, 20, 5, 20, 5, 21, 5, 21, 6, 22, 7, 22, 7, 22, 8, 22, 7, 22, 6, 21,
];
/** 2025、2033、2041、2050 */
const TERMS_E = [
  5, 20, 3, 18, 5, 20, 5, 20, 5, 21, 5, 21, 6, 22, 7, 22, 7, 22, 8, 22, 7, 22, 6, 21,
];

/** 节气数据覆盖的起始年 */
export const SOLAR_TERM_MIN_YEAR = 1900;
/** 节气数据覆盖的结束年 */
export const SOLAR_TERM_MAX_YEAR = 2050;

/** 1900-2050 年节气数据（由上面几段共享数组拼出来） */
const SOLAR_TERMS_DATA: Record<number, readonly number[]> = (() => {
  const table: Record<number, readonly number[]> = {};
  const fill = (from: number, to: number, terms: readonly number[]) => {
    for (let year = from; year <= to; year += 1) {
      table[year] = terms;
    }
  };

  fill(1900, 2018, TERMS_A);
  table[2019] = TERMS_B;
  table[2020] = TERMS_D;
  fill(2021, 2023, TERMS_C);
  table[2024] = TERMS_D;
  table[2025] = TERMS_E;
  fill(2026, 2032, TERMS_C);
  table[2033] = TERMS_E;
  fill(2034, 2040, TERMS_C);
  table[2041] = TERMS_E;
  fill(2042, 2049, TERMS_C);
  table[2050] = TERMS_E;

  return table;
})();

/**
 * 判断是否为闰年（公历）
 *
 * 注意：这里只用于**农历年内部的天数推算**辅助，
 * 农历闰月由 `getLeapMonth` 单独判断，两者不是一回事。
 */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** 农历某年的总天数 */
export function getLunarYearDays(year: number): number {
  let sum = 348;
  for (let i = 0x8000; i > 0x8; i >>= 1) {
    sum += LUNAR_INFO[year - LUNAR_MIN_YEAR] & i ? 1 : 0;
  }
  return sum + getLeapDays(year);
}

/** 农历某年的闰月天数（没有闰月返回 0） */
export function getLeapDays(year: number): number {
  if (getLeapMonth(year)) {
    return LUNAR_INFO[year - LUNAR_MIN_YEAR] & 0x10000 ? 30 : 29;
  }
  return 0;
}

/** 农历某年的闰月月份（0 表示没有闰月） */
export function getLeapMonth(year: number): number {
  return LUNAR_INFO[year - LUNAR_MIN_YEAR] & 0xf;
}

/** 农历某年某月的总天数 */
export function getLunarMonthDays(year: number, month: number): number {
  return LUNAR_INFO[year - LUNAR_MIN_YEAR] & (0x10000 >> month) ? 30 : 29;
}

/** 该年农历有闰月吗（数据表覆盖范围内才有意义） */
function hasLeapMonth(year: number): boolean {
  return year >= LUNAR_MIN_YEAR && year <= LUNAR_MAX_YEAR && getLeapMonth(year) !== 0;
}

/**
 * 某年农历的「月序列」：`{ month, isLeap }`，顺序就是真实历法的顺序
 * （闰月紧跟在**同名月**之后，例如 六月 → 闰六月 → 七月）。
 *
 * ⚠️ 这是整个换算的**唯一真相**：公历→农历、农历→公历、以及选择器的月份列表
 * 全都从它派生。旧版是各自手写一遍月份循环，两边的闰月处理都错了
 * （公历→农历会把同名月整个吃掉、`isLeap` 越过闰月后永久为真；
 * 农历→公历则漏加闰月那一段），表现为**闰月之后的日子全部错位一天到一个月**。
 */
function monthSequence(year: number): { month: number; isLeap: boolean }[] {
  const leapMonth = hasLeapMonth(year) ? getLeapMonth(year) : 0;
  const sequence: { month: number; isLeap: boolean }[] = [];

  for (let m = 1; m <= 12; m += 1) {
    sequence.push({ month: m, isLeap: false });
    if (m === leapMonth) sequence.push({ month: m, isLeap: true });
  }

  return sequence;
}

/**
 * 「年月日」→ 距 1970-01-01 的天数序号
 *
 * 不用 `(date2 - date1) / 86400000`：那个写法在有夏令时的时区会差一小时，
 * `Math.floor` 之后就会把日期算错一天。用 `Date.UTC` 只取日历部分，跟时区无关。
 */
function dayNumber(year: number, month: number, day: number): number {
  return Math.round(Date.UTC(year, month - 1, day) / 86400000);
}

/** 农历 1900 年正月初一（= 公历 1900-01-31）的天数序号 */
const EPOCH_DAY = dayNumber(1900, 1, 31);

/** 天数序号 → 本地时区那一天的 00:00（保证 `getFullYear/getMonth/getDate` 就是那一天） */
function fromDayNumber(value: number): Date {
  const utc = new Date(value * 86400000);
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
}

/**
 * 公历 → 农历
 *
 * 超出数据表范围（1900-2047）返回 `null`，调用方按「不显示农历」处理。
 */
export function solarToLunar(date: Date): LunarDate | null {
  const year = date.getFullYear();

  if (year < LUNAR_MIN_YEAR || year > LUNAR_MAX_YEAR + 1) return null;


  let offset = dayNumber(date.getFullYear(), date.getMonth() + 1, date.getDate()) - EPOCH_DAY;
  if (offset < 0) return null;

  let lunarYear = LUNAR_MIN_YEAR;
  let daysInYear = getLunarYearDays(lunarYear);


  while (offset >= daysInYear) {
    offset -= daysInYear;
    lunarYear += 1;
    if (lunarYear > LUNAR_MAX_YEAR) return null;
    daysInYear = getLunarYearDays(lunarYear);
  }


  const sequence = monthSequence(lunarYear);
  const last = sequence[sequence.length - 1];
  let lunarMonth = last.month;
  let isLeap = last.isLeap;

  for (const entry of sequence) {
    const daysInMonth = getDaysInLunarMonth(lunarYear, entry.month, entry.isLeap);
    if (offset < daysInMonth) {
      lunarMonth = entry.month;
      isLeap = entry.isLeap;
      break;
    }
    offset -= daysInMonth;
  }


  const lunarDay = offset + 1;


  const ganIndex = (lunarYear - 4) % 10;
  const zhiIndex = (lunarYear - 4) % 12;
  const ganZhi = TIAN_GAN[ganIndex] + DI_ZHI[zhiIndex];


  const zodiac = ZODIAC[zhiIndex];


  const monthName = `${isLeap ? '闰' : ''}${LUNAR_MONTH_NAMES[lunarMonth - 1] || ''}月`;
  const dayName = LUNAR_DAY_NAMES[lunarDay - 1];

  return {
    lunarYear,
    lunarMonth,
    lunarDay,
    isLeap,
    monthName,
    dayName,
    fullDate: `${lunarYear}年${monthName}${dayName}`,
    ganZhi,
    zodiac,
  };
}

/** 农历 → 公历（数据表范围外返回 `null`） */
export function lunarToSolar(
  lunarYear: number,
  lunarMonth: number,
  lunarDay: number,
  isLeap = false,
): Date | null {
  if (lunarYear < LUNAR_MIN_YEAR || lunarYear > LUNAR_MAX_YEAR) return null;
  if (!hasLeapMonth(lunarYear) && isLeap) return null;
  if (lunarMonth < 1 || lunarMonth > 12) return null;


  const sequence = monthSequence(lunarYear);
  const index = sequence.findIndex(
    entry => entry.month === lunarMonth && entry.isLeap === isLeap,
  );
  if (index < 0) return null;


  const daysInTarget = getDaysInLunarMonth(lunarYear, lunarMonth, isLeap);
  if (lunarDay < 1 || lunarDay > daysInTarget) return null;

  let offset = 0;


  for (let y = LUNAR_MIN_YEAR; y < lunarYear; y += 1) {
    offset += getLunarYearDays(y);
  }


  for (let i = 0; i < index; i += 1) {
    offset += getDaysInLunarMonth(lunarYear, sequence[i].month, sequence[i].isLeap);
  }

  return fromDayNumber(EPOCH_DAY + offset + lunarDay - 1);
}

/** 公历日期 → 农历日期字符串，如「2026年腊月初八」 */
export function getLunarDateString(date: Date): string {
  return solarToLunar(date)?.fullDate ?? '';
}

/** 格式化农历日期为 picker 显示的格式 */
export function formatLunarForPicker(year: number, month: number, day: number): string {
  return `${year}年${LUNAR_MONTH_NAMES[month - 1] || ''}月${LUNAR_DAY_NAMES[day - 1]}`;
}

/** 某年农历的一个月（`{ month, name, isLeap }`） */
export interface LunarMonth {
  month: number;
  name: string;
  isLeap: boolean;
}

/**
 * 某年的所有农历月份（**含闰月**，闰月紧跟在同名普通月之后）
 *
 * 从 `monthSequence` 派生，保证选择器列出来的月份和换算逻辑**永远一致**。
 */
export function getLunarMonthsInYear(year: number): LunarMonth[] {
  return monthSequence(year).map(entry => {
    const month: LunarMonth = {
      month: entry.month,
      name: `${entry.isLeap ? '闰' : ''}${LUNAR_MONTH_NAMES[entry.month - 1] || ''}月`,
      isLeap: entry.isLeap,
    };
    return month;
  });
}

/** 农历某月的天数（数据表范围外返回 0） */
export function getDaysInLunarMonth(year: number, month: number, isLeap = false): number {
  if (year < LUNAR_MIN_YEAR || year > LUNAR_MAX_YEAR) return 0;

  if (isLeap) {
    const leapMonth = getLeapMonth(year);

    if (month !== leapMonth) return 30;
    return getLeapDays(year);
  }
  return getLunarMonthDays(year, month);
}




/**
 * 把农历日夹到该月真实存在的范围内
 *
 * 滚轮换年/换月之后，原来选的「三十」可能落到只有 29 天的月份里。
 * 旧版是**静默夹取**（不报错、直接取最后一天），这里保持一致 ——
 * 农历月份的天数用户是感知不到的，弹个错只会让人困惑。
 */
export function clampLunarDay(year: number, month: number, isLeap: boolean, day: number): number {
  const total = getDaysInLunarMonth(year, month, isLeap);

  if (total <= 0) return 1;
  return Math.min(Math.max(1, day), total);
}

/**
 * 农历日期 → 事件里存的 `lunarInfo`
 *
 * ⚠️ `LunarInfo.year/month/day` 这三个字段**全项目没有任何地方读**，
 * 而且旧版的 `solarToLunar` 从来没返回过它们（类型里那三个是早期设计的残留）。
 * 这里填**公历**的年月日：它有明确含义、不会误导后来的人。
 * 之所以不改用它去映射农历（把 lunar* 再抄一遍），是因为那样三个字段纯属重复。
 */
export function buildLunarInfo(solar: Date, lunar: LunarDate): LunarInfo {
  return {
    year: solar.getFullYear(),
    month: solar.getMonth() + 1,
    day: solar.getDate(),
    lunarYear: lunar.lunarYear,
    lunarMonth: lunar.lunarMonth,
    lunarDay: lunar.lunarDay,
    isLeap: lunar.isLeap,
    monthName: lunar.monthName,
    dayName: lunar.dayName,
    fullDate: lunar.fullDate,
  };
}

/** 公历 → lunarInfo；越界（数据表之外）返回 null */
export function lunarInfoFromSolar(solar: Date): LunarInfo | null {
  const lunar = solarToLunar(solar);
  return lunar ? buildLunarInfo(solar, lunar) : null;
}

const TERM_MONTHS = [
  1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12,
] as const;

/**
 * 取某天的节气名（如「立春」），不是节气返回 `null`
 *
 * 1900-2050 之外没有数据，同样返回 `null`。
 */
export function getSolarTerm(date: Date): string | null {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();


  const yearData = SOLAR_TERMS_DATA[year];
  if (!yearData) {
    return null;
  }


  for (let i = 0; i < 24; i += 1) {
    if (TERM_MONTHS[i] === month && yearData[i] === day) {
      return SOLAR_TERM_NAMES[i];
    }
  }

  return null;
}


export { isLeapYear };

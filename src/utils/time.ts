/**
 * 时间展示
 *
 * 只做「给用户看」的格式化；业务计算（倒计时、进度、日期键）在 `utils/countdown.ts`。
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;

/**
 * 「3 小时前」这种相对时间。
 *
 * 用户关心的是"新不新"，不是精确时间戳，所以按"多久以前"递进；
 * 超过一个月才回退到日期。
 *
 * ## 为什么 `now` 是个参数
 *
 * 默认取当前时间，但**必须能注入** —— 否则这个函数没法写确定性的测试
 * （跑测试的机器和"现在"永远是同一个瞬间，断不出"3 小时前"）。
 *
 * ⚠️ 时钟回拨（用户手动改过系统时间）时返回「刚刚」，不显示负数。
 */
export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const diff = now - timestamp;
  if (diff < 0) return '刚刚';

  if (diff < MINUTE) return '刚刚';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分钟前`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`;
  if (diff < MONTH) return `${Math.floor(diff / DAY)} 天前`;

  const date = new Date(timestamp);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

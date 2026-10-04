import type { ChatMessage, StoryMessagePayload } from '../types/chat';

/**
 * 聊天的纯逻辑（Slice 13）
 *
 * 单独一个模块是为了能脱离 RN 跑验证脚本 —— 消息预览和时间分隔的规则
 * 改起来很容易出错，值得有测试盯着。
 */

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** 相隔多久才插一条时间分隔（照旧版：5 分钟） */
const TIME_GAP = 5 * MINUTE;

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const;

const pad2 = (value: number): string => String(value).padStart(2, '0');

/** 取某天的 00:00，用来算"隔了几天" */
function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}



/**
 * 会话列表里那行「最后一条消息」的预览文案。
 *
 * - `text` → 直接用内容，但**把换行压成空格** —— 多行内容会把列表行撑高，
 *   而这一行是定高的
 * - `story` → 「[分享了一个故事] 妈妈生日」
 */
export function messagePreview(message: ChatMessage): string {
  if (message.type === 'story') {
    const payload = parseStoryMessage(message);
    return payload ? `[分享了一个故事] ${payload.title}` : '[分享了一个故事]';
  }

  return message.content.replace(/\s+/g, ' ').trim();
}

/**
 * 解析故事卡片消息。
 *
 * 返回 `null` 表示解析不出来 —— 消息是**别人发来的**，内容格式不能保证
 * （旧数据、手工构造的请求都可能），所以调用方必须能接住 null
 * 而不是让它抛出去把整个列表搞崩。
 */
export function parseStoryMessage(message: ChatMessage): StoryMessagePayload | null {
  if (message.type !== 'story') return null;

  try {
    const parsed = JSON.parse(message.content) as Partial<StoryMessagePayload>;
    if (!parsed.storyId || !parsed.title) return null;

    return {
      storyId: parsed.storyId,
      title: parsed.title,
      icon: parsed.icon || '📖',
    };
  } catch {
    return null;
  }
}



/**
 * 聊天室里的时间戳文案。
 *
 * 越近的越具体，越远的越粗略（照旧版的规则）：
 *
 * ```
 * 今天   → 14:30
 * 昨天   → 昨天 14:30
 * 本周   → 周三 14:30
 * 更早   → 3月5日 14:30
 * ```
 *
 * `now` 可注入 —— 否则这个函数没法写确定性的测试。
 */
export function formatMessageTime(timestamp: number, now = Date.now()): string {
  const date = new Date(timestamp);
  const clock = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;


  const dayDiff = Math.round((startOfDay(new Date(now)) - startOfDay(date)) / DAY);

  if (dayDiff <= 0) return clock;
  if (dayDiff === 1) return `昨天 ${clock}`;
  if (dayDiff < 7) return `${WEEKDAYS[date.getDay()]} ${clock}`;

  return `${date.getMonth() + 1}月${date.getDate()}日 ${clock}`;
}

/**
 * 两条消息之间要不要插一条时间分隔。
 *
 * 规则：**首条必插**；和上一条相隔超过 5 分钟才插。
 * 这样连续聊天的消息会连成一片，只有真正"隔了一会儿"才断开。
 */
export function shouldShowTime(current: number, previous: number | null): boolean {
  if (previous === null) return true;


  if (current < previous) return true;

  return current - previous > TIME_GAP;
}

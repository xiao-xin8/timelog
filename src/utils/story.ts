import type { EventItem } from '../types/event';
import type { StoryEventSnapshot } from '../types/story';
import { toDateKey } from './countdown';
import { clampRemark } from './event';



/** 备注里引用的正文长度（旧版是 50 字，超了加省略号） */
const REMARK_PREVIEW_LENGTH = 50;

/**
 * 把故事里的**事件快照**补齐成完整的 `EventItem`。
 *
 * ## 为什么需要它
 *
 * 故事里存的是发布那一刻的**深拷贝副本**，用 `Partial<EventItem>` 表示 ——
 * 历史数据可能缺字段（早期版本没有 `lunarInfo`、`showProgressBar` 之类）。
 * 而下游组件（`CountdownCard`、卡片渲染）都要完整字段，缺了会渲染出 undefined。
 *
 * 补的是**默认值**，快照里已有的值原样保留。
 *
 * 返回 `null` 表示这条快照**没法展示倒计时**（没有目标时间）。
 * 这种情况下页面不显示倒计时卡，「存为我的事件」也不可用。
 */
export function normalizeSnapshot(snapshot: StoryEventSnapshot): EventItem | null {
  const { targetDateTime, title } = snapshot;
  if (!targetDateTime || !title) return null;

  return {
    id: snapshot.id ?? '',
    title,
    icon: snapshot.icon || '📅',
    category: snapshot.category ?? 'other',
    calendarType: snapshot.calendarType ?? 'solar',

    date: snapshot.date || toDateKey(targetDateTime),
    time: snapshot.time ?? '00:00',
    targetDateTime,
    showPreciseTime: snapshot.showPreciseTime ?? false,
    showSeconds: snapshot.showSeconds ?? false,
    textColor: snapshot.textColor ?? 'default',
    bgColor: snapshot.bgColor ?? 'follow',
    customBgColorValue: snapshot.customBgColorValue,
    isTop: snapshot.isTop ?? false,
    remark: snapshot.remark ?? '',
    cardSize: snapshot.cardSize ?? 'medium',
    lunarInfo: snapshot.lunarInfo,
    showProgressBar: snapshot.showProgressBar,
    startDateTime: snapshot.startDateTime,
    createTime: snapshot.createTime ?? new Date().toISOString(),
  };
}

/**
 * 把本地事件转成故事里带的**事件快照**（Slice 11d 发布用）
 *
 * 先整份拷一份（故事存的是副本，不是引用 —— 事件之后被改被删，故事上那个日子不该跟着变），
 * 再摘掉三个**不该跟着走**的字段：
 *
 * | 摘掉 | 为什么 |
 * |---|---|
 * | `isTop` | 别人「存为我的事件」时不该继承置顶。那边也会重置一次，这里是双保险 |
 * | `source` / `sourceStoryId` | 那是"这条事件是从某个故事存来的"的标记。再发出去会让下一个人看到一条指向别人的来源 |
 */
export function toStorySnapshot(event: EventItem): StoryEventSnapshot {
  const snapshot: StoryEventSnapshot = { ...event };

  delete snapshot.isTop;
  delete snapshot.source;
  delete snapshot.sourceStoryId;

  return snapshot;
}

/**
 * 备注里追加「从时光故事保存：<正文前 50 字>」。
 *
 * 照抄旧版 `story-detail.js:660` 的规则：
 *   有原备注 → `原备注\n\n从时光故事保存：…`
 *   无原备注 → `从时光故事保存：…`
 *
 * 最后统一 `clampRemark` 截到 200 字 —— 拼完很容易超，
 * 而备注有长度上限，不截的话会写进去一条超标数据。
 */
export function withStoryRemark(existing: string | undefined, content: string): string {
  const preview = content.slice(0, REMARK_PREVIEW_LENGTH);
  const suffix = content.length > REMARK_PREVIEW_LENGTH ? '...' : '';
  const line = `从时光故事保存：${preview}${suffix}`;

  const base = (existing ?? '').trim();
  return clampRemark(base ? `${base}\n\n${line}` : line);
}

/**
 * 「存为我的事件」：把故事里的快照复制成一个**新事件**。
 *
 * ## 哪些字段要重置（照抄旧版 `story-detail.js:635-701`）
 *
 * 事件里有几项是"用户的个人偏好"，不该从别人的故事里继承过来：
 * 分类（对方用的分类你未必有）、配色、卡片尺寸、精度开关、置顶。
 *
 * ⚠️ **`targetDateTime` 不动** —— 那是故事带的那个日子，改了故事就没意义了。
 *
 * ## 不去重
 *
 * 同一条故事可以存多次，每次都是一个新事件（旧版就这样）。
 * 用户想存两遍是他的自由，硬去重反而会让人困惑"为什么点了没反应"。
 */
export function buildEventFromSnapshot(
  snapshot: StoryEventSnapshot,
  storyId: string,
  content: string,
  now = Date.now(),
): EventItem | null {
  const base = normalizeSnapshot(snapshot);
  if (!base) return null;

  return {
    ...base,

    id: String(now),


    category: 'other',
    textColor: 'default',
    bgColor: 'follow',
    customBgColorValue: undefined,
    cardSize: 'medium',
    time: '00:00',
    showPreciseTime: false,
    showSeconds: false,

    isTop: false,


    source: 'story',
    sourceStoryId: storyId,

    remark: withStoryRemark(snapshot.remark, content),
    createTime: new Date(now).toISOString(),
  };
}

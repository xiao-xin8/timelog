import type { EventItem } from './event';



/** 故事里的作者信息（后端只给这几个字段，别拿它当完整用户对象用） */
export interface StoryAuthor {
  id: string;
  nickname: string | null;
  username: string;
  /** 头像**相对路径**，和 `AuthUser.avatarPath` 一样要靠 `API_BASE_URL` 拼 */
  avatarPath: string | null;
}

/**
 * 故事里带的事件快照
 *
 * 这是发布时**深拷贝**进去的副本，**不是**对某个事件的引用 ——
 * 事件后来被改了或者删了，故事上带着的那个日子不该跟着变。
 *
 * 用 `Partial<EventItem>` 而不是完整的 `EventItem`：快照是历史数据，
 * 旧故事里可能缺字段（比如早期版本没有 `lunarInfo`），
 * 展示时要按"有就显示"处理。
 */
export type StoryEventSnapshot = Partial<EventItem>;

export interface StoryItem {
  id: string;
  content: string;
  /** 快照解析失败时后端会给 null，所以这里要能接住 */
  event: StoryEventSnapshot | null;
  tags: string[];
  likes: number;
  comments: number;
  createTime: number;
  updateTime: number;
  author: StoryAuthor;
  /** **当前用户**赞过没有 —— 列表里直接拿它画红心，不用再问一次 */
  liked: boolean;
}

export interface StoryComment {
  id: string;
  storyId: string;
  content: string;
  createTime: number;
  author: StoryAuthor;
}

export interface StoryPage {
  stories: StoryItem[];
  hasMore: boolean;
}

export interface StoryCommentPage {
  comments: StoryComment[];
  hasMore: boolean;
}

/** 发布时提交的内容 */
export interface StoryDraft {
  content: string;
  event: StoryEventSnapshot;
  tags: string[];
}



/**
 * 这几条**必须**和后端 `api/src/routes/story.ts` 里的常量一致。
 *
 * 前端先拦一道是为了即时反馈（不用等一次请求往返才知道超长了），
 * 但后端那道才是真正生效的 —— 客户端能被绕过。
 */
export const STORY_CONTENT_MAX = 500;
export const STORY_COMMENT_MAX = 200;
export const STORY_TAG_MAX_LENGTH = 10;
export const STORY_TAG_MAX_COUNT = 3;

/** 分页默认值（和后端一致） */
export const STORY_PAGE_SIZE = 10;
export const STORY_COMMENT_PAGE_SIZE = 4;

/** 热门话题预设（照抄旧版 `story-share.js:20`） */
export const STORY_TOPIC_PRESETS = [
  '生日分享',
  '纪念日',
  '旅行',
  '工作',
  '学习',
  '节日',
  '生活',
] as const;

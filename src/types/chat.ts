/**
 * 聊天的类型（Slice 13）
 *
 * ⚠️ 聊天**不参与云同步**（和故事一样）。`/api/sync` 只同步「个人的事件和分类」，
 * 聊天走 `services/chat.ts` 里的独立接口：发出去就是要立刻到达，
 * 和"本地改动攒起来合并成一次推送"是两套模型。
 */

/** 能发的两种消息 */
export type ChatMessageType = 'text' | 'story';

export interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  /**
   * 消息正文。
   *
   * `type === 'story'` 时它是一段 **JSON 字符串**（见 `StoryMessagePayload`）——
   * 服务端不解析、原样存，客户端自己解。这么设计是为了以后加新消息类型时
   * 后端不用改（多一个 `type` 而已）。
   */
  content: string;
  type: ChatMessageType;
  /**
   * 这条消息的接收者读过没有。
   *
   * 注意语义：它说的是**接收者**读没读。所以对自己发出去的消息，
   * 它是"对方读了没"；对收到的消息，它是"我读了没"（拉历史时会被置真）。
   */
  isRead: boolean;
  createTime: number;
}

/** `type === 'story'` 时 `content` 里那段 JSON 的结构 */
export interface StoryMessagePayload {
  storyId: string;
  title: string;
  icon: string;
}

/** 会话列表里的一条：某个人的未读数 + 我和他之间的最后一条消息 */
export interface ChatConversation {
  /** 对方是谁 */
  userId: string;
  unread: number;
  lastMessage: ChatMessage;
}

/** `GET /api/chat/stats` 的返回 */
export interface ChatStats {
  conversations: ChatConversation[];
  totalUnread: number;
}

/** 发消息时提交的内容 */
export interface ChatDraft {
  targetUserId: string;
  content: string;
  type?: ChatMessageType;
}



/**
 * 单条消息长度上限。
 *
 * ⚠️ **必须和后端 `api/src/routes/chat.ts` 的 `MESSAGE_MAX` 一致。**
 *
 * 前端先拦一道是为了即时反馈（不用等一次请求往返才知道超长了），
 * 但后端那道才是真正生效的 —— 客户端能被绕过。
 */
export const CHAT_MESSAGE_MAX = 2000;

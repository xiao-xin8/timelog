import type { AuthUser } from './api';
import { request } from './api';
import { API_BASE_URL, API_PREFIX } from './config';
import { cachedGet, invalidate } from './httpCache';
import type { ChatConversation, ChatDraft, ChatMessage, ChatStats } from '../types/chat';



/** 让调用方按需绕开缓存（下拉刷新 / 重试用） */
interface RefreshOption {
  force?: boolean;
}



/**
 * 除自己以外的**全部**用户。
 *
 * 不是"聊过天的人"（旧版就是这个语义）：新人一进列表就能看到所有人、
 * 直接开聊，不需要先"加好友"。
 */
export async function fetchUsers(options: RefreshOption = {}): Promise<AuthUser[]> {
  const data = await cachedGet<{ users: AuthUser[] }>('/users', {
    tier: 'long',
    persist: true,
    force: options.force,
  });
  return data.users;
}

export async function fetchUser(id: string, options: RefreshOption = {}): Promise<AuthUser> {
  const data = await cachedGet<{ user: AuthUser }>(`/users/${encodeURIComponent(id)}`, {
    tier: 'normal',
    persist: true,
    force: options.force,
  });
  return data.user;
}



/**
 * 会话列表页要的一切：**用户目录 + 会话摘要**，一个请求拿回。
 *
 * 合并前是 `fetchUsers()` + `fetchChatStats()` 两个并行请求。
 *
 * 缓存按 `short`（10 秒）走 —— 和原来 `chat/stats` 那一档一致。
 * 为什么不给 `long`：里面混着**未读数**，那玩意儿 TTL 长了红点就不准了；
 * 而"每次都省一个请求"的收益，本来就来自"这个页面每次 focus 都拉一次"。
 */
export async function fetchChatOverview(
  options: RefreshOption = {},
): Promise<{ users: AuthUser[]; conversations: ChatConversation[]; totalUnread: number }> {
  return await cachedGet(
    '/chat/overview',
    { tier: 'list', force: options.force },
  );
}

/**
 * 进聊天室要的一切：**对方资料 + 历史消息 + 在线状态**，一个请求拿回。
 *
 * 合并前是 3 个请求（`fetchUser` + `fetchMessages` + `fetchOnlineStatus`）。
 *
 * ⚠️ **绝对不能缓存**：历史和在线状态都是实时的，而且历史那个接口
 * 带"顺手标已读"的副作用（合并接口内部仍然只执行一次）。
 */
export async function fetchChatRoom(
  targetUserId: string,
): Promise<{ user: AuthUser; messages: ChatMessage[]; online: boolean }> {
  return await request(
    `/chat/room?targetUserId=${encodeURIComponent(targetUserId)}`,
  );
}



export async function fetchChatStats(options: RefreshOption = {}): Promise<ChatStats> {
  return await cachedGet<ChatStats>('/chat/stats', { tier: 'short', force: options.force });
}

/**
 * 拉两个人之间的历史（最新的在前）。**服务端会顺手把对方发来的标已读**。
 *
 * ⚠️ **绝对不能缓存这个接口**：它的副作用就是"标已读"。
 * 一旦缓存命中、请求没发出去，对方的消息就永远标不上已读、未读数也清不掉。
 * 也**不做去重** —— WS 推来新消息时会重拉一次，如果那次复用了进来时
 * 还在飞的旧请求，新消息就漏了。
 */
export async function fetchMessages(targetUserId: string): Promise<ChatMessage[]> {
  const data = await request<{ messages: ChatMessage[] }>(
    `/chat/messages?targetUserId=${encodeURIComponent(targetUserId)}`,
  );
  return data.messages;
}

export async function sendMessage(draft: ChatDraft): Promise<ChatMessage> {
  const data = await request<{ message: ChatMessage }>('/chat/messages', {
    method: 'POST',
    body: draft,
  });


  invalidate('/chat');

  return data.message;
}

/**
 * 清空两个人之间的全部记录。
 *
 * 语义是「清空这个对话」—— **两边一起删**，不是"我这儿隐藏"。
 * 返回实际删掉的条数。
 */
export async function clearMessages(targetUserId: string): Promise<number> {
  const data = await request<{ deleted: number }>(
    `/chat/messages?targetUserId=${encodeURIComponent(targetUserId)}`,
    { method: 'DELETE' },
  );

  invalidate('/chat');

  return data.deleted;
}



/**
 * 查这几个人在不在线，返回**在线的那几个 id**。
 *
 * 进聊天室时问一次 —— `presence` 推送只在状态**变化**时发，
 * 对方可能在你进来之前就一直在线上，不会有"变化"推给你。
 */
export async function fetchOnlineStatus(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];

  const data = await request<{ online: string[] }>(
    `/chat/online?userIds=${encodeURIComponent(userIds.join(','))}`,
  );
  return data.online;
}



/**
 * 拼 WebSocket 地址。
 *
 * `API_BASE_URL` 是 https 的，换成 wss；`/api` 前缀要自己补
 * （`API_BASE_URL` 本身不含它，`apiUrl()` 才负责拼）。
 *
 * token 走 **query** 而不是请求头 —— 浏览器的 WebSocket 构造器不允许
 * 自定义请求头，为了让这行代码在任何客户端都能用，统一用 query
 * （服务端也是按这个设计的）。
 */
export function chatSocketUrl(accessToken: string): string {
  const ws = API_BASE_URL.replace(/^http/, 'ws');
  return `${ws}${API_PREFIX}/chat/ws?token=${encodeURIComponent(accessToken)}`;
}

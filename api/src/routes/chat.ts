import * as chat from '../db/chat';
import type { ChatMessageRow } from '../db/chat';
import * as db from '../db/queries';
import { generateId } from '../lib/encoding';
import { Errors } from '../lib/errors';
import { verifyAccessToken } from '../lib/jwt';
import { ok, unwrapData } from '../lib/response';
import { asRecord, readJson, str } from '../lib/validate';
import { requireUserId } from '../middleware/auth';
import * as usersRoutes from './users';



/** 单条消息上限（照旧版） */
const MESSAGE_MAX = 2000;

/** 一次拉多少条历史（照旧版：只保留最近 100 条的量级） */
const HISTORY_LIMIT = 100;

/** 消息类型：纯文本 / 分享的故事卡片 */
const MESSAGE_TYPES = ['text', 'story'] as const;

/**
 * DO 的名字。
 *
 * 全局一个 —— 个人 App 的在线连接量级用不着按会话分片。
 * 换成 `idFromName(会话id)` 是按会话分片的写法，等真有量了再说。
 */
const HUB_NAME = 'global';



function toPublicMessage(row: ChatMessageRow) {
  return {
    id: row.id,
    senderId: row.sender_id,
    receiverId: row.receiver_id,
    content: row.content,
    type: row.type,
    isRead: row.is_read === 1,
    createTime: row.create_time,
  };
}

/** 对方必须是个真实账号，不然会话列表会指向一个不存在的人 */
async function assertUserExists(env: Env, userId: string): Promise<void> {
  const target = await db.getUserById(env.DB, userId);
  if (!target) throw Errors.notFound('对方账号不存在');
}

/**
 * 让 ChatHub 把内容推给这几个**在线**用户。
 *
 * 全是 fire-and-forget 的语义：失败直接吞掉（见文件头说明）。
 */
async function broadcast(env: Env, userIds: string[], message: unknown): Promise<void> {
  try {
    const hub = env.CHAT_HUB.get(env.CHAT_HUB.idFromName(HUB_NAME));
    await hub.fetch('https://chat-hub/broadcast', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userIds, message }),
    });
  } catch {
    // 推不出去就算了：消息已经在 D1 里，对方下次进聊天室能拉到
  }
}



/**
 * GET /api/chat/stats
 *
 * 返回「每个对话的未读数 + 最后一条消息」。
 *
 * 会话列表本身来自 `GET /api/users`（旧版就是列**所有**其他用户，
 * 没聊过的也在列表里），这个接口只补消息相关的部分，前端按 userId 合并。
 */
export async function stats(request: Request, env: Env): Promise<Response> {
  const userId = await requireUserId(request, env);


  const [lastRows, unreadRows] = await Promise.all([
    chat.lastMessagePerPartnerStatement(env.DB, userId).all<ChatMessageRow>(),
    chat.unreadPerSenderStatement(env.DB, userId).all<{ sender_id: string; unread: number }>(),
  ]);

  const unreadMap = new Map<string, number>();
  let totalUnread = 0;
  for (const row of unreadRows.results ?? []) {
    unreadMap.set(row.sender_id, row.unread);
    totalUnread += row.unread;
  }

  const conversations = (lastRows.results ?? []).map(row => {

    const partnerId = row.sender_id === userId ? row.receiver_id : row.sender_id;

    return {
      userId: partnerId,
      unread: unreadMap.get(partnerId) ?? 0,
      lastMessage: toPublicMessage(row),
    };
  });

  return ok({ conversations, totalUnread });
}



/**
 * GET /api/chat/messages?targetUserId=
 *
 * 拉两个人之间的历史（最新的在前）。
 *
 * ⚠️ **顺手把对方发来的标成已读**，和旧版一致 —— 不需要客户端再发一个
 * "我读了"的请求。如果这次真的标动了，还会广播给发送者，让他那边的
 * 「已发送」变成「已读」。
 */
export async function listMessages(request: Request, env: Env): Promise<Response> {
  const userId = await requireUserId(request, env);

  const targetId = str(
    { targetUserId: new URL(request.url).searchParams.get('targetUserId') ?? undefined },
    'targetUserId',
  );
  if (!targetId) throw Errors.badRequest('缺少 targetUserId', 'TARGET_REQUIRED');


  const marked = await chat.markConversationReadStatement(env.DB, { userId, targetId }).run();
  const changed = (marked.meta as { changes?: number } | undefined)?.changes ?? 0;

  if (changed > 0) {

    await broadcast(env, [targetId], { type: 'read', by: userId });
  }

  const result = await chat
    .listMessagesStatement(env.DB, { userId, targetId, limit: HISTORY_LIMIT })
    .all<ChatMessageRow>();

  return ok({ messages: (result.results ?? []).map(toPublicMessage) });
}



/**
 * POST /api/chat/messages
 *
 * body：`{ targetUserId, content, type? }`
 *
 * `type` 为 `'story'` 时 `content` 是一段 JSON（storyId / title / icon），
 * 由客户端自己拼 —— 服务端不解析它，原样存、原样推。
 */
export async function sendMessage(request: Request, env: Env): Promise<Response> {
  const userId = await requireUserId(request, env);
  const body = asRecord(await readJson(request));

  const targetId = str(body, 'targetUserId');
  if (!targetId) throw Errors.badRequest('缺少 targetUserId', 'TARGET_REQUIRED');
  if (targetId === userId) throw Errors.badRequest('不能给自己发消息', 'SELF_MESSAGE');

  const content = str(body, 'content');
  if (!content) throw Errors.badRequest('消息内容不能为空', 'CONTENT_REQUIRED');
  if (content.length > MESSAGE_MAX) {
    throw Errors.badRequest(`消息最多 ${MESSAGE_MAX} 个字`, 'CONTENT_TOO_LONG');
  }

  const rawType = str(body, 'type') ?? 'text';
  if (!MESSAGE_TYPES.includes(rawType as (typeof MESSAGE_TYPES)[number])) {
    throw Errors.badRequest('消息类型不支持', 'TYPE_INVALID');
  }

  await assertUserExists(env, targetId);

  const row: ChatMessageRow = {
    id: generateId('msg'),
    sender_id: userId,
    receiver_id: targetId,
    content,
    type: rawType,
    is_read: 0,
    create_time: Date.now(),
  };

  await chat.insertMessageStatement(env.DB, {
    id: row.id,
    senderId: row.sender_id,
    receiverId: row.receiver_id,
    content: row.content,
    type: row.type,
    now: row.create_time,
  }).run();

  const message = toPublicMessage(row);



  await broadcast(env, [userId, targetId], { type: 'message', message });

  return ok({ message }, 201);
}



/**
 * DELETE /api/chat/messages?targetUserId=
 *
 * 清空两个人之间的**全部**记录 —— 两边一起删。
 * 这是"清空这个对话"，不是"我这儿隐藏"（旧版就是这个语义）。
 */
export async function clearMessages(request: Request, env: Env): Promise<Response> {
  const userId = await requireUserId(request, env);

  const targetId = str(
    { targetUserId: new URL(request.url).searchParams.get('targetUserId') ?? undefined },
    'targetUserId',
  );
  if (!targetId) throw Errors.badRequest('缺少 targetUserId', 'TARGET_REQUIRED');

  const result = await chat.clearConversationStatement(env.DB, { userId, targetId }).run();
  const deleted = (result.meta as { changes?: number } | undefined)?.changes ?? 0;


  await broadcast(env, [targetId], { type: 'cleared', by: userId });

  return ok({ deleted });
}



/**
 * GET /api/chat/online?userIds=a,b,c
 *
 * 查这几个人在不在线。
 *
 * **为什么需要主动查一次**：`presence` 推送只在状态**变化**时发。对方可能
 * 在你打开聊天室之前就一直在线上，不会有"变化"推给你，只能进来问一次。
 *
 * 查不到（DO 抽风）就当作都不在线 —— 界面会显示「已连接」而不是卡在
 * "连接中"，不会误导成"我这边没连上"。
 */
export async function online(request: Request, env: Env): Promise<Response> {
  await requireUserId(request, env);

  const raw = new URL(request.url).searchParams.get('userIds') ?? '';
  const userIds = raw
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);

  if (userIds.length === 0) return ok({ online: [] });

  try {
    const hub = env.CHAT_HUB.get(env.CHAT_HUB.idFromName(HUB_NAME));
    const response = await hub.fetch('https://chat-hub/online', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userIds }),
    });

    const data = (await response.json()) as { online?: string[] };
    return ok({ online: data.online ?? [] });
  } catch {
    return ok({ online: [] });
  }
}



/**
 * GET /api/chat/overview
 *
 * 会话列表页要的两份数据合成一个请求：**用户目录 + 会话摘要**。
 *
 * 为什么值得合：那个页面**每次获得焦点都会拉一次**（未读数是别人产生的变化，
 * 本地不知道有没有变，只能重新对齐），是全 App 最频繁的"一进就打两个请求"。
 * 2 → 1 之后，每次焦点只花一个请求。
 *
 * 实现是**调现有 handler 再拼 data**，不重抄 SQL —— 理由见 `unwrapData` 的注释。
 */
export async function overview(request: Request, env: Env): Promise<Response> {


  const [usersRes, statsRes] = await Promise.all([
    usersRoutes.list(request, env),
    stats(request, env),
  ]);

  const [usersData, statsData] = await Promise.all([unwrapData(usersRes), unwrapData(statsRes)]);

  return ok({ ...usersData, ...statsData });
}

/**
 * GET /api/chat/room?targetUserId=
 *
 * 进聊天室要的三份数据合成一个请求：**对方资料 + 历史消息 + 在线状态**。
 * 3 → 1。
 *
 * ⚠️ 注意 `listMessages` 带副作用（**标已读 + 广播给对方**），合并之后
 * 这个副作用**仍然只发生一次** —— 这正是复用 handler 而不是抄 SQL 的价值。
 * （也正因为有这个副作用，客户端那边这个接口绝对不能进缓存。）
 */
export async function room(request: Request, env: Env): Promise<Response> {
  const targetId = str(
    { targetUserId: new URL(request.url).searchParams.get('targetUserId') ?? undefined },
    'targetUserId',
  );
  if (!targetId) throw Errors.badRequest('缺少 targetUserId', 'TARGET_REQUIRED');


  const onlineUrl = new URL(request.url);
  onlineUrl.searchParams.set('userIds', targetId);
  const onlineRequest = new Request(onlineUrl.toString(), request);

  const [userRes, messagesRes, onlineRes] = await Promise.all([
    usersRoutes.detail(request, env, { id: targetId }),
    listMessages(request, env),
    online(onlineRequest, env),
  ]);

  const [userData, messagesData, onlineData] = await Promise.all([
    unwrapData(userRes),
    unwrapData(messagesRes),
    unwrapData(onlineRes),
  ]);


  const onlineIds = (onlineData.online as string[] | undefined) ?? [];

  return ok({ ...userData, ...messagesData, online: onlineIds.includes(targetId) });
}



/**
 * GET /api/chat/ws?token=
 *
 * WebSocket 握手。
 *
 * token 走 query 而不是 `Authorization` 头：**浏览器的 WebSocket 构造器
 * 不允许自定义请求头**，为了让端点在任何客户端都能用，统一用 query。
 * （token 会因此出现在日志里 —— 它是 2 小时就过期的 access token，
 * 个人 App 这个取舍可以接受。）
 *
 * 验完签之后把身份塞进 `x-user-id` 转给 DO，DO 那边不碰 JWT：
 * **验签只该有一处实现**。
 */
export async function socket(request: Request, env: Env): Promise<Response> {
  const token = new URL(request.url).searchParams.get('token');
  if (!token) throw Errors.unauthorized('缺少登录凭证', 'UNAUTHORIZED');

  const userId = await verifyAccessToken(token, env.JWT_SECRET);
  if (!userId) throw Errors.unauthorized('登录已失效，请重新登录', 'UNAUTHORIZED');

  const hub = env.CHAT_HUB.get(env.CHAT_HUB.idFromName(HUB_NAME));

  const headers = new Headers(request.headers);
  headers.set('x-user-id', userId);



  return await hub.fetch(new Request(request, { headers }));
}

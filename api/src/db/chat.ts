/**
 * 聊天的 SQL（Slice 13）
 *
 * 单独一个文件而不是塞进 `queries.ts` —— 那个已经很长了，
 * 而且聊天是一套自成体系的查询（配对、未读、最后一条），放一起更好找。
 *
 * ## 数据模型：没有"会话表"
 *
 * 消息存的是「发送者 → 接收者」的**有向**记录。两个人之间的关系靠
 * 「我是其中一方」推导出来，不额外维护会话表：
 *
 * ```
 * (sender_id = 我 AND receiver_id = 对方) OR (sender_id = 对方 AND receiver_id = 我)
 * ```
 *
 * 代价是每个查询都要写这个配对条件，好处是**没有需要同步的冗余状态**
 * （会话表的"最后一条""未读数"都是能在消息表上直接算出来的）。
 */

export interface ChatMessageRow {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  type: string;
  is_read: number;
  create_time: number;
}

/** 两个人的配对条件（参数顺序：我, 对方, 对方, 我） */
const PAIR = `((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))`;

/**
 * 每个对话里的**最后一条**消息（我只参与的那些对话）。
 *
 * 用窗口函数按「对方是谁」分组取最新的一条 —— 一次查询拿到全部对话的摘要，
 * 比「先查会话列表、再逐个查最后一条」省 N 个请求。
 *
 * 参数：userId × 3（外层 CASE、分区 CASE、WHERE）
 */
export function lastMessagePerPartnerStatement(db: D1Database, userId: string): D1PreparedStatement {
  return db
    .prepare(
      `SELECT id, sender_id, receiver_id, content, type, is_read, create_time
         FROM (
           SELECT *,
             CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END AS partner,
             ROW_NUMBER() OVER (
               PARTITION BY CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END
               ORDER BY create_time DESC
             ) AS rn
           FROM chat_messages
           WHERE sender_id = ? OR receiver_id = ?
         )
        WHERE rn = 1`,
    )
    .bind(userId, userId, userId, userId);
}

/** 我收到的、按发送者分组的未读数 */
export function unreadPerSenderStatement(db: D1Database, userId: string): D1PreparedStatement {
  return db
    .prepare(
      `SELECT sender_id, COUNT(*) AS unread
         FROM chat_messages
        WHERE receiver_id = ? AND is_read = 0
        GROUP BY sender_id`,
    )
    .bind(userId);
}

/** 两个人之间的历史消息（**倒序**，最新的在前，方便分页） */
export function listMessagesStatement(
  db: D1Database,
  params: { userId: string; targetId: string; limit: number },
): D1PreparedStatement {
  return db
    .prepare(`SELECT * FROM chat_messages WHERE ${PAIR} ORDER BY create_time DESC LIMIT ?`)
    .bind(params.userId, params.targetId, params.targetId, params.userId, params.limit);
}

/**
 * 把「对方发给我的」消息全部标成已读。
 *
 * 和旧版一致：**拉历史时顺手置已读**，不需要客户端再发一个"我读了"的请求。
 */
export function markConversationReadStatement(
  db: D1Database,
  params: { userId: string; targetId: string },
): D1PreparedStatement {
  return db
    .prepare('UPDATE chat_messages SET is_read = 1 WHERE receiver_id = ? AND sender_id = ? AND is_read = 0')
    .bind(params.userId, params.targetId);
}

export function insertMessageStatement(
  db: D1Database,
  params: {
    id: string;
    senderId: string;
    receiverId: string;
    content: string;
    type: string;
    now: number;
  },
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO chat_messages (id, sender_id, receiver_id, content, type, is_read, create_time)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
    )
    .bind(params.id, params.senderId, params.receiverId, params.content, params.type, params.now);
}

/** 清空两个人之间的全部记录。两边一起删 —— 这是"清空这个对话"，不是"我这儿隐藏" */
export function clearConversationStatement(
  db: D1Database,
  params: { userId: string; targetId: string },
): D1PreparedStatement {
  return db.prepare(`DELETE FROM chat_messages WHERE ${PAIR}`).bind(
    params.userId,
    params.targetId,
    params.targetId,
    params.userId,
  );
}

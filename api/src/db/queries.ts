/**
 * 所有 SQL 集中在这里
 *
 * 目的有两个：
 *   1. 想数「一次请求到底查了几次库」时，只看这一个文件
 *   2. 增量同步的语句做成 PreparedStatement 工厂，路由层可以塞进
 *      `db.batch([...])` 一次性发出去 —— 一次网络往返拿完所有数据
 */

export interface UserRow {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  password_salt: string;
  password_iterations: number;
  nickname: string | null;
  avatar_id: string | null;
  avatar_url: string | null;
  avatar_type: string;
  /**
   * 自定义头像的版本号（0 = 没有自定义头像）
   *
   * 头像图片存在 KV，key 是 `avatar:<userId>:<version>`。
   * 版本号会出现在对外 URL 的 `?v=` 里，用来绕开 KV「读有最长 60 秒缓存」的问题：
   * 每次上传都是**新 key + 新 URL**，客户端不会拿到旧图。
   */
  avatar_version: number;
  bio: string | null;
  gender: string | null;
  birthday: string | null;
  location: string | null;
  is_active: number;
  created_at: number;
  updated_at: number;
  last_login_at: number | null;
}

export interface RefreshTokenRow {
  token_hash: string;
  user_id: string;
  device: string | null;
  created_at: number;
  last_used_at: number;
  expires_at: number;
}

/** 增量同步返回的一行；分类表把 key 别名成 id，两处复用同一套结构 */
export interface SyncRow {
  id: string;
  seq: number;
  is_deleted: number;
  data: string;
  updated_at: number;
}



const USER_COLUMNS =
  'id, username, email, password_hash, password_salt, password_iterations, nickname, avatar_id, avatar_url, ' +
  'avatar_type, avatar_version, bio, gender, birthday, location, is_active, created_at, updated_at, last_login_at';

/**
 * 用户名 / 邮箱二选一登录。
 *
 * 一条 SQL 同时命中两个唯一索引 —— 老版是「含 @ 就查邮箱，否则查用户名」，
 * 也是 1 次查询，但这里少了一个客户端不该知道的分支。
 */
export async function findUserIdByAccount(db: D1Database, account: string): Promise<string | null> {
  const row = await db
    .prepare('SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1')
    .bind(account, account)
    .first<{ id: string }>();
  return row?.id ?? null;
}

/** 注册查重：返回冲突的字段名，null 表示没冲突 */
export async function findUserConflict(
  db: D1Database,
  username: string,
  email: string,
): Promise<'username' | 'email' | null> {
  const row = await db
    .prepare('SELECT username, email FROM users WHERE username = ? OR email = ? LIMIT 1')
    .bind(username, email)
    .first<{ username: string; email: string }>();
  if (!row) return null;
  if (row.username === username) return 'username';
  if (row.email === email) return 'email';
  return null;
}

/**
 * 做成语句工厂（而不是直接 async 方法），是为了能塞进 `db.batch([...])`：
 * 同步接口把「事件 + 分类 + 用户资料」三条查询打包成一次网络往返。
 */
export function getUserStatement(db: D1Database, userId: string): D1PreparedStatement {
  return db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).bind(userId);
}

export async function getUserById(db: D1Database, userId: string): Promise<UserRow | null> {
  return await getUserStatement(db, userId).first<UserRow>();
}

/**
 * 除自己以外的全部用户（会话列表用）
 *
 * 走 `USER_COLUMNS` 而不是 `SELECT *`：那条列清单是**唯一的公开字段白名单**，
 * 用它就能保证 `password_hash` 那几列根本不会被读出来 —— 哪怕哪天
 * `toPublicUser` 漏映射了某个字段，也不会从这里漏。
 */
export function listOtherUsersStatement(db: D1Database, exceptUserId: string): D1PreparedStatement {
  return db
    .prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id != ? ORDER BY created_at DESC`)
    .bind(exceptUserId);
}

/**
 * 建用户 + 初始化同步水位。
 *
 * 放在一个 batch 里：D1 的 batch 是单事务，不会出现「用户建好了但 user_state 没建」
 * 这种让后续同步序号断档的半成品状态。
 */
export async function insertUser(
  db: D1Database,
  user: {
    id: string;
    username: string;
    email: string;
    passwordHash: string;
    passwordSalt: string;
    passwordIterations: number;
    now: number;
  },
): Promise<void> {
  await db.batch([
    db
      .prepare(
        `INSERT INTO users (id, username, email, password_hash, password_salt, password_iterations, avatar_type, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'preset', 1, ?, ?)`,
      )
      .bind(
        user.id,
        user.username,
        user.email,
        user.passwordHash,
        user.passwordSalt,
        user.passwordIterations,
        user.now,
        user.now,
      ),
    db.prepare('INSERT INTO user_state (user_id, seq, updated_at) VALUES (?, 0, ?)').bind(user.id, user.now),
  ]);
}

export async function touchLastLogin(db: D1Database, userId: string, now: number): Promise<void> {
  await db.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').bind(now, now, userId).run();
}

/**
 * 可被客户端修改的资料字段白名单。列名取自这里，杜绝 SQL 注入
 *
 * ⚠️ 刻意**不含 `avatar_url` / `avatar_version` / `avatar_type`**：
 * 头像是服务端管的 —— 客户端只能走 `POST /api/user/avatar` 上传图片，
 * 不能自己塞一个任意 URL（否则别人打开你的资料会去加载你指定的地址）。
 */
export const PROFILE_COLUMNS = [
  'nickname',
  'avatar_id',
  'bio',
  'gender',
  'birthday',
  'location',
] as const;

export type ProfileColumn = (typeof PROFILE_COLUMNS)[number];

export async function updateUserProfile(
  db: D1Database,
  userId: string,
  patch: Partial<Record<ProfileColumn, string | null>>,
  now: number,
): Promise<void> {
  const entries = PROFILE_COLUMNS.filter(column => column in patch).map(
    column => [column, patch[column] ?? null] as const,
  );
  if (entries.length === 0) return;

  const assignments = entries.map(([column]) => `${column} = ?`).join(', ');
  const values = entries.map(([, value]) => value);

  await db
    .prepare(`UPDATE users SET ${assignments}, updated_at = ? WHERE id = ?`)
    .bind(...values, now, userId)
    .run();
}

/**
 * 记录新的头像版本。
 *
 * `avatar_url` 一并清空：自定义头像从今往后只有「KV 里的字节 + 版本号」这一种来源，
 * 老数据里残留的外部 URL 不会再被用到。
 *
 * 注意这里**不动 `user_state.seq`** —— seq 只代表「事件和分类的变化」，
 * 头像/资料不算。否则客户端改个头像就要全量对一遍事件。
 */
export async function updateUserAvatar(
  db: D1Database,
  userId: string,
  version: number,
  now: number,
): Promise<void> {
  await db
    .prepare(
      "UPDATE users SET avatar_type = 'custom', avatar_version = ?, avatar_url = NULL, updated_at = ? WHERE id = ?",
    )
    .bind(version, now, userId)
    .run();
}

/** 清掉自定义头像，回到「默认色块 + 首字母」 */
export async function clearUserAvatar(db: D1Database, userId: string, now: number): Promise<void> {
  await db
    .prepare(
      "UPDATE users SET avatar_type = 'preset', avatar_version = 0, avatar_url = NULL, avatar_id = NULL, updated_at = ? WHERE id = ?",
    )
    .bind(now, userId)
    .run();
}



export async function insertRefreshToken(db: D1Database, row: RefreshTokenRow): Promise<void> {
  await db
    .prepare(
      'INSERT INTO refresh_tokens (token_hash, user_id, device, created_at, last_used_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(row.token_hash, row.user_id, row.device, row.created_at, row.last_used_at, row.expires_at)
    .run();
}

export async function findRefreshToken(db: D1Database, tokenHash: string): Promise<RefreshTokenRow | null> {
  return await db
    .prepare('SELECT token_hash, user_id, device, created_at, last_used_at, expires_at FROM refresh_tokens WHERE token_hash = ?')
    .bind(tokenHash)
    .first<RefreshTokenRow>();
}

/**
 * 滑动续期：不换 token，只把过期时间往后推满。
 *
 * 这就是「像微信一样，只要在用就不掉线」的落点 ——
 * 每次刷新都把 180 天窗口重新拉满，活跃用户实际永不过期。
 */
export async function touchRefreshToken(
  db: D1Database,
  tokenHash: string,
  lastUsedAt: number,
  expiresAt: number,
): Promise<void> {
  await db
    .prepare('UPDATE refresh_tokens SET last_used_at = ?, expires_at = ? WHERE token_hash = ?')
    .bind(lastUsedAt, expiresAt, tokenHash)
    .run();
}

export async function deleteRefreshToken(db: D1Database, tokenHash: string): Promise<void> {
  await db.prepare('DELETE FROM refresh_tokens WHERE token_hash = ?').bind(tokenHash).run();
}

export async function deleteUserRefreshTokens(db: D1Database, userId: string): Promise<void> {
  await db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').bind(userId).run();
}



/** 读同步水位。缺失时补一条 0，避免序号断档 */
export async function getSeq(db: D1Database, userId: string): Promise<number> {
  const row = await db.prepare('SELECT seq FROM user_state WHERE user_id = ?').bind(userId).first<{ seq: number }>();
  if (row) return row.seq;

  await db
    .prepare('INSERT OR IGNORE INTO user_state (user_id, seq, updated_at) VALUES (?, 0, ?)')
    .bind(userId, Date.now())
    .run();
  return 0;
}

export function updateSeqStatement(db: D1Database, userId: string, seq: number, now: number): D1PreparedStatement {
  return db.prepare('UPDATE user_state SET seq = ?, updated_at = ? WHERE user_id = ?').bind(seq, now, userId);
}

export function listEventsSinceStatement(db: D1Database, userId: string, since: number): D1PreparedStatement {
  return db
    .prepare('SELECT id, seq, is_deleted, data, updated_at FROM events WHERE user_id = ? AND seq > ? ORDER BY seq ASC')
    .bind(userId, since);
}

export function listCategoriesSinceStatement(db: D1Database, userId: string, since: number): D1PreparedStatement {
  return db
    .prepare(
      'SELECT key AS id, seq, is_deleted, data, updated_at FROM categories WHERE user_id = ? AND seq > ? ORDER BY seq ASC',
    )
    .bind(userId, since);
}

/**
 * 写入一条事件。
 *
 * 冲突目标是 (user_id, id)：事件 id 由客户端生成，只能保证「同一用户内唯一」，
 * 所以主键必须带上 user_id —— 否则两个用户撞同一个 id 时，
 * 后来的那个会被 ON CONFLICT 挡掉、数据静默同步不上去。
 */
export function upsertEventStatement(
  db: D1Database,
  params: { id: string; userId: string; seq: number; data: string; now: number },
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO events (user_id, id, seq, is_deleted, data, updated_at)
       VALUES (?, ?, ?, 0, ?, ?)
       ON CONFLICT(user_id, id) DO UPDATE SET
         seq = excluded.seq,
         is_deleted = 0,
         data = excluded.data,
         updated_at = excluded.updated_at`,
    )
    .bind(params.userId, params.id, params.seq, params.data, params.now);
}

/** 软删除：留墓碑，否则其他设备永远不知道这条被删了 */
export function deleteEventStatement(
  db: D1Database,
  params: { id: string; userId: string; seq: number; now: number },
): D1PreparedStatement {
  return db
    .prepare('UPDATE events SET seq = ?, is_deleted = 1, updated_at = ? WHERE user_id = ? AND id = ?')
    .bind(params.seq, params.now, params.userId, params.id);
}

export function upsertCategoryStatement(
  db: D1Database,
  params: { key: string; userId: string; seq: number; data: string; now: number },
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO categories (user_id, key, seq, is_deleted, data, updated_at)
       VALUES (?, ?, ?, 0, ?, ?)
       ON CONFLICT(user_id, key) DO UPDATE SET
         seq = excluded.seq,
         is_deleted = 0,
         data = excluded.data,
         updated_at = excluded.updated_at`,
    )
    .bind(params.userId, params.key, params.seq, params.data, params.now);
}

export function deleteCategoryStatement(
  db: D1Database,
  params: { key: string; userId: string; seq: number; now: number },
): D1PreparedStatement {
  return db
    .prepare('UPDATE categories SET seq = ?, is_deleted = 1, updated_at = ? WHERE user_id = ? AND key = ?')
    .bind(params.seq, params.now, params.userId, params.key);
}



/**
 * 列表 / 详情查询返回的原始行
 *
 * 已经 JOIN 出作者信息，所以字段名带 `author_` 前缀以免和故事自己的列撞名。
 */
export interface StoryRow {
  id: string;
  content: string;
  event_data: string;
  tags: string;
  likes: number;
  comments: number;
  create_time: number;
  update_time: number;
  author_id: string;
  author_nickname: string | null;
  author_username: string;
  author_avatar_version: number;
  /** 0 / 1：当前用户赞过没有 */
  liked: number;
}

export interface CommentRow {
  id: string;
  story_id: string;
  content: string;
  create_time: number;
  author_id: string;
  author_nickname: string | null;
  author_username: string;
  author_avatar_version: number;
}

/**
 * 列表和详情共用的列清单
 *
 * `CASE WHEN l.user_id IS NULL` 这一段是**必须的**：
 * 列表里每条故事都要显示「我赞过没有」，没有它前端就得对每条各发一次
 * check-like —— 一页 10 条 = 10 个请求，这在这套「省额度」的设计里是不能接受的。
 */
const STORY_COLUMNS = `
  s.id, s.content, s.event_data, s.tags, s.likes, s.comments, s.create_time, s.update_time,
  u.id AS author_id, u.nickname AS author_nickname, u.username AS author_username,
  u.avatar_version AS author_avatar_version,
  CASE WHEN l.user_id IS NULL THEN 0 ELSE 1 END AS liked
`;

const STORY_FROM = `
  FROM stories s
  JOIN users u ON u.id = s.user_id
  LEFT JOIN story_likes l ON l.story_id = s.id AND l.user_id = ?
`;

/** 广场：全部人的故事，按时间倒序 */
export function listStoriesStatement(
  db: D1Database,
  params: { viewerId: string; limit: number; offset: number },
): D1PreparedStatement {
  return db
    .prepare(`SELECT ${STORY_COLUMNS} ${STORY_FROM} ORDER BY s.create_time DESC LIMIT ? OFFSET ?`)
    .bind(params.viewerId, params.limit, params.offset);
}

/**
 * 「我的故事」
 *
 * 单独一条 SQL（而不是给上面那条加个 `OR` 条件）是为了**能命中
 * `idx_stories_user(user_id, create_time DESC)`** —— 混着写会让索引失效，
 * D1 按扫描行计费，全表扫的代价很实在。
 */
export function listMyStoriesStatement(
  db: D1Database,
  params: { viewerId: string; limit: number; offset: number },
): D1PreparedStatement {
  return db
    .prepare(
      `SELECT ${STORY_COLUMNS} ${STORY_FROM} WHERE s.user_id = ? ORDER BY s.create_time DESC LIMIT ? OFFSET ?`,
    )
    .bind(params.viewerId, params.viewerId, params.limit, params.offset);
}

export function getStoryStatement(
  db: D1Database,
  params: { id: string; viewerId: string },
): D1PreparedStatement {
  return db.prepare(`SELECT ${STORY_COLUMNS} ${STORY_FROM} WHERE s.id = ?`).bind(params.viewerId, params.id);
}

export async function insertStory(
  db: D1Database,
  params: { id: string; userId: string; content: string; eventData: string; tags: string; now: number },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO stories (id, user_id, content, event_data, tags, likes, comments, create_time, update_time)
       VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)`,
    )
    .bind(params.id, params.userId, params.content, params.eventData, params.tags, params.now, params.now)
    .run();
}

/** 只取作者，用于删除前的归属校验 */
export async function getStoryUserId(db: D1Database, id: string): Promise<string | null> {
  const row = await db.prepare('SELECT user_id FROM stories WHERE id = ?').bind(id).first<{ user_id: string }>();
  return row?.user_id ?? null;
}

/**
 * 删除故事（**真删**，不是墓碑）
 *
 * 故事没有「多设备离线同步」的需求，所以不留墓碑 —— 留了反而要额外维护清理。
 *
 * ## 三条语句的顺序不能换
 *
 * 1. 先删评论
 * 2. 再删点赞
 * 3. 最后删故事本身
 *
 * 因为 1、2 用的是**子查询**（`story_id IN (SELECT id FROM stories WHERE ...)`），
 * 靠它来保证「只删属于当前用户的那批故事的关联数据」。
 * 要是先把 stories 删了，子查询就查不到东西，评论和点赞会变成永远查不到的孤儿行。
 *
 * ⚠️ 那个 `user_id = ?` 的约束是**安全边界**，不是优化：
 * 没有它的话，攻击者只要在 `ids` 里混进别人的 story id，
 * 就能把**别人故事下面的评论全删光** —— 而故事本身因为归属校验删不掉。
 *
 * 三条打包成一个 batch（D1 单事务、一次网络往返），
 * 所以「批量删 50 条」和「删 1 条」花的是**同一个请求**。
 */
export function deleteStoryStatements(db: D1Database, ids: string[], userId: string): D1PreparedStatement[] {
  const placeholders = ids.map(() => '?').join(', ');
  const owned = `SELECT id FROM stories WHERE user_id = ? AND id IN (${placeholders})`;

  return [
    db.prepare(`DELETE FROM story_comments WHERE story_id IN (${owned})`).bind(userId, ...ids),
    db.prepare(`DELETE FROM story_likes WHERE story_id IN (${owned})`).bind(userId, ...ids),
    db.prepare(`DELETE FROM stories WHERE user_id = ? AND id IN (${placeholders})`).bind(userId, ...ids),
  ];
}

/** 我赞过这条故事没有 */
export async function hasStoryLike(db: D1Database, storyId: string, userId: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 AS hit FROM story_likes WHERE story_id = ? AND user_id = ?')
    .bind(storyId, userId)
    .first<{ hit: number }>();
  return Boolean(row);
}

/**
 * 点赞 / 取消赞的两三步，打包成一个 batch。
 *
 * 最后那条 SELECT 是故意的：把新计数**顺路带回来**，
 * 这样整个 toggle 只需要一次网络往返，客户端也不用自己猜数字。
 *
 * `MAX(0, likes + ?)` 是旧版就有的保护 —— 即使数据乱了也不会出现负数计数。
 */
export function toggleLikeStatements(
  db: D1Database,
  params: { storyId: string; userId: string; liked: boolean; now: number },
): D1PreparedStatement[] {
  const delta = params.liked ? -1 : 1;

  const write = params.liked
    ? db.prepare('DELETE FROM story_likes WHERE story_id = ? AND user_id = ?').bind(params.storyId, params.userId)
    : db
        .prepare('INSERT OR IGNORE INTO story_likes (story_id, user_id, create_time) VALUES (?, ?, ?)')
        .bind(params.storyId, params.userId, params.now);

  return [
    write,
    db
      .prepare('UPDATE stories SET likes = MAX(0, likes + ?), update_time = ? WHERE id = ?')
      .bind(delta, params.now, params.storyId),
    db.prepare('SELECT likes FROM stories WHERE id = ?').bind(params.storyId),
  ];
}

export function insertCommentStatements(
  db: D1Database,
  params: { id: string; storyId: string; userId: string; content: string; now: number },
): D1PreparedStatement[] {
  return [
    db
      .prepare('INSERT INTO story_comments (id, story_id, user_id, content, create_time) VALUES (?, ?, ?, ?, ?)')
      .bind(params.id, params.storyId, params.userId, params.content, params.now),
    db
      .prepare('UPDATE stories SET comments = comments + 1, update_time = ? WHERE id = ?')
      .bind(params.now, params.storyId),
  ];
}

const COMMENT_COLUMNS = `
  c.id, c.story_id, c.content, c.create_time,
  u.id AS author_id, u.nickname AS author_nickname, u.username AS author_username,
  u.avatar_version AS author_avatar_version
`;

const COMMENT_FROM = `
  FROM story_comments c
  JOIN users u ON u.id = c.user_id
`;

export function listCommentsStatement(
  db: D1Database,
  params: { storyId: string; limit: number; offset: number },
): D1PreparedStatement {
  return db
    .prepare(
      `SELECT ${COMMENT_COLUMNS} ${COMMENT_FROM} WHERE c.story_id = ? ORDER BY c.create_time DESC LIMIT ? OFFSET ?`,
    )
    .bind(params.storyId, params.limit, params.offset);
}

/**
 * 按 id 取一条评论（带作者信息）
 *
 * 发完评论直接把它返回给客户端，前端就能插到列表最前面，
 * **不用再拉一次评论列表** —— 省一个请求。
 */
export function getCommentStatement(db: D1Database, id: string): D1PreparedStatement {
  return db.prepare(`SELECT ${COMMENT_COLUMNS} ${COMMENT_FROM} WHERE c.id = ?`).bind(id);
}

/**
 * 取一条评论的归属信息（删之前用；不存在返回 null）
 *
 * 一次把 `story_id` 也带出来 —— ⚠️ 评论删掉之后就**再也反查不到**它属于哪条故事了，
 * 而评论计数要靠这个 id 去减。曾经想省这一步、在 batch 里用子查询现查，
 * 结果 UPDATE 排在 DELETE 后面，子查询直接空掉、计数减不下去（冒烟测试抓到的）。
 */
export async function getCommentInfo(
  db: D1Database,
  id: string,
): Promise<{ userId: string; storyId: string } | null> {
  const row = await db
    .prepare('SELECT user_id, story_id FROM story_comments WHERE id = ?')
    .bind(id)
    .first<{ user_id: string; story_id: string }>();

  return row ? { userId: row.user_id, storyId: row.story_id } : null;
}

/**
 * 删一条评论 + 把故事的评论数减回去。
 *
 * ⚠️ `DELETE` 上的 `user_id = ?` 是**安全边界**，不是优化：
 * 没有它的话，只要拿到别人的评论 id 就能把别人的评论删掉。
 * （调用方在用之前已经查过归属，这里是第二道。）
 *
 * `MAX(0, comments - 1)` 和点赞那边同理 —— 即使数据乱了也不会出现负数计数。
 *
 * 最后那条 SELECT 把**新计数**顺路带回来（一个 batch 一次网络往返），
 * 客户端不用自己猜、也不用再拉一次列表。
 */
export function deleteCommentStatements(
  db: D1Database,
  params: { commentId: string; storyId: string; userId: string; now: number },
): D1PreparedStatement[] {
  return [
    db
      .prepare('DELETE FROM story_comments WHERE id = ? AND user_id = ?')
      .bind(params.commentId, params.userId),
    db
      .prepare('UPDATE stories SET comments = MAX(0, comments - 1), update_time = ? WHERE id = ?')
      .bind(params.now, params.storyId),
    db.prepare('SELECT comments FROM stories WHERE id = ?').bind(params.storyId),
  ];
}



/** 取一条语句实际影响了几行（批量删除要把它报给客户端） */
export function changedRows(result: D1Result<unknown>): number {
  const meta = result.meta as { changes?: number } | undefined;
  return meta?.changes ?? 0;
}

export async function purgeExpiredTokens(db: D1Database): Promise<number> {
  const result = await db.prepare('DELETE FROM refresh_tokens WHERE expires_at < ?').bind(Date.now()).run();
  return changedRows(result);
}

/**
 * 清理墓碑。
 *
 * 墓碑必须留够时间，让「其他设备在离线期间删掉的东西」有机会被同步到；
 * 留 30 天，再老的删除记录就直接物理删掉。
 */
export async function purgeTombstones(db: D1Database, olderThan: number): Promise<number> {
  const events = await db.prepare('DELETE FROM events WHERE is_deleted = 1 AND updated_at < ?').bind(olderThan).run();
  const categories = await db
    .prepare('DELETE FROM categories WHERE is_deleted = 1 AND updated_at < ?')
    .bind(olderThan)
    .run();
  return changedRows(events) + changedRows(categories);
}

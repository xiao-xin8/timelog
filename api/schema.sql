-- ============================================================
-- 时光日志 App · D1 建表脚本
-- Cloudflare D1 执行：wrangler d1 execute timelog --remote --file=./schema.sql
-- ============================================================

-- ---------- 用户 ----------
CREATE TABLE IF NOT EXISTS users (
  id                  TEXT    PRIMARY KEY,
  username            TEXT    NOT NULL,
  email               TEXT    NOT NULL,
  password_hash       TEXT    NOT NULL,
  password_salt       TEXT    NOT NULL,
  password_iterations INTEGER NOT NULL,
  nickname            TEXT,
  avatar_id           TEXT,
  avatar_url          TEXT,
  avatar_type         TEXT    NOT NULL DEFAULT 'preset',
  -- 自定义头像的版本号（0 = 没有）。图片本体在 KV：avatar:<id>:<version>
  -- 版本号会出现在头像 URL 的 ?v= 里，保证「换完立刻生效」且 URL 可变缓存
  avatar_version      INTEGER NOT NULL DEFAULT 0,
  bio                 TEXT,
  gender              TEXT,
  birthday            TEXT,
  location            TEXT,
  is_active           INTEGER NOT NULL DEFAULT 1,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL,
  last_login_at       INTEGER
);
-- 用户名 / 邮箱各自唯一。注册时一条 SQL 同时命中这两个索引做查重
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email    ON users(email);

-- ---------- 会话（refresh token）----------
-- 只存 token 的 SHA-256，**不存明文**；即使库泄露也无法直接拿来登录
CREATE TABLE IF NOT EXISTS refresh_tokens (
  token_hash   TEXT    PRIMARY KEY,
  user_id      TEXT    NOT NULL,
  device       TEXT,
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL
);
-- 支撑「登出所有设备」和 cron 清理
CREATE INDEX IF NOT EXISTS idx_refresh_user    ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_expires ON refresh_tokens(expires_at);

-- ---------- 事件 ----------
-- ⚠️ 主键是 (user_id, id)，**不是 id**。
-- 事件 id 由客户端生成（`String(Date.now())`），只保证「同一个用户的设备之间」唯一。
-- 如果拿 id 当全局主键，就会出现：A 用户的事件 id 把 B 用户的同名 id「占住」，
-- B 的写入被 ON CONFLICT 挡掉、数据静默同步不上去（踩过）。
-- 按用户隔离之后，两台设备/两个用户用同一个 id 互不干扰，
-- upsert 的冲突目标也变成 (user_id, id)，不需要额外的守卫条件。
CREATE TABLE IF NOT EXISTS events (
  user_id    TEXT    NOT NULL,
  id         TEXT    NOT NULL,
  seq        INTEGER NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  data       TEXT    NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);
-- 增量同步的唯一热查询：WHERE user_id = ? AND seq > ?
CREATE INDEX IF NOT EXISTS idx_events_sync ON events(user_id, seq);
-- 给 cron 清理墓碑用
CREATE INDEX IF NOT EXISTS idx_events_deleted ON events(is_deleted, updated_at);

-- ---------- 自定义分类 ----------
-- 内置 7 个分类写死在客户端，不上云；这里只存 custom_<时间戳>
CREATE TABLE IF NOT EXISTS categories (
  user_id    TEXT    NOT NULL,
  key        TEXT    NOT NULL,
  seq        INTEGER NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  data       TEXT    NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);
CREATE INDEX IF NOT EXISTS idx_categories_sync ON categories(user_id, seq);

-- ---------- 每用户的同步水位 ----------
-- 只读这一行的 seq 就能判断「有没有变化」，无变化直接 304，
-- 业务表一行都不用扫。这是省额度最关键的一张表。
CREATE TABLE IF NOT EXISTS user_state (
  user_id    TEXT    PRIMARY KEY,
  seq        INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

-- ============================================================
-- 故事（Slice 11a）
--
-- ⚠️ 这三张表**不参与 /api/sync**。那个接口的语义是「个人的事件和分类，
-- 本地改动攒起来合并成一次推送」；故事是**社交数据**，发布即写入、
-- 立刻要能看到，两者模型完全不同，别混。
--
-- 因此这里也**没有 seq / is_deleted**：
--   - 不需要增量游标（客户端每次都是按时间翻页拉）
--   - 删除是真删（不是墓碑）—— 没有「多设备离线同步」的需求
-- ============================================================

-- ---------- 故事 ----------
-- event_data 存的是事件的**完整快照**（JSON），不是事件 id 引用：
-- 事件后来被改了或者删了，故事上带着的那个日子不该跟着变。
CREATE TABLE IF NOT EXISTS stories (
  id          TEXT    PRIMARY KEY,
  user_id     TEXT    NOT NULL,
  content     TEXT    NOT NULL,
  event_data  TEXT    NOT NULL,
  tags        TEXT    NOT NULL DEFAULT '[]',
  -- 冗余计数：列表页每条都要显示这两个数，靠 COUNT(*) 会把 D1 的
  -- 「扫描行数」顶上去。更新计数必须和写 likes/comments 行在同一个 batch 里
  -- （D1 的 batch 是单事务），否则一旦中途失败计数就和实际行数对不上了。
  likes       INTEGER NOT NULL DEFAULT 0,
  comments    INTEGER NOT NULL DEFAULT 0,
  create_time INTEGER NOT NULL,
  update_time INTEGER NOT NULL
);
-- 广场：ORDER BY create_time DESC 翻页
CREATE INDEX IF NOT EXISTS idx_stories_time ON stories(create_time DESC);
-- 「我的故事」：WHERE user_id = ? ORDER BY create_time DESC
CREATE INDEX IF NOT EXISTS idx_stories_user ON stories(user_id, create_time DESC);

-- ---------- 故事评论 ----------
CREATE TABLE IF NOT EXISTS story_comments (
  id          TEXT    PRIMARY KEY,
  story_id    TEXT    NOT NULL,
  user_id     TEXT    NOT NULL,
  content     TEXT    NOT NULL,
  create_time INTEGER NOT NULL
);
-- 评论列表：WHERE story_id = ? ORDER BY create_time DESC
CREATE INDEX IF NOT EXISTS idx_story_comments ON story_comments(story_id, create_time DESC);

-- ---------- 故事点赞 ----------
-- 复合主键 (story_id, user_id)：一个用户对一条故事最多一行，天然防重复。
-- 旧版是额外建了个 UNIQUE 索引，用主键更直接。
-- 列表查询要 LEFT JOIN 出「我赞过没有」，走这个主键即可，不用再加索引。
CREATE TABLE IF NOT EXISTS story_likes (
  story_id    TEXT    NOT NULL,
  user_id     TEXT    NOT NULL,
  create_time INTEGER NOT NULL,
  PRIMARY KEY (story_id, user_id)
);

-- ---------- 聊天消息 ----------
-- 一对一私聊。注意存的是「发送者 → 接收者」的**有向**记录，没有会话表：
-- 查两个人之间的历史时用
--   (sender_id = 我 AND receiver_id = 对方) OR (反过来)
-- 配对即可。个人 App 的会话数量级不值得再引一张会话表 + 维护它的未读数。
--
-- ⚠️ 这张表**是消息的唯一真相**。Durable Object（CHAT_HUB）只负责实时广播，
-- 不存消息 —— 会话列表要「每个会话的最后一条 + 未读数」，那是 SQL 聚合的活。
CREATE TABLE IF NOT EXISTS chat_messages (
  id          TEXT    PRIMARY KEY,
  sender_id   TEXT    NOT NULL,
  receiver_id TEXT    NOT NULL,
  content     TEXT    NOT NULL,
  -- 'text' | 'story'。story 的 content 是一段 JSON（storyId / title / icon）
  type        TEXT    NOT NULL DEFAULT 'text',
  -- 1 = 接收者已经拉取过。和旧版一致：**拉历史时顺手置已读**
  is_read     INTEGER NOT NULL DEFAULT 0,
  create_time INTEGER NOT NULL
);

-- 拉两人历史：配对查询 + 按时间倒序翻页
CREATE INDEX IF NOT EXISTS idx_chat_pair
  ON chat_messages(sender_id, receiver_id, create_time DESC);
-- 收件箱：数我收到的未读
CREATE INDEX IF NOT EXISTS idx_chat_inbox
  ON chat_messages(receiver_id, is_read);

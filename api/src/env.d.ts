/**
 * Worker 绑定声明
 *
 * 存储原则上只有 D1 一个（头像那个 KV 是唯一破例，理由见下面）。
 * **Durable Object 只在聊天这一处用**，而且它不是存储 —— 只是广播通道。
 */
interface Env {
  /** D1 数据库（结构化数据） */
  DB: D1Database;
  /**
   * 头像图片（KV）
   *
   * 这是**唯一**一个 KV 用途，而且是刻意加的：头像体积小、写入极少
   * （每个用户改一次 = 1 次写，免费额度 1000 写/天），
   * 但要读得少、读得稳 —— 所以 key 带版本号、URL 带 `?v=`，
   * 客户端命中自己的图片缓存后基本不会再请求。
   */
  AVATARS: KVNamespace;
  /** JWT 签名密钥，用 `wrangler secret put JWT_SECRET` 写入 */
  JWT_SECRET: string;
  /** access token 有效期（秒，字符串形式存在 vars 里） */
  ACCESS_TOKEN_TTL: string;
  /** refresh token 滑动窗口（秒） */
  REFRESH_TOKEN_TTL: string;
  /**
   * 密码哈希迭代次数（PBKDF2-SHA256）
   *
   * ⚠️ 这个值直接受 Workers 的 CPU 额度约束：
   *    免费版每请求 10ms，21 万次迭代约 53ms，**必然 1102**；
   *    Paid 版 30s，随便调。
   * 迭代次数会随哈希一起存进库，所以改这个值不影响已有账号。
   */
  PASSWORD_ITERATIONS?: string;
  /**
   * 聊天实时通道（Durable Object）
   *
   * 这是**唯一**一个 DO，而且是刻意加的：Workers 里的 WebSocket **必须挂在 DO 上**，
   * 普通 Worker 是请求级的、持不住长连接。
   *
   * ⚠️ 它**不是存储** —— 只维护在线连接和广播。消息的真相在 D1 的 `chat_messages`。
   */
  CHAT_HUB: DurableObjectNamespace;
}

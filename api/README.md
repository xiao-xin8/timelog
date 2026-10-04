# 时光日志 · 后端（Cloudflare Workers + D1）

全新实现、**零运行时依赖**（JWT 用 WebCrypto 手写，密码用 PBKDF2，不引任何 npm 包）。
配套客户端在仓库的 `app-expo/` 目录。

## 设计原则：省

Cloudflare 免费额度里真正会咬人的只有三条，整套设计都围着它们转：

| 限制 | 应对 |
|---|---|
| KV 写只有 1000/天，同键 1 写/秒 | **完全不用 KV**，统一走 D1（写额度 100k/天） |
| D1 按「扫描行数」计费 | 每条增量查询都有配套索引，绝不裸查 |
| 每个请求都要花钱 | access token 用无状态 JWT，普通请求**只验签、零查库** |

具体手段：

1. **一个 `/api/sync` 顶掉全部业务接口**（老版是 `/api/events` + `/api/categories` + `/api/data/stats` 三个）
2. **增量同步**：客户端带 `since`（每用户自增序号），只回变化的部分；时间戳不做游标，避免时钟漂移
3. **304 短路**：无变化时只读 `user_state` 一行就返回，业务表一行不扫
4. **批量上传**：客户端把本地改动攒起来合并成一次 POST，而不是每改一条发一次
5. **`db.batch` 打包查询**：事件 + 分类 + 资料三条查询一次网络往返拿完

### 两个刻意的例外

「一个存储」是原则，不是教条。有两处破例，都写清了理由：

| 例外 | 为什么必须破例 | 为什么可以接受 |
|---|---|---|
| `AVATARS`（KV） | D1 存大 blob 会让每条用户查询变重；R2 要绑卡开通，还多一套图片地址管理 | 写入极少：每人改一次头像 = 1 次写 |
| `CHAT_HUB`（Durable Object） | **Workers 里的 WebSocket 必须挂在 DO 上** —— 普通 Worker 是请求级的，持不住长连接 | 它**不是存储**：只维护在线连接和广播，消息真相在 D1 |

## 认证模型

| | 形态 | 有效期 | 每次请求查库 |
|---|---|---|---|
| access token | JWT（HS256，无状态） | 2 小时 | 否，只验签 |
| refresh token | 随机 32 字节，库里只存 SHA-256 | 180 天，**滑动** | 仅刷新时查 1 行 |

**「像微信一样只要在用就不掉线」** 靠 `POST /api/auth/refresh` 的滑动续期：
每次刷新都把 180 天窗口重新拉满。只要 180 天内有任何一次打开 App，登录态就永不失效。

客户端侧必须配合的两条（写在 `app-expo/src/services/api.ts`）：
- 收到 401 → 自动刷新 → **重放原请求**（只重试一次）
- 并发 401 要**单飞**：同时只发一次刷新，其余请求等结果

## 接口

| 方法 + 路径 | 说明 |
|---|---|
| `POST /api/auth/register` | 注册，成功后直接返回会话 |
| `POST /api/auth/login` | 登录（`account` 可为用户名或邮箱） |
| `POST /api/auth/refresh` | 换 access，滑动续期 |
| `POST /api/auth/logout` | 登出（`all: true` 清全部设备，需 access token） |
| `GET /api/sync?since=N` | 拉取增量；无变化返回 304 |
| `POST /api/sync` | 批量上传改动 |
| `GET /api/user` | 取资料 |
| `PUT /api/user` | 改资料（白名单字段） |
| `POST /api/user/avatar` | 上传头像。JSON body 带 base64 —— 图片已在客户端压到 400×400 JPEG，不走 multipart |
| `DELETE /api/user/avatar` | 删掉头像，回到默认的「色块 + 首字母」 |
| `GET /api/health` | 健康检查，不查库 |

故事（Slice 11a，**不走 `/api/sync`** —— 那是"个人的事件和分类"专用）：

| 方法 + 路径 | 说明 |
|---|---|
| `GET /api/stories` | 列表。`?userOnly=true` 只看自己的（广场与「我的故事」共用一个接口） |
| `POST /api/stories` | 发布 |
| `POST /api/stories/delete-batch` | 批量删除（**一次请求删 N 条**，上限 100） |
| `GET /api/stories/:id` | 详情 |
| `DELETE /api/stories/:id` | 删除（**仅作者**，否则 403 `只能删除自己的故事`） |
| `POST /api/stories/:id/like` | 点赞**切换**，返回 `{ liked, likes }` |
| `GET /api/stories/:id/comments` | 评论列表 |
| `POST /api/stories/:id/comment` | 发评论 |
| `DELETE /api/stories/comments/:id` | 删评论（**仅自己的**，否则 403 `只能删除自己的评论`；顺带把 `stories.comments` 减回去并返回新计数） |

聊天（Slice 13）：

| 方法 + 路径 | 说明 |
|---|---|
| `GET /api/users` | 除自己外的**全部**用户（会话列表用 —— 不是"聊过的人"，新人一进来就能找到人开聊） |
| `GET /api/users/:id` | 某个用户的公开资料 |
| `GET /api/chat/stats` | 会话列表摘要：每个对话的未读数 + 最后一条消息（两次查询并行 + 窗口函数，一次拿全） |
| `GET /api/chat/messages?targetUserId=` | 拉两人历史（最近 100 条，最新在前）。**顺手把对方发来的标已读**并推给对方 |
| `POST /api/chat/messages` | 发消息。落 D1 之后才广播，**推失败不影响消息本身** |
| `DELETE /api/chat/messages?targetUserId=` | 清空两人记录（两边一起删 —— 是"清空对话"不是"我这儿隐藏"） |
| `GET /api/chat/online?userIds=a,b` | 查这几个人在不在线（进聊天室时问一次）。`presence` 推送只在状态**变化**时发，对方一直挂着是不会有"变化"的 |
| `GET /api/chat/ws?token=` | WebSocket 握手。token 走 query（浏览器不允许 WS 自定义请求头），验完签把身份塞进 `x-user-id` 转给 DO |

> **上下线推送**：`CHAT_HUB` 在某人首次连上 / 最后一个连接断开时，向**所有**在线的人推
> `{ type: 'presence', userId, online }`。不做"谁关心谁"的过滤 —— 个人 App 的在线数很少，
> 客户端收到不是自己会话对象的那条直接忽略就行；要在服务端过滤，就得额外维护一张
> 「谁正在和谁聊天」的关系表。

> **消息怎么写、怎么推**：写走上面那几个 HTTP 接口（消息进 D1），推由 `CHAT_HUB` DO 负责。
> 不让客户端直接用 WebSocket 发消息，是为了**让写路径只有一处** —— 校验、落库、广播串在一条线上，
> 由后端自己的接口测试完整覆盖（那几个脚本未随本包发布）。WebSocket 只负责「收」。

统一响应格式：

```jsonc
// 成功
{ "success": true, "data": { /* ... */ } }

// 失败
{ "success": false, "error": { "code": "USERNAME_TAKEN", "message": "用户名已被注册" } }
```

同步响应：

```jsonc
{
  "seq": 57,                                  // 存下来，下次当 since 用
  "events":     { "upsert": [ /* EventItem[] */ ], "delete": ["id1"] },
  "categories": { "upsert": [ /* CategoryItem[] */ ], "delete": [] },
  "user": { /* PublicUser，可能为 null */ }
}
```

> `POST /api/sync` 返回的 delta 是「自你传入的 `since` 以来的全部变化」，
> **包含你刚上传的那批**。这是故意的：合并完之后客户端才能安全地把 `since` 推到 `seq`。

## 部署

### 部署前必改（拿到这份代码的人看这里）

`wrangler.toml` 里现在填的是**原作者账号下的资源 id**，照抄会部署失败。改成你自己的：

| 位置 | 现在是谁的 | 怎么拿到你自己的 |
|---|---|---|
| `wrangler.toml` → `[[d1_databases]] database_id` | 原作者的 D1 | `npx wrangler d1 create timelog` |
| `wrangler.toml` → `[[kv_namespaces]] id` | 原作者的 KV | `npx wrangler kv namespace create AVATARS` |
| `wrangler.toml` → `name` | `timelog-api` | 随便取一个你自己的 Worker 名 |
| `JWT_SECRET` | —— | `wrangler secret put`（见下），**不要写进 `wrangler.toml`** |

客户端那边的地址要相应改掉，见 `app-expo/README.md` 第二节的配置表。

### 步骤

```bash
cd api
npm install

# 1. 建库，把返回的 database_id 填进 wrangler.toml
npx wrangler d1 create timelog

# 2. 建头像用的 KV，把返回的 id 填进 wrangler.toml 的 [[kv_namespaces]]
#    ⚠️ 漏了这步 deploy 会直接失败（绑定找不到）
npx wrangler kv namespace create AVATARS

# 3. 建表
npx wrangler d1 execute timelog --remote --file=./schema.sql

# 4. 写密钥（长度建议 64 位以上随机串）
npx wrangler secret put JWT_SECRET

# 5. 发布
npx wrangler deploy
```

本地开发（本地 D1 / KV / Durable Object，**完全不碰线上**）：

```bash
cp .dev.vars.example .dev.vars   # 填一个本地 JWT_SECRET
npx wrangler d1 execute timelog --local --file=./schema.sql
npm run dev
```

> ⚠️ **本地库的坑**：本地建表走的是 `schema.sql` 里的 `CREATE TABLE IF NOT EXISTS` ——
> **表已存在时不会补新列**。所以改动过 `schema.sql` 的列之后，要删掉
> `.wrangler/state/v3/d1` 再重建，否则会报莫名其妙的 `no such column`。
> 线上没这个问题（列都是显式 `ALTER` 上去的）。

## 维护

`wrangler.toml` 里配了每天 04:00 UTC 的 cron，做两件事：

- 删掉过期的 refresh token
- 删掉 30 天前的墓碑（软删除记录）—— 留 30 天是为了让长期离线的设备还能同步到删除操作

## 目录

```
src/
├── index.ts              入口：路由分发 / 错误兜底 / 定时维护
├── config.ts             从 env 读运行时配置
├── env.d.ts              Worker 绑定类型
├── lib/
│   ├── encoding.ts       base64url / 随机串 / SHA-256 / 常数时间比较
│   ├── errors.ts         统一 AppError + 错误码
│   ├── jwt.ts            JWT 签发与校验（WebCrypto，无依赖）
│   ├── password.ts       PBKDF2-HMAC-SHA256 + 随机盐
│   ├── response.ts       统一响应与 CORS
│   ├── serialize.ts      UserRow → PublicUser（保证不泄露密码字段）
│   └── validate.ts       入参校验
├── middleware/auth.ts    Bearer token → userId
├── db/queries.ts         所有 SQL 集中于此
└── routes/
    ├── auth.ts           register / login / refresh / logout
    ├── sync.ts           pull / push
    ├── user.ts           getProfile / updateProfile
    ├── avatar.ts         上传 / 读取 / 删除头像
    └── story.ts          list / publish / detail / remove / removeBatch / toggleLike / comments
```

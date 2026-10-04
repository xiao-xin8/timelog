import { changedRows } from '../db/queries';
import * as db from '../db/queries';
import type { CommentRow, StoryRow } from '../db/queries';
import { generateId } from '../lib/encoding';
import { Errors } from '../lib/errors';
import { ok, unwrapData } from '../lib/response';
import { avatarPathOf } from '../lib/serialize';
import { asRecord, readJson, str } from '../lib/validate';
import { requireUserId } from '../middleware/auth';

/**
 * 故事（Slice 11a）
 *
 * ## 为什么是独立的一组接口，而不是塞进 /api/sync
 *
 * `/api/sync` 的语义是「**个人**的事件和分类，本地改动攒起来合并成一次推送」。
 * 故事是**社交数据**：发布即写入、立刻要能看到、还要给别人看。
 * 两者模型完全不同，混在一起会让同步那套「防抖 + 水位 + 墓碑」全部失效。
 *
 * 所以故事表也没有 `seq` / `is_deleted`：不需要增量游标，删除就是真删。
 *
 * ## 省额度的几个点
 *
 * 1. **列表一次查询带出作者 + 我赞过没有**（`LEFT JOIN`），
 *    否则前端得对每条故事各发一次 check-like，一页 10 条 = 10 个请求
 * 2. **分页靠「多查一条」判断 hasMore**，不跑 `COUNT(*)`
 * 3. **点赞/评论/批量删除都是一个 `db.batch`**，一次网络往返
 * 4. 列表分广场/我的**两条独立 SQL**，各自命中自己的索引，不做 `OR` 条件
 */

const PAGE_SIZE_DEFAULT = 10;
const PAGE_SIZE_MAX = 50;
const COMMENT_PAGE_DEFAULT = 10;
const COMMENT_PAGE_MAX = 50;

/** 正文上限（旧版输入框就是 500） */
const CONTENT_MAX = 500;
/** 评论上限（旧版输入框 maxlength=200） */
const COMMENT_MAX = 200;
/** 单个标签上限 */
const TAG_MAX_LENGTH = 10;
/** 一条故事最多几个标签（旧版是 3） */
const TAG_MAX_COUNT = 3;
/** 一次批量删除最多几条 —— `IN (...)` 的占位符不能无上限地拼 */
const BATCH_DELETE_MAX = 100;



function safeParse(json: string): unknown {
  try {
    return JSON.parse(json) as unknown;
  } catch {

    return null;
  }
}

function parseTags(json: string): string[] {
  const parsed = safeParse(json);
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
}

function authorOf(row: {
  author_id: string;
  author_nickname: string | null;
  author_username: string;
  author_avatar_version: number;
}) {
  return {
    id: row.author_id,
    nickname: row.author_nickname,
    username: row.author_username,

    avatarPath: avatarPathOf({ id: row.author_id, avatar_version: row.author_avatar_version }),
  };
}

function toPublicStory(row: StoryRow) {
  return {
    id: row.id,
    content: row.content,

    event: safeParse(row.event_data),
    tags: parseTags(row.tags),
    likes: row.likes,
    comments: row.comments,
    createTime: row.create_time,
    updateTime: row.update_time,
    author: authorOf(row),

    liked: Boolean(row.liked),
  };
}

function toPublicComment(row: CommentRow) {
  return {
    id: row.id,
    storyId: row.story_id,
    content: row.content,
    createTime: row.create_time,
    author: authorOf(row),
  };
}



/**
 * 解析分页参数。
 *
 * 返回的 `pageSize` 是**客户端要的条数**，查询时要自己 +1
 * （多查一条来判断 hasMore，比 `COUNT(*)` 便宜）。
 */
function readPaging(url: URL, defaultSize: number, maxSize: number): { pageSize: number; offset: number } {
  const pageRaw = Number(url.searchParams.get('page'));
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;

  const sizeRaw = Number(url.searchParams.get('pageSize'));
  const size = Number.isFinite(sizeRaw) && sizeRaw > 0 ? Math.floor(sizeRaw) : defaultSize;
  const pageSize = Math.min(maxSize, Math.max(1, size));

  return { pageSize, offset: (page - 1) * pageSize };
}

function readTags(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw Errors.badRequest('标签格式不正确', 'TAGS_INVALID');

  const tags: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const tag = item.trim();
    if (!tag) continue;
    if (tag.length > TAG_MAX_LENGTH) {
      throw Errors.badRequest(`单个标签最多 ${TAG_MAX_LENGTH} 个字`, 'TAG_TOO_LONG');
    }
    if (!tags.includes(tag)) tags.push(tag);
  }

  if (tags.length > TAG_MAX_COUNT) {
    throw Errors.badRequest(`最多只能选 ${TAG_MAX_COUNT} 个标签`, 'TOO_MANY_TAGS');
  }

  return tags;
}

/** 故事必须存在，否则统一 404 */
async function assertStoryExists(env: Env, storyId: string): Promise<string> {
  const ownerId = await db.getStoryUserId(env.DB, storyId);
  if (!ownerId) throw Errors.notFound('这条故事不存在或已被删除', 'STORY_NOT_FOUND');
  return ownerId;
}



/**
 * GET /api/stories?page=&pageSize=&userOnly=
 *
 * 「广场」和「我的故事」共用这一个接口，靠 `userOnly` 区分（旧版就是这么做的）。
 */
export async function list(request: Request, env: Env): Promise<Response> {
  const userId = await requireUserId(request, env);
  const url = new URL(request.url);
  const userOnly = url.searchParams.get('userOnly') === 'true';
  const { pageSize, offset } = readPaging(url, PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX);


  const limit = pageSize + 1;

  const statement = userOnly
    ? db.listMyStoriesStatement(env.DB, { viewerId: userId, limit, offset })
    : db.listStoriesStatement(env.DB, { viewerId: userId, limit, offset });

  const result = await statement.all<StoryRow>();
  const rows = result.results ?? [];

  const hasMore = rows.length > pageSize;
  const page = hasMore ? rows.slice(0, pageSize) : rows;

  return ok({ stories: page.map(toPublicStory), hasMore });
}

/**
 * POST /api/stories
 *
 * body：`{ content, event, tags }`
 *
 * `event` 是**事件的完整快照**，原样存进 `event_data`。
 * 前端负责把不该带过去的字段（isTop / source 之类）剔掉。
 */
export async function publish(request: Request, env: Env): Promise<Response> {
  const userId = await requireUserId(request, env);
  const body = asRecord(await readJson(request));

  const content = str(body, 'content');
  if (!content) throw Errors.badRequest('请填写故事内容', 'CONTENT_REQUIRED');
  if (content.length > CONTENT_MAX) {
    throw Errors.badRequest(`故事内容最多 ${CONTENT_MAX} 个字`, 'CONTENT_TOO_LONG');
  }

  const event = body['event'];
  if (event === null || typeof event !== 'object' || Array.isArray(event)) {
    throw Errors.badRequest('请选择一个事件', 'EVENT_REQUIRED');
  }

  const tags = readTags(body['tags']);
  const now = Date.now();
  const id = generateId('story');

  await db.insertStory(env.DB, {
    id,
    userId,
    content,
    eventData: JSON.stringify(event),
    tags: JSON.stringify(tags),
    now,
  });


  const row = await db.getStoryStatement(env.DB, { id, viewerId: userId }).first<StoryRow>();
  if (!row) throw Errors.internal('发布成功但读取失败，请刷新看看');

  return ok({ story: toPublicStory(row) }, 201);
}



export async function detail(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
  const userId = await requireUserId(request, env);
  const row = await db.getStoryStatement(env.DB, { id: params.id, viewerId: userId }).first<StoryRow>();
  if (!row) throw Errors.notFound('这条故事不存在或已被删除', 'STORY_NOT_FOUND');

  return ok({ story: toPublicStory(row) });
}

/** 单条删除：本质是「批量删一条」，共用同一个语句工厂 */
export async function remove(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
  const userId = await requireUserId(request, env);
  const ownerId = await assertStoryExists(env, params.id);

  if (ownerId !== userId) throw Errors.forbidden('只能删除自己的故事', 'NOT_STORY_OWNER');

  const results = await env.DB.batch(db.deleteStoryStatements(env.DB, [params.id], userId));

  return ok({ deleted: changedRows(results[2]) });
}

/**
 * POST /api/stories/delete-batch
 *
 * body：`{ ids: string[] }`
 *
 * **一次请求删 N 条** —— 客户端不要循环调单条删除。
 * 三条 SQL 打包成一个 batch，所以删 50 条和删 1 条花的是同一个请求。
 *
 * 不属于自己的 id 会被静默跳过（`DELETE` 上的 `user_id = ?` 兜着），
 * 反正返回的 `deleted` 是**实际删掉的条数**，跟传进来的数量不一定相等。
 */
export async function removeBatch(request: Request, env: Env): Promise<Response> {
  const userId = await requireUserId(request, env);
  const body = asRecord(await readJson(request));

  const raw = body['ids'];
  if (!Array.isArray(raw)) throw Errors.badRequest('ids 必须是数组', 'IDS_INVALID');


  const ids = Array.from(new Set(raw.filter((item): item is string => typeof item === 'string' && item.length > 0)));

  if (ids.length === 0) throw Errors.badRequest('没有要删除的故事', 'IDS_EMPTY');
  if (ids.length > BATCH_DELETE_MAX) {
    throw Errors.badRequest(`一次最多删除 ${BATCH_DELETE_MAX} 条`, 'TOO_MANY_IDS');
  }

  const results = await env.DB.batch(db.deleteStoryStatements(env.DB, ids, userId));

  return ok({ deleted: changedRows(results[2]) });
}



/**
 * POST /api/stories/:id/like —— **切换**语义
 *
 * 赞过就取消、没赞过就加上。同一个用户反复点不会重复计数
 * （`story_likes` 的复合主键 + 这里的先查后写）。
 *
 * 返回 `{ liked, likes }`，客户端拿服务端的数字校准本地 ——
 * 前端是乐观更新的，服务端才是事实。
 */
export async function toggleLike(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
  const userId = await requireUserId(request, env);
  await assertStoryExists(env, params.id);

  const liked = await db.hasStoryLike(env.DB, params.id, userId);
  const results = await env.DB.batch(
    db.toggleLikeStatements(env.DB, { storyId: params.id, userId, liked, now: Date.now() }),
  );


  const rows = (results[2]?.results ?? []) as unknown as Array<{ likes: number }>;

  return ok({ liked: !liked, likes: rows[0]?.likes ?? 0 });
}



export async function listComments(
  request: Request,
  env: Env,
  params: Record<string, string>,
): Promise<Response> {
  await requireUserId(request, env);
  const url = new URL(request.url);
  const { pageSize, offset } = readPaging(url, COMMENT_PAGE_DEFAULT, COMMENT_PAGE_MAX);

  const result = await db
    .listCommentsStatement(env.DB, { storyId: params.id, limit: pageSize + 1, offset })
    .all<CommentRow>();
  const rows = result.results ?? [];

  const hasMore = rows.length > pageSize;
  const page = hasMore ? rows.slice(0, pageSize) : rows;

  return ok({ comments: page.map(toPublicComment), hasMore });
}

/**
 * GET /api/stories/:id/detail
 *
 * 故事详情页要的两份数据合成一个请求：**故事本体 + 第一页评论**。2 → 1。
 *
 * 只合并第一页评论（客户端一页 4 条）：翻页仍然走
 * `GET /api/stories/:id/comments` —— 那条路径语义更单一，也没必要为它再开接口。
 *
 * 实现是调现有 handler 再拼 data，不重抄 SQL（理由见 `unwrapData` 的注释）。
 */
export async function detailWithComments(
  request: Request,
  env: Env,
  params: Record<string, string>,
): Promise<Response> {

  const commentsUrl = new URL(request.url);
  commentsUrl.searchParams.set('page', '1');
  const commentsRequest = new Request(commentsUrl.toString(), request);

  const [storyRes, commentsRes] = await Promise.all([
    detail(request, env, params),
    listComments(commentsRequest, env, params),
  ]);

  const [storyData, commentsData] = await Promise.all([
    unwrapData(storyRes),
    unwrapData(commentsRes),
  ]);

  return ok({ ...storyData, ...commentsData });
}

/**
 * POST /api/stories/:id/comment
 *
 * body：`{ content }`
 *
 * 直接把新评论返回给客户端（带作者信息），前端插到列表最前面即可，
 * **不用再拉一次评论列表** —— 省一个请求。
 */
export async function addComment(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
  const userId = await requireUserId(request, env);
  const body = asRecord(await readJson(request));

  const content = str(body, 'content');
  if (!content) throw Errors.badRequest('评论内容不能为空', 'COMMENT_REQUIRED');
  if (content.length > COMMENT_MAX) {
    throw Errors.badRequest(`评论最多 ${COMMENT_MAX} 个字`, 'COMMENT_TOO_LONG');
  }

  await assertStoryExists(env, params.id);

  const id = generateId('comment');
  await env.DB.batch(
    db.insertCommentStatements(env.DB, { id, storyId: params.id, userId, content, now: Date.now() }),
  );

  const row = await db.getCommentStatement(env.DB, id).first<CommentRow>();
  if (!row) throw Errors.internal('评论发不出去，请重试');

  return ok({ comment: toPublicComment(row) }, 201);
}

/**
 * DELETE /api/stories/comments/:id
 *
 * **只能删自己的评论**，别人的一律 403。
 *
 * 旧版用户端没有这个功能（只有想象中的"管理后台"能删），结果就是发错的评论
 * 永远删不掉。这里补上。
 *
 * 顺带把 `stories.comments` 减回去 —— 否则卡片上的评论数会一直虚高。
 * 返回新计数，前端拿它校准。
 */
export async function removeComment(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
  const userId = await requireUserId(request, env);


  const info = await db.getCommentInfo(env.DB, params.id);
  if (!info) throw Errors.notFound('评论不存在或已被删除');
  if (info.userId !== userId) throw Errors.forbidden('只能删除自己的评论', 'NOT_COMMENT_OWNER');

  const results = await env.DB.batch(
    db.deleteCommentStatements(env.DB, {
      commentId: params.id,
      storyId: info.storyId,
      userId,
      now: Date.now(),
    }),
  );


  const rows = (results[2]?.results ?? []) as unknown as Array<{ comments: number }>;

  return ok({ deleted: changedRows(results[0]), comments: rows[0]?.comments ?? 0 });
}

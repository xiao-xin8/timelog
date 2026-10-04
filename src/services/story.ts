import type {
  StoryComment,
  StoryCommentPage,
  StoryDraft,
  StoryItem,
  StoryPage,
} from '../types/story';
import { request } from './api';
import { cachedGet, invalidate } from './httpCache';





/**
 * 故事列表需要刷新吗？
 *
 * 详情页改了东西（点赞 / 评论 / 删除）就置个标记，列表页在重新获得焦点时消费它。
 *
 * **为什么不做「每次 focus 都重拉」**：那样"从详情返回"会变成一次无条件请求，
 * 而大多数情况下用户什么都没改。用模块级变量就够了 —— 两个页面在同一个
 * JS 上下文里，也不需要引入状态管理。
 */
let listDirty = false;

export function markStoryListDirty(): void {
  listDirty = true;
}

/** 取走标记（取完即清），返回是否需要刷新 */
export function consumeStoryListDirty(): boolean {
  const dirty = listDirty;
  listDirty = false;
  return dirty;
}



/** 拼上查询串；没有参数时不要留一个光秃秃的 `?` */
function withQuery(path: string, params: Record<string, string | number | boolean | undefined>): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === false) continue;
    query.set(key, String(value));
  }

  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

/** 让调用方按需绕开缓存（下拉刷新 / 脏标记刷新 / 重试用） */
interface RefreshOption {
  force?: boolean;
}

/** 只有第一页值得缓存：翻页的数据变化快、命中率低 */
function isFirstPage(page: number | undefined): boolean {
  return page === undefined || page <= 1;
}

/**
 * 故事列表
 *
 * 「广场」和「我的故事」是同一个接口，靠 `userOnly` 区分（旧版就是这么做的）。
 */
export async function fetchStories(
  params: { page?: number; pageSize?: number; userOnly?: boolean } & RefreshOption = {},
): Promise<StoryPage> {
  const path = withQuery('/stories', {
    page: params.page,
    pageSize: params.pageSize,
    userOnly: params.userOnly,
  });

  if (!isFirstPage(params.page)) return await request<StoryPage>(path);

  return await cachedGet<StoryPage>(path, { tier: 'list', force: params.force });
}

export async function fetchStory(id: string, options: RefreshOption = {}): Promise<StoryItem> {
  const data = await cachedGet<{ story: StoryItem }>(`/stories/${encodeURIComponent(id)}`, {
    tier: 'normal',
    persist: true,
    force: options.force,
  });
  return data.story;
}

/**
 * 故事详情页要的一切：**故事本体 + 第一页评论**，一个请求拿回（Slice 16）。
 *
 * 合并前是 `fetchStory()` + `fetchComments(1)` 两个请求，而且原本还是
 * **两个独立的 useEffect**（各自 setState，谁先回来不确定）。
 *
 * 缓存按 `short` 走：详情本身变化慢，但评论变化快，取中间的档。
 */
export async function fetchStoryDetail(
  storyId: string,
  params: { pageSize?: number } & RefreshOption = {},
): Promise<{ story: StoryItem; comments: StoryComment[]; hasMore: boolean }> {
  const path = withQuery(`/stories/${encodeURIComponent(storyId)}/detail`, {
    pageSize: params.pageSize,
  });

  return await cachedGet(path, { tier: 'list', force: params.force });
}

export async function publishStory(draft: StoryDraft): Promise<StoryItem> {
  const data = await request<{ story: StoryItem }>('/stories', { method: 'POST', body: draft });

  invalidate('/stories');

  return data.story;
}

/** 删一条。返回**实际删掉的条数**（不属于自己的会被静默跳过） */
export async function deleteStory(id: string): Promise<number> {
  const data = await request<{ deleted: number }>(`/stories/${encodeURIComponent(id)}`, { method: 'DELETE' });

  invalidate('/stories');

  return data.deleted;
}

/**
 * 批量删除 —— **一次请求删 N 条**。
 *
 * ⚠️ 不要在客户端循环调 `deleteStory`：那样 N 条就是 N 个 Worker 请求，
 * 而这里只要 1 个（后端用一个 batch 把三张表一起清掉）。
 */
export async function deleteStories(ids: string[]): Promise<number> {
  const data = await request<{ deleted: number }>('/stories/delete-batch', {
    method: 'POST',
    body: { ids },
  });

  invalidate('/stories');

  return data.deleted;
}

/**
 * 点赞切换。
 *
 * 返回的是**服务端的事实**（`liked` + 新计数）——
 * 页面那边是乐观更新的，拿到这个之后要用它校准本地。
 */
export async function toggleStoryLike(id: string): Promise<{ liked: boolean; likes: number }> {
  const data = await request<{ liked: boolean; likes: number }>(
    `/stories/${encodeURIComponent(id)}/like`,
    { method: 'POST' },
  );

  invalidate('/stories');

  return data;
}

export async function fetchComments(
  storyId: string,
  params: { page?: number; pageSize?: number } & RefreshOption = {},
): Promise<StoryCommentPage> {
  const path = withQuery(`/stories/${encodeURIComponent(storyId)}/comments`, {
    page: params.page,
    pageSize: params.pageSize,
  });

  if (!isFirstPage(params.page)) return await request<StoryCommentPage>(path);

  return await cachedGet<StoryCommentPage>(path, { tier: 'list', force: params.force });
}

/** 发评论。后端会把新评论（带作者信息）直接返回，插到列表最前面即可 */
export async function addComment(storyId: string, content: string): Promise<StoryComment> {
  const data = await request<{ comment: StoryComment }>(
    `/stories/${encodeURIComponent(storyId)}/comment`,
    { method: 'POST', body: { content } },
  );


  invalidate('/stories');

  return data.comment;
}

/**
 * 删一条评论。**只能删自己的**（别人的服务端会回 403）。
 *
 * 返回服务端算好的**新评论数** —— 前端拿它校准，不用自己猜。
 *
 * ⚠️ 这里只有评论 id、不知道 storyId，所以失效只能给宽前缀
 * （评论数变了，故事列表上的计数也会变，宽一点反而是对的）。
 */
export async function deleteComment(commentId: string): Promise<number> {
  const data = await request<{ deleted: number; comments: number }>(
    `/stories/comments/${encodeURIComponent(commentId)}`,
    { method: 'DELETE' },
  );

  invalidate('/stories');

  return data.comments;
}

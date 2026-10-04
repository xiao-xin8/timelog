import * as db from '../db/queries';
import type { SyncRow, UserRow } from '../db/queries';
import { Errors } from '../lib/errors';
import { notModified, ok } from '../lib/response';
import { toPublicUser, type PublicUser } from '../lib/serialize';
import { asRecord, num, readJson, str } from '../lib/validate';
import { requireUserId } from '../middleware/auth';



/** 单次请求最多接受多少条改动，防滥用 */
const MAX_DELTA_ITEMS = 500;

interface SyncDelta {
  upsert: unknown[];
  /** 被删除的 id（墓碑） */
  delete: string[];
}

interface SyncResponse {
  /** 服务端当前的同步水位；客户端存下来作为下次的 since */
  seq: number;
  events: SyncDelta;
  categories: SyncDelta;
  user: PublicUser | null;
}

/** 把数据库行还原成 delta：未删除的进 upsert，墓碑进 delete */
function toDelta(rows: SyncRow[]): SyncDelta {
  const upsert: unknown[] = [];
  const deleted: string[] = [];

  for (const row of rows) {
    if (row.is_deleted) {
      deleted.push(row.id);
      continue;
    }
    try {
      upsert.push(JSON.parse(row.data));
    } catch {

      console.error(`[sync] 记录 ${row.id} 的 data 不是合法 JSON，已跳过`);
    }
  }

  return { upsert, delete: deleted };
}

/** 解析客户端上传的 delta */
function parseDelta(value: unknown, label: string): SyncDelta {
  if (value === undefined || value === null) {
    return { upsert: [], delete: [] };
  }

  const record = asRecord(value, `${label}`);
  const upsert = Array.isArray(record['upsert']) ? record['upsert'] : [];
  const deletedRaw = Array.isArray(record['delete']) ? record['delete'] : [];

  if (upsert.length > MAX_DELTA_ITEMS || deletedRaw.length > MAX_DELTA_ITEMS) {
    throw Errors.badRequest(`一次最多同步 ${MAX_DELTA_ITEMS} 条改动`);
  }

  return {
    upsert,
    delete: deletedRaw.filter((item): item is string => typeof item === 'string' && item.length > 0),
  };
}

/** 一次 batch 取回「事件 + 分类 + 用户资料」 */
async function readDelta(env: Env, userId: string, since: number, seq: number): Promise<SyncResponse> {
  const [eventResult, categoryResult, userResult] = await env.DB.batch([
    db.listEventsSinceStatement(env.DB, userId, since),
    db.listCategoriesSinceStatement(env.DB, userId, since),
    db.getUserStatement(env.DB, userId),
  ]);

  const eventRows = (eventResult.results ?? []) as unknown as SyncRow[];
  const categoryRows = (categoryResult.results ?? []) as unknown as SyncRow[];
  const userRow = ((userResult.results ?? []) as unknown as UserRow[])[0];

  return {
    seq,
    events: toDelta(eventRows),
    categories: toDelta(categoryRows),
    user: userRow ? toPublicUser(userRow) : null,
  };
}

/**
 * 从 query 或 If-None-Match 里取 since。
 *
 * 两种都支持：query 更直观，ETag 让客户端能用标准的缓存语义。
 */
function resolveSince(url: URL, request: Request): number {
  const raw = url.searchParams.get('since');
  if (raw !== null) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
  }

  const etag = request.headers.get('If-None-Match');
  if (etag) {
    const parsed = Number(etag.replace(/^W\//, '').replace(/"/g, ''));
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  }

  return 0;
}

/** GET /api/sync —— 拉取增量 */
export async function pull(request: Request, env: Env): Promise<Response> {
  const userId = await requireUserId(request, env);
  const since = resolveSince(new URL(request.url), request);

  const seq = await db.getSeq(env.DB, userId);
  if (since >= seq) {

    return notModified(`"${seq}"`);
  }

  return ok(await readDelta(env, userId, since, seq));
}

/**
 * POST /api/sync —— 批量上传
 *
 * 返回的 delta 是「自客户端 since 以来的全部变化」——**包含刚上传的这批自己**。
 * 这是故意的：客户端合并完成后就能把 since 安全地推到 seq。
 * 如果只回别人的改动，客户端会以为「我已经有到 seq 的全部数据了」而漏掉
 * 其他设备在它编辑期间写的东西。
 */
export async function push(request: Request, env: Env): Promise<Response> {
  const userId = await requireUserId(request, env);
  const body = asRecord(await readJson(request));

  const sinceRaw = num(body, 'since') ?? 0;
  const since = Number.isFinite(sinceRaw) && sinceRaw > 0 ? Math.floor(sinceRaw) : 0;

  const events = parseDelta(body['events'], 'events');
  const categories = parseDelta(body['categories'], 'categories');

  let seq = await db.getSeq(env.DB, userId);
  const now = Date.now();
  const statements: D1PreparedStatement[] = [];

  for (const item of events.upsert) {
    const record = asRecord(item, '事件');
    const id = str(record, 'id');
    if (!id) throw Errors.badRequest('上传的事件缺少 id');

    seq += 1;
    statements.push(
      db.upsertEventStatement(env.DB, { id, userId, seq, data: JSON.stringify(record), now }),
    );
  }

  for (const id of events.delete) {
    seq += 1;
    statements.push(db.deleteEventStatement(env.DB, { id, userId, seq, now }));
  }

  for (const item of categories.upsert) {
    const record = asRecord(item, '分类');
    const key = str(record, 'key');
    if (!key) throw Errors.badRequest('上传的分类缺少 key');

    seq += 1;
    statements.push(
      db.upsertCategoryStatement(env.DB, { key, userId, seq, data: JSON.stringify(record), now }),
    );
  }

  for (const key of categories.delete) {
    seq += 1;
    statements.push(db.deleteCategoryStatement(env.DB, { key, userId, seq, now }));
  }

  if (statements.length > 0) {
    statements.push(db.updateSeqStatement(env.DB, userId, seq, now));

    await env.DB.batch(statements);
  }

  return ok(await readDelta(env, userId, since, seq));
}

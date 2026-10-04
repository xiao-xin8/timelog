import { AppError, Errors } from './errors';

/**
 * 统一响应封装
 *
 * 契约（前后端都要遵守）：
 *   成功  { success: true,  data: T }
 *   失败  { success: false, error: { code, message } }
 *
 * 另外统一加两个头：
 *   - CORS：原生 App 其实不需要，但以后万一有 Web 端就省事了
 *   - Cache-Control: no-store —— 全是用户私有数据，任何一层都别缓存
 */
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, If-None-Match',
  'Access-Control-Max-Age': '86400',
};

const BASE_HEADERS: Record<string, string> = {
  ...CORS_HEADERS,
  'Cache-Control': 'no-store',
};

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiFailure {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...BASE_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export function ok<T>(data: T, status = 200): Response {
  const body: ApiSuccess<T> = { success: true, data };
  return jsonResponse(body, status);
}

export function fail(error: AppError): Response {
  const body: ApiFailure = {
    success: false,
    error: { code: error.code, message: error.message },
  };
  return jsonResponse(body, error.status);
}

/**
 * 304。
 *
 * 同步接口在「服务端没有新变化」时走这里：客户端只拿到一个空的 304，
 * 服务端也只读了 user_state 的一行，业务表一行都没扫 —— 这是省额度的大头。
 */
export function notModified(etag: string): Response {
  return new Response(null, {
    status: 304,
    headers: { ...BASE_HEADERS, ETag: etag },
  });
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * 从一个成功响应里取出 `data`（合并接口专用，Slice 16）
 *
 * 合并接口的做法是**直接调用现有的 route handler、再把各自的 data 拼起来**，
 * 而不是把 SQL 抄第二遍。抄一遍的代价：
 *
 * - 多一份要同步维护的查询（改了一处忘了另一处 = 数据不一致）
 * - 会漏掉副作用。典型是 `chatRoutes.listMessages`：它"顺手把对方发来的标已读、
 *   还广播给对方"，抄 SQL 就必然漏掉这段
 *
 * handler 失败时是**抛出**（异常统一由入口的 catch 转成响应），所以正常情况下
 * 这里只会拿到成功体；`success !== true` 纯属兜底。
 */
export async function unwrapData(response: Response): Promise<Record<string, unknown>> {
  const body = (await response.json()) as { success?: boolean; data?: Record<string, unknown> };

  if (body.success !== true || !body.data) throw Errors.internal();

  return body.data;
}

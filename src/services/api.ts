import { Platform } from 'react-native';

import { STORAGE_KEYS } from '../constants/storageKeys';
import { loadJSON, loadString, removeKey, saveJSON, saveString } from './storage';
import { apiUrl } from './config';





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

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  nickname: string | null;
  /** 旧字段，新版不用（预设头像已砍） */
  avatarId: string | null;
  /**
   * 头像**相对路径**（如 `/api/avatar/xxx?v=1700000000000`）。
   *
   * 服务端故意不返回绝对地址：域名只有前端知道（`services/config.ts`），
   * 两边各存一份迟早会对不上。用 `avatarSource()`（见 utils/avatar.ts）拼。
   *
   * `null` = 没有自定义头像 → 画「色块 + 首字母」的默认头像。
   */
  avatarPath: string | null;
  bio: string | null;
  gender: string | null;
  birthday: string | null;
  location: string | null;
  createdAt: number;
  lastLoginAt: number | null;
}

/** 能通过 `PUT /api/user` 修改的资料字段 */
export interface ProfilePatch {
  nickname?: string | null;
  avatarId?: string | null;
  bio?: string | null;
  gender?: string | null;
  birthday?: string | null;
  location?: string | null;
}

/** 登录/注册成功后拿到的会话 */
export interface SessionPayload {
  accessToken: string;
  refreshToken: string;
  /** access token 有效期（秒） */
  expiresIn: number;
  user: AuthUser;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** 是否带 token 并参与 401 自动刷新，默认 true */
  auth?: boolean;
}

export interface RawResponse {
  status: number;
  data: unknown;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }

  /** 网络层没通（不是后端给的错误） */
  get isNetworkError(): boolean {
    return this.code === 'NETWORK_ERROR';
  }
}



const REQUEST_TIMEOUT_MS = 20_000;
const NETWORK_ERROR_MESSAGE = '网络不太顺畅，请稍后重试';
const BAD_RESPONSE_MESSAGE = '服务器返回的数据看不懂，请稍后重试';
const SESSION_EXPIRED_MESSAGE = '登录已失效，请重新登录';

/** 距过期还有这么久，就提前静默刷新，避免白撞一次 401 */
const REFRESH_AHEAD_MS = 20 * 60 * 1000;

const DEVICE_NAME = Platform.OS === 'android' ? 'Android' : Platform.OS === 'ios' ? 'iOS' : 'Unknown';



/**
 * 内存里的 token。
 *
 * 同时会持久化到 AsyncStorage，这样冷启动可以直接发请求，
 * 不用先等一轮刷新。真正的"还记得我吗"靠的是 refreshToken。
 */
let accessToken: string | null = null;
let refreshToken: string | null = null;

/** 单飞：同一时刻只允许有一次刷新在跑 */
let refreshPromise: Promise<RefreshResult> | null = null;

/** 登录态失效时的回调，由 useAuthStore 注册（避免两个模块互相 import） */
let sessionExpiredHandler: (() => void) | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler;
}

export function getAccessToken(): string | null {
  return accessToken;
}



export async function restoreTokens(): Promise<void> {
  accessToken = await loadString(STORAGE_KEYS.AUTH_TOKEN);
  refreshToken = await loadString(STORAGE_KEYS.AUTH_REFRESH_TOKEN);
}

export async function persistSession(payload: SessionPayload): Promise<void> {
  accessToken = payload.accessToken;
  refreshToken = payload.refreshToken;
  await Promise.all([
    saveString(STORAGE_KEYS.AUTH_TOKEN, payload.accessToken),
    saveString(STORAGE_KEYS.AUTH_REFRESH_TOKEN, payload.refreshToken),
    saveJSON(STORAGE_KEYS.USER_INFO, payload.user),
  ]);
}

/** 只更新 access（刷新接口不换 refresh token，也不动 user） */
async function persistAccessToken(token: string): Promise<void> {
  accessToken = token;
  await saveString(STORAGE_KEYS.AUTH_TOKEN, token);
}

export async function loadCachedUser(): Promise<AuthUser | null> {
  return await loadJSON<AuthUser | null>(STORAGE_KEYS.USER_INFO, null);
}

export async function saveCachedUser(user: AuthUser): Promise<void> {
  await saveJSON(STORAGE_KEYS.USER_INFO, user);
}

export async function clearSession(): Promise<void> {
  accessToken = null;
  refreshToken = null;
  await Promise.all([
    removeKey(STORAGE_KEYS.AUTH_TOKEN),
    removeKey(STORAGE_KEYS.AUTH_REFRESH_TOKEN),
    removeKey(STORAGE_KEYS.USER_INFO),
  ]);
}

export function hasRefreshToken(): boolean {
  return Boolean(refreshToken);
}



function buildHeaders(options: RequestOptions, token: string | null): Record<string, string> {
  return {
    ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function send(path: string, options: RequestOptions, token: string | null): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(apiUrl(path), {
      method: options.method ?? 'GET',
      headers: buildHeaders(options, token),
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch {

    throw new ApiError('NETWORK_ERROR', NETWORK_ERROR_MESSAGE, 0);
  } finally {
    clearTimeout(timer);
  }
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** 把 access token 的过期时间抠出来（纯本地解码，不验签） */
function readExpiry(token: string): number | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    if (typeof atob !== 'function') return null;
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padding = (4 - (normalized.length % 4)) % 4;
    const payload = JSON.parse(atob(normalized + '='.repeat(padding))) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function isAccessTokenStale(): boolean {
  if (!accessToken) return true;
  const expiry = readExpiry(accessToken);

  if (expiry === null) return false;
  return Date.now() + REFRESH_AHEAD_MS >= expiry;
}

function expireSession(): void {

  if (!accessToken && !refreshToken) return;


  void clearSession();
  sessionExpiredHandler?.();
}



export interface RefreshResult {
  accessToken: string;
  expiresIn: number;
  /** 刷新接口会顺带带回最新的用户资料，可能为 null */
  user: AuthUser | null;
}

async function performRefresh(): Promise<RefreshResult> {
  if (!refreshToken) {
    throw new ApiError('NO_REFRESH_TOKEN', SESSION_EXPIRED_MESSAGE, 401);
  }


  const response = await send('/auth/refresh', { method: 'POST', body: { refreshToken } }, null);
  const body = await parseBody(response);

  if (response.status !== 200 || !isSuccess(body)) {
    throw new ApiError('REFRESH_FAILED', SESSION_EXPIRED_MESSAGE, 401);
  }

  const data = body.data as { accessToken?: string; expiresIn?: number; user?: AuthUser };
  if (typeof data.accessToken !== 'string') {
    throw new ApiError('REFRESH_FAILED', SESSION_EXPIRED_MESSAGE, 401);
  }

  await persistAccessToken(data.accessToken);
  if (data.user) {
    await saveCachedUser(data.user);
  }

  return {
    accessToken: data.accessToken,
    expiresIn: typeof data.expiresIn === 'number' ? data.expiresIn : 0,
    user: data.user ?? null,
  };
}

/**
 * 换一个新的 access token，并顺便把 180 天窗口拉满（这是后端做的）。
 *
 * **单飞**：并发调用共用同一个 Promise。冷启动时若有 5 个请求同时 401，
 * 这里只会真的发一次刷新，其余 4 个拿到同一个结果。
 *
 * 启动时的静默续期也走它 —— 这是修掉旧版「看着还登录着、其实什么都干不了」
 * 的关键：**登录态的唯一真相是「能不能成功换到 access」，
 * 不是「本地有没有那串字符串」**。
 */
export function refreshAccessToken(): Promise<RefreshResult> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = performRefresh().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}



function isSuccess(value: unknown): value is ApiSuccess<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { success?: unknown }).success === true
  );
}

function isFailure(value: unknown): value is ApiFailure {
  const candidate = value as { success?: unknown; error?: { code?: unknown; message?: unknown } };
  return (
    typeof value === 'object' &&
    value !== null &&
    candidate.success === false &&
    typeof candidate.error?.code === 'string' &&
    typeof candidate.error?.message === 'string'
  );
}

async function execute(path: string, options: RequestOptions, allowRetry: boolean): Promise<RawResponse> {
  const needsAuth = options.auth !== false;


  if (needsAuth && isAccessTokenStale() && hasRefreshToken()) {
    try {
      await refreshAccessToken();
    } catch {
      // 刷新失败不在这里登出：让下面的 401 分支统一处理，
      // 避免把「网络抖了一下」误判成「登录失效」
    }
  }

  let response = await send(path, options, needsAuth ? accessToken : null);

  if (response.status === 401 && needsAuth && allowRetry) {
    try {
      await refreshAccessToken();
    } catch (error) {
      expireSession();
      throw error;
    }


    response = await send(path, options, accessToken);

    if (response.status === 401) {
      expireSession();
      throw new ApiError('SESSION_EXPIRED', SESSION_EXPIRED_MESSAGE, 401);
    }
  }

  return { status: response.status, data: await parseBody(response) };
}

/** 拿原始状态码和响应体。同步接口的 304 需要它 */
export async function requestRaw(path: string, options: RequestOptions = {}): Promise<RawResponse> {
  return await execute(path, options, true);
}

/** 走统一响应格式的请求，直接拿 data */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { status, data } = await execute(path, options, true);

  if (isFailure(data)) {
    throw new ApiError(data.error.code, data.error.message, status);
  }

  if (isSuccess(data)) {
    return data.data as T;
  }

  throw new ApiError('BAD_RESPONSE', BAD_RESPONSE_MESSAGE, status);
}



/**
 * 登录。
 *
 * auth: false —— 密码错返回的 401 是"凭证不对"，不是"登录态过期"，
 * 绝不能触发全局登出（旧版就是这里混在一起，才会出现莫名其妙的掉线）。
 */
export async function login(account: string, password: string): Promise<SessionPayload> {
  return await request<SessionPayload>('/auth/login', {
    method: 'POST',
    auth: false,
    body: { account, password, device: DEVICE_NAME },
  });
}

export async function register(
  username: string,
  email: string,
  password: string,
): Promise<SessionPayload> {
  return await request<SessionPayload>('/auth/register', {
    method: 'POST',
    auth: false,
    body: { username, email, password, device: DEVICE_NAME },
  });
}

/** 登出。失败不抛错 —— 服务端删不掉也要让本地退出去 */
export async function logout(): Promise<void> {
  const token = refreshToken;
  if (!token) return;

  try {
    await request<{ loggedOut: boolean }>('/auth/logout', {
      method: 'POST',
      auth: false,
      body: { refreshToken: token },
    });
  } catch {
    // 忽略：本地清理才是登出的关键
  }
}

export async function fetchProfile(): Promise<AuthUser> {
  const data = await request<{ user: AuthUser }>('/user');
  return data.user;
}



/** 改资料。只提交改动过的字段（照旧版做法） */
export async function updateProfile(patch: ProfilePatch): Promise<AuthUser> {
  const data = await request<{ user: AuthUser }>('/user', { method: 'PUT', body: patch });
  return data.user;
}

/**
 * 上传头像（base64）
 *
 * 图片已经在本地缩到 400×400 压成 JPEG 了（见 `utils/avatar.ts`），
 * 所以这里不用 multipart —— 一个 JSON body 最省事，也避开 RN 发二进制的坑。
 */
export async function uploadAvatar(base64: string): Promise<AuthUser> {
  const data = await request<{ user: AuthUser }>('/user/avatar', {
    method: 'POST',
    body: { data: base64 },
  });
  return data.user;
}

/** 清掉头像，回到默认的「色块 + 首字母」 */
export async function removeAvatar(): Promise<AuthUser> {
  const data = await request<{ user: AuthUser }>('/user/avatar', { method: 'DELETE' });
  return data.user;
}

/**
 * 后端地址
 *
 * **整个 App 只有这一处写后端域名。** 任何页面、任何 service 都不许再拼完整的
 * URL —— 老项目就是因为 base URL 散落在 config.js / sync.js / version.js
 * 三个文件里，改一次地址要全局搜。
 *
 * 后端是独立的 Cloudflare Worker（见仓库根目录 `api/`），
 * 不是老项目的 Pages 站点（那个已经废弃，不参与部署）。
 */
export const API_BASE_URL = 'https://timelog-api.example.com';

/** 所有业务接口都挂在这个前缀下 */
export const API_PREFIX = '/api';

/** 拼出完整请求地址。path 传 '/sync' 这种带前导斜杠的相对路径 */
export function apiUrl(path: string): string {
  return `${API_BASE_URL}${API_PREFIX}${path}`;
}

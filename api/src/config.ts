import { DEFAULT_ITERATIONS } from './lib/password';

/**
 * 运行期配置
 *
 * 时长放在 wrangler.toml 的 [vars] 里，方便不改代码就调。
 */
export interface SessionConfig {
  jwtSecret: string;
  /** access token 有效期（秒） */
  accessTokenTtl: number;
  /** refresh token 滑动窗口（秒） */
  refreshTokenTtl: number;
}

const DEFAULT_ACCESS_TTL = 2 * 60 * 60; 
const DEFAULT_REFRESH_TTL = 180 * 24 * 60 * 60; 

function toSeconds(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function readSessionConfig(env: Env): SessionConfig {
  return {
    jwtSecret: env.JWT_SECRET,
    accessTokenTtl: toSeconds(env.ACCESS_TOKEN_TTL, DEFAULT_ACCESS_TTL),
    refreshTokenTtl: toSeconds(env.REFRESH_TOKEN_TTL, DEFAULT_REFRESH_TTL),
  };
}

/** 免费版必须调低（10ms CPU 上限），上了 Paid 再调回 210000 */
export function readPasswordIterations(env: Env): number {
  return toSeconds(env.PASSWORD_ITERATIONS, DEFAULT_ITERATIONS);
}

import { base64ToBytes, bytesToBase64, encodeUtf8, timingSafeEqual } from './encoding';



/**
 * 默认迭代次数。
 *
 * ⚠️ 这是整个后端唯一一个受 Workers CPU 额度影响的参数，务必看清楚：
 *
 *   | 计划           | CPU 上限/请求 | 21 万次迭代（约 53ms） |
 *   |----------------|--------------|----------------------|
 *   | Workers Free   | **10 ms**    | ❌ 直接 Error 1102    |
 *   | Workers Paid   | 30 s         | ✅ 毫无压力           |
 *
 * 所以这个值由 `PASSWORD_ITERATIONS` 环境变量控制（见 wrangler.toml）：
 * 免费版用 10000（约 2.5ms），上了 Paid 就调回 210000。
 *
 * 换值**不影响已有账号** —— 迭代次数是跟着每条哈希一起存库的，
 * 校验时用的永远是存下来的那个值。
 */
export const DEFAULT_ITERATIONS = 210_000;

const KEY_BITS = 256;
const SALT_BYTES = 16;

export interface PasswordHash {
  /** base64 编码的派生密钥 */
  hash: string;
  /** base64 编码的随机盐 */
  salt: string;
  iterations: number;
}

async function deriveBits(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey('raw', encodeUtf8(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    baseKey,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string, iterations = DEFAULT_ITERATIONS): Promise<PasswordHash> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await deriveBits(password, salt, iterations);
  return {
    hash: bytesToBase64(hash),
    salt: bytesToBase64(salt),
    iterations,
  };
}

export async function verifyPassword(password: string, record: PasswordHash): Promise<boolean> {
  const expected = base64ToBytes(record.hash);
  const actual = await deriveBits(password, base64ToBytes(record.salt), record.iterations);
  return timingSafeEqual(expected, actual);
}

/**
 * 账号不存在时也跑一遍等价开销的计算。
 *
 * 否则「账号不存在」会立刻返回，而「密码错误」要等哈希算完，
 * 攻击者靠响应耗时就能枚举出哪些账号真实存在。
 */
export async function burnPasswordTime(iterations = DEFAULT_ITERATIONS): Promise<void> {
  await deriveBits('timelog-placeholder', new Uint8Array(SALT_BYTES), iterations);
}

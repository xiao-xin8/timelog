/**
 * 编解码与哈希小工具
 *
 * 刻意不用第三方库：
 *   - 老后端用 `btoa(JSON.stringify(...))` 当 base64url 用，payload 里只要出现中文
 *     （比如昵称）就会直接把 token 搞坏。这里用严格的 UTF-8 → base64url。
 *   - WebCrypto 是 Workers 运行时自带的，没必要引依赖。
 */
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function encodeUtf8(value: string): Uint8Array {
  return textEncoder.encode(value);
}

export function decodeUtf8(bytes: Uint8Array): string {
  return textDecoder.decode(bytes);
}

function bytesToBinary(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return binary;
}

function binaryToBytes(binary: string): Uint8Array {
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** 标准 base64（密码哈希用） */
export function bytesToBase64(bytes: Uint8Array): string {
  return btoa(bytesToBinary(bytes));
}

export function base64ToBytes(value: string): Uint8Array {
  return binaryToBytes(atob(value));
}

/** base64url，无 padding（JWT 用） */
export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (normalized.length % 4)) % 4;
  return base64ToBytes(normalized + '='.repeat(padding));
}

/**
 * 生成随机串。
 *
 * refresh token 明文只在「签发的那一刻」存在于内存里，落库的是它的 SHA-256，
 * 所以这里直接用 base64url（256 bit 熵）。
 */
export function randomToken(byteLength = 32): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

/**
 * 生成业务对象的 id。
 *
 * = `<前缀>_<36 进制时间戳>_<随机串>`
 *
 * 时间戳是给**人**看的（排查问题时一眼能看出先后顺序），
 * 随机串保证同一毫秒内批量创建也不会撞。
 *
 * 原来这个故事/评论的 id 生成规则写在 `routes/story.ts` 里，
 * 聊天也要用就抽到这儿了。
 */
export function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomToken(6)}`;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encodeUtf8(value));
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** 常数时间比较，避免通过响应耗时推断哈希内容 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

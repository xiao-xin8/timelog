import { base64UrlToBytes, bytesToBase64Url, decodeUtf8, encodeUtf8 } from './encoding';

/**
 * Access Token（JWT，HS256）
 *
 * 这是「省额度」的核心：普通业务请求**只验签、不查库**。
 * 签发和校验都是纯 CPU 操作，不产生任何 D1 读。
 *
 * 顺手修掉老后端的三个坑：
 *   1. 用 base64url 而不是 btoa —— 老版 payload 里出现中文（昵称）就会崩
 *   2. 校验 header.alg —— 老版不校验，理论上可以拿 alg=none 伪造
 *   3. 密钥走环境变量 —— 老版把密钥存 KV 且首次访问时随机生成，多实例有竞态
 */
const ALGORITHM = 'HS256';

interface JwtHeader {
  alg: string;
  typ: string;
}

interface JwtPayload {
  /** 用户 id */
  sub: string;
  iat: number;
  exp: number;
}

function encodeSegment(value: unknown): string {
  return bytesToBase64Url(encodeUtf8(JSON.stringify(value)));
}

function decodeSegment<T>(segment: string): T {
  return JSON.parse(decodeUtf8(base64UrlToBytes(segment))) as T;
}

async function importKey(secret: string, usage: string[]): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encodeUtf8(secret), { name: 'HMAC', hash: 'SHA-256' }, false, usage);
}

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export async function signAccessToken(userId: string, secret: string, ttlSeconds: number): Promise<string> {
  const issuedAt = nowInSeconds();
  const header = encodeSegment({ alg: ALGORITHM, typ: 'JWT' } satisfies JwtHeader);
  const payload = encodeSegment({
    sub: userId,
    iat: issuedAt,
    exp: issuedAt + ttlSeconds,
  } satisfies JwtPayload);

  const data = `${header}.${payload}`;
  const key = await importKey(secret, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encodeUtf8(data));

  return `${data}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

/**
 * 校验并返回 userId；任何一步不通过都返回 null（不区分原因，
 * 因为客户端对所有 401 的处理都是「拿 refresh 换新的 access」）。
 */
export async function verifyAccessToken(token: string, secret: string): Promise<string | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerSegment, payloadSegment, signatureSegment] = parts;

  try {
    const header = decodeSegment<JwtHeader>(headerSegment);
    if (header.alg !== ALGORITHM) return null;

    const key = await importKey(secret, ['verify']);
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlToBytes(signatureSegment),
      encodeUtf8(`${headerSegment}.${payloadSegment}`),
    );
    if (!isValid) return null;

    const payload = decodeSegment<JwtPayload>(payloadSegment);
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null;
    if (typeof payload.exp !== 'number' || payload.exp <= nowInSeconds()) return null;

    return payload.sub;
  } catch {
    return null;
  }
}

import { Errors } from './errors';

/**
 * 请求入参校验
 *
 * 手写、不引 zod：整张表只有 8 个接口、十几个字段，引库带来的体积和心智成本
 * 都比手写高。校验规则与旧版前端保持一致，别自己发挥。
 */

export const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PASSWORD_MIN_LENGTH = 6;

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw Errors.badRequest('请求体不是合法的 JSON');
  }
}

export function asRecord(value: unknown, label = '请求体'): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw Errors.badRequest(`${label}格式不正确`);
  }
  return value as Record<string, unknown>;
}

/** 取字符串字段并 trim，类型不符或为空串时返回 undefined */
export function str(source: Record<string, unknown>, field: string): string | undefined {
  const value = source[field];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function num(source: Record<string, unknown>, field: string): number | undefined {
  const value = source[field];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
}

export function bool(source: Record<string, unknown>, field: string): boolean | undefined {
  const value = source[field];
  return typeof value === 'boolean' ? value : undefined;
}

export function requireString(value: string | undefined, label: string): string {
  if (!value) throw Errors.badRequest(`请填写${label}`);
  return value;
}

export function assertUsername(value: string | undefined): string {
  const username = requireString(value, '用户名');
  if (!USERNAME_PATTERN.test(username)) {
    throw Errors.badRequest('用户名只能是 3-20 位的字母、数字或下划线', 'USERNAME_INVALID');
  }
  return username;
}

export function assertEmail(value: string | undefined): string {
  const email = requireString(value, '邮箱');
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    throw Errors.badRequest('邮箱格式不正确', 'EMAIL_INVALID');
  }
  return email.toLowerCase();
}

export function assertPassword(value: string | undefined): string {
  const password = requireString(value, '密码');
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw Errors.badRequest(`密码长度至少 ${PASSWORD_MIN_LENGTH} 位`, 'PASSWORD_TOO_SHORT');
  }
  if (password.length > 128) {
    throw Errors.badRequest('密码长度不能超过 128 位', 'PASSWORD_TOO_LONG');
  }
  return password;
}

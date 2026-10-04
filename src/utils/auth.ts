/**
 * 登录 / 注册的纯校验逻辑（Slice 08）
 *
 * 为什么单独放一个文件，而不是写在 `LoginScreen` 里：
 *
 * 1. 这些规则必须和后端 `api/src/lib/validate.ts` 对齐 —— 前端只是即时反馈，
 *    后端才是最终裁判。集中在一处才好核对。
 * 2. 它们不依赖 RN 运行时，所以可以脱离 React Native 单独执行
 *    （`npm run verify:slice08`），不需要开模拟器。
 *
 * 规则与提示文案**逐字照抄**旧版 `legacy/uniapp/pages/login/login.js`，
 * 不要自己发挥。
 */

export const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 后端 `PASSWORD_MIN_LENGTH` 保持一致 */
export const PASSWORD_MIN_LENGTH = 6;

/**
 * 表单里密码输入框的最大长度。
 *
 * 旧版三个密码框都写了 `maxlength="20"`，照抄。
 * 后端允许到 128，这里只是输入限制。
 */
export const PASSWORD_MAX_LENGTH = 20;

export const USERNAME_MAX_LENGTH = 20;

export const PASSWORD_STRENGTH_LABELS = ['', '弱', '中', '强'] as const;

export type PasswordStrength = 0 | 1 | 2 | 3;

/**
 * 用户名：空值不报错（旧版行为：没填不显示红字，只是提交按钮不可用）
 */
export function validateUsername(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return USERNAME_PATTERN.test(trimmed) ? '' : '用户名只能包含字母、数字和下划线，长度3-20位';
}

export function validateEmail(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return EMAIL_PATTERN.test(trimmed) ? '' : '请输入有效的邮箱地址';
}

export function validatePassword(value: string): string {
  if (!value) return '';
  return value.length < PASSWORD_MIN_LENGTH ? '密码长度至少6位' : '';
}

export function validateConfirmPassword(password: string, confirm: string): string {
  if (!confirm) return '';
  return confirm !== password ? '两次输入的密码不一致' : '';
}

/**
 * 密码强度 0-3
 *
 * 旧版的判定条件，逐条照搬：
 *   长度 ≥ 6 → +1
 *   长度 ≥ 10 → +1
 *   字母和数字都有 → +1
 *   含特殊字符（非字母数字）→ +1
 * 最后截到 3 档。
 *
 * 注意：这套算法能给出 4 分，所以必须 `Math.min(..., 3)`，
 * 否则「长 + 字母数字 + 特殊字符」的强密码会算出 4，落到档位之外。
 */
export function calcPasswordStrength(password: string): PasswordStrength {
  if (!password) return 0;

  let strength = 0;
  if (password.length >= PASSWORD_MIN_LENGTH) strength += 1;
  if (password.length >= 10) strength += 1;
  if (/[a-zA-Z]/.test(password) && /\d/.test(password)) strength += 1;
  if (/[^a-zA-Z0-9]/.test(password)) strength += 1;

  return Math.min(strength, 3) as PasswordStrength;
}

/**
 * 注册表单能否提交
 *
 * 旧版是「四个字段都有值 + 四个错误都为空 + 勾了协议」，
 * 且**协议不勾不允许提交**（但不弹提示）。
 */
export function canSubmitRegister(input: {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  agreed: boolean;
}): boolean {
  if (!input.agreed) return false;
  if (!input.username.trim() || !input.email.trim()) return false;
  if (!input.password || !input.confirmPassword) return false;

  return (
    !validateUsername(input.username) &&
    !validateEmail(input.email) &&
    !validatePassword(input.password) &&
    !validateConfirmPassword(input.password, input.confirmPassword)
  );
}

/** 登录表单能否提交：旧版只要求两个字段非空 */
export function canSubmitLogin(account: string, password: string): boolean {
  return account.trim().length > 0 && password.length > 0;
}

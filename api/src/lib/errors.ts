/**
 * 统一错误类型
 *
 * 业务代码只管 `throw Errors.xxx(...)`，最外层统一转成 JSON 响应。
 * `code` 是给客户端做分支用的（比如客户端只认 401 + 任何 code 就触发刷新），
 * `message` 是直接可以弹给用户看的中文。
 */
export class AppError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
  }
}

export const Errors = {
  badRequest(message = '请求参数有误', code = 'BAD_REQUEST') {
    return new AppError(code, message, 400);
  },

  unauthorized(message = '登录已失效，请重新登录', code = 'UNAUTHORIZED') {
    return new AppError(code, message, 401);
  },

  forbidden(message = '没有权限执行该操作', code = 'FORBIDDEN') {
    return new AppError(code, message, 403);
  },

  notFound(message = '接口不存在', code = 'NOT_FOUND') {
    return new AppError(code, message, 404);
  },

  conflict(message = '数据冲突', code = 'CONFLICT') {
    return new AppError(code, message, 409);
  },

  internal(message = '服务器开小差了，请稍后再试', code = 'INTERNAL_ERROR') {
    return new AppError(code, message, 500);
  },
};

/**
 * 把任何抛出物收敛成 AppError。
 * D1 的唯一索引冲突在这里转成友好的「已被注册」。
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (error instanceof Error) {
    const text = `${error.message}`;

    if (text.includes('UNIQUE constraint failed')) {
      if (text.includes('users.username')) return Errors.conflict('用户名已被注册', 'USERNAME_TAKEN');
      if (text.includes('users.email')) return Errors.conflict('邮箱已被注册', 'EMAIL_TAKEN');
      return Errors.conflict('数据已存在', 'DUPLICATE');
    }
    console.error('[api] 未预期的错误', error);
    return Errors.internal();
  }

  console.error('[api] 抛出了非 Error 对象', error);
  return Errors.internal();
}

import type { UserRow } from '../db/queries';

/**
 * 对外暴露的用户结构
 *
 * 字段名用驼峰，和客户端 `types/event.ts` 的风格保持一致。
 * 注意 `password_hash` / `password_salt` / `password_iterations` **绝不能**出现在这里。
 */
export interface PublicUser {
  id: string;
  username: string;
  email: string;
  nickname: string | null;
  /** 旧字段，保留以免老数据报错；新版不用它（预设头像已砍） */
  avatarId: string | null;
  /**
   * 头像地址，**是相对路径**（如 `/api/avatar/xxx?v=1700000000000`），
   * 客户端自己拼 `API_BASE_URL`。
   *
   * 为什么不在服务端拼成绝对地址：域名只有客户端知道（`services/config.ts`），
   * 服务端硬编码一份就会有两处真相，换域名时漏改一处图片就全挂。
   *
   * `null` 表示没有自定义头像 → 前端画「色块 + 首字母」的默认头像。
   */
  avatarPath: string | null;
  bio: string | null;
  gender: string | null;
  birthday: string | null;
  location: string | null;
  createdAt: number;
  lastLoginAt: number | null;
}

/** 头像的对外路径；版本号进 URL 是为了让缓存「换完即失效」 */
export function avatarPathOf(user: Pick<UserRow, 'id' | 'avatar_version'>): string | null {
  if (!user.avatar_version || user.avatar_version <= 0) return null;
  return `/api/avatar/${user.id}?v=${user.avatar_version}`;
}

export function toPublicUser(user: UserRow): PublicUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    nickname: user.nickname,
    avatarId: user.avatar_id,
    avatarPath: avatarPathOf(user),
    bio: user.bio,
    gender: user.gender,
    birthday: user.birthday,
    location: user.location,
    createdAt: user.created_at,
    lastLoginAt: user.last_login_at,
  };
}

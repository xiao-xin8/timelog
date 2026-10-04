import { create } from 'zustand';

import {
  clearSession,
  hasRefreshToken,
  loadCachedUser,
  login as requestLogin,
  logout as requestLogout,
  persistSession,
  refreshAccessToken,
  register as requestRegister,
  restoreTokens,
  saveCachedUser,
  setSessionExpiredHandler,
  type AuthUser,
} from '../services/api';
import { clearHttpCache, invalidate, setCacheOwner } from '../services/httpCache';

/**
 * 登录态（Slice 08）
 *
 * ## 和旧版的根本区别
 *
 * 旧版判断"是否登录"是 `!!uni.getStorageSync('auth_token')` ——
 * **只看本地有没有字符串，从不校验**。所以 token 过期之后，界面依然显示已登录，
 * 但所有接口都 401、用户只能自己去「我的」退出登录再登一遍。
 *
 * 新版：**登录态的唯一真相是「能不能用 refresh token 换到 access」**。
 * 换不到就清干净、退回未登录，用户重新登录一次就能正常用。
 *
 * 冷启动时为了不让已登录用户看到登录页闪一下，会先用本地缓存的用户乐观显示，
 * 但紧接着就做真实校验 —— 校验不过立刻掉回未登录。
 */

export type AuthStatus = 'restoring' | 'signedIn' | 'signedOut';

interface AuthState {
  user: AuthUser | null;
  status: AuthStatus;

  /** 冷启动调一次：读本地 token + 静默续期校验 */
  load(): Promise<void>;
  /** 登录。失败会抛 ApiError（message 可直接展示） */
  signIn(account: string, password: string): Promise<void>;
  /** 注册（后端注册成功就直接返回会话，不用再登录一次） */
  signUp(username: string, email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  /** 改完资料 / 换完头像后，把最新的用户信息同步回 store（顺带落本地缓存） */
  applyUser(user: AuthUser): void;
}

export const useAuthStore = create<AuthState>(set => ({
  user: null,
  status: 'restoring',

  load: async () => {
    await restoreTokens();
    const cached = await loadCachedUser();


    setCacheOwner(cached?.id ?? null);

    if (!hasRefreshToken()) {
      set({ user: null, status: 'signedOut' });
      return;
    }


    set({ user: cached, status: 'signedIn' });

    try {

      const result = await refreshAccessToken();
      setCacheOwner(result.user?.id ?? cached?.id ?? null);
      set({ user: result.user ?? cached, status: 'signedIn' });
    } catch {

      await clearSession();
      await clearHttpCache();
      setCacheOwner(null);
      set({ user: null, status: 'signedOut' });
    }
  },

  signIn: async (account, password) => {
    const session = await requestLogin(account, password);
    await persistSession(session);

    await clearHttpCache();
    setCacheOwner(session.user.id);
    set({ user: session.user, status: 'signedIn' });
  },

  signUp: async (username, email, password) => {
    const session = await requestRegister(username, email, password);
    await persistSession(session);
    await clearHttpCache();
    setCacheOwner(session.user.id);
    set({ user: session.user, status: 'signedIn' });
  },

  signOut: async () => {
    await requestLogout();
    await clearSession();
    await clearHttpCache();
    setCacheOwner(null);
    set({ user: null, status: 'signedOut' });
  },

  applyUser: user => {
    set({ user });

    void saveCachedUser(user);


    invalidate('/user', '/users');
  },
}));


setSessionExpiredHandler(() => {

  setCacheOwner(null);
  void clearHttpCache();
  useAuthStore.setState({ user: null, status: 'signedOut' });
});

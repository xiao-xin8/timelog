/**
 * 本地存储键名
 *
 * 键名与旧项目 legacy/uniapp 完全一致，方便将来做数据迁移。
 * 新增键要加到这里，不要在业务代码里写裸字符串。
 */
export const STORAGE_KEYS = {

  EVENTS: 'countdown_events',

  CATEGORIES: 'custom_categories',

  AUTH_TOKEN: 'auth_token',

  AUTH_REFRESH_TOKEN: 'auth_refresh_token',

  USER_INFO: 'user_info',

  LAST_SYNC_TIME: 'last_sync_time',

  SYNC_SEQ: 'sync_seq',

  SYNC_PENDING: 'sync_pending',

  SYNC_OWNER: 'sync_owner',

  CHAT_LIST: 'chat_list',

  HTTP_CACHE: 'http_cache',

  SLIDESHOW_CONFIG: 'slideshowConfig',

  SKIPPED_VERSION: 'skipped_version',

  FORCE_UPDATE_INFO: 'force_update_info',

  SCREEN_ORIENTATION: 'app_screen_orientation',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

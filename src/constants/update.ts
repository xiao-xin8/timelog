/**
 * 应用内更新（Slice 17）的常量与开关
 *
 * 更新信息的来源是一个**纯静态**站点上的 `update.json`
 * （见仓库根目录的 `site/`，那个目录同时还是项目官网）。
 * 之所以不复用 `api/`：版本信息不需要鉴权、不需要动态计算，
 * 静态文件能吃到 CDN，而且"发版"这件事和业务后端解耦。
 */

/**
 * 官网 / 更新信息静态站地址
 *
 * ⚠️ **改这一处即可**，下面的 URL 都跟着走。
 */
export const UPDATE_SITE_URL = 'https://timelog.example.com';

/**
 * 备用地址：Cloudflare Pages 的默认域名
 *
 * 正式域名解析还没生效、或者哪天解析出问题时，更新检查还能从这儿拿到数据
 * —— 「发了新版却收不到提示」是最难排查的一类问题，多留一条命。
 * 平时用不上（主地址一成功就直接返回，不会多发请求）。
 */
export const UPDATE_SITE_FALLBACK_URL = 'https://your-site.pages.dev';

/** 更新信息文件（官网首页的下载按钮读的也是它） */
export const UPDATE_JSON_URL = `${UPDATE_SITE_URL}/update.json`;

/**
 * 按顺序尝试的更新信息地址：**正式域名 → Pages 备用域名**
 *
 * 只有前一个拿不到（DNS 没解析、404、超时、内容坏了）才会试下一个，
 * 所以正常情况下仍然只发一个请求。
 */
export const UPDATE_JSON_URLS: readonly string[] = [
  UPDATE_JSON_URL,
  `${UPDATE_SITE_FALLBACK_URL}/update.json`,
];

/**
 * 启动后延迟多久才去检查
 *
 * 不要一启动就查：会和首屏那几个请求抢带宽，而且用户根本还没看界面。
 * 失败一律静默（见 `services/update.ts`），绝不能因为它弹一个"更新失败"。
 */
export const UPDATE_CHECK_DELAY_MS = 3000;

/** 拉 update.json 的超时（它只是个几百字节的静态文件，8 秒足够了） */
export const UPDATE_FETCH_TIMEOUT_MS = 8000;



/** 调起系统安装器 */
export const ACTION_VIEW = 'android.intent.action.VIEW';

/** APK 的 MIME 类型 —— 不传这个，系统可能不会把安装器匹配出来 */
export const APK_MIME_TYPE = 'application/vnd.android.package-archive';

/**
 * `Intent.FLAG_GRANT_READ_URI_PERMISSION`
 *
 * 必须是裸数字：expo-intent-launcher 的 `flags` 只收位掩码，**不提供常量**
 * （核对过它 build 目录下的 `.d.ts`）。
 * 不加这个标志，安装器读不到我们那个 `content://` URI，会直接失败。
 */
export const FLAG_GRANT_READ_URI_PERMISSION = 0x00000001;

/**
 * 「安装未知应用」设置页
 *
 * Android 8 起，装外部 APK 必须由**发起安装的那个 App**声明权限，
 * 并且用户要为它单独打开"允许安装未知应用"。
 * 被拦下时把用户送到这个页面的**本应用那一项**（靠 data 里的 package: 前缀）。
 */
export const ACTION_MANAGE_UNKNOWN_APP_SOURCES = 'android.settings.MANAGE_UNKNOWN_APP_SOURCES';



/**
 * 强制走"有新版本"分支，用来在本地点验弹窗和整条下载安装链路。
 *
 * - `'off'`：正常（默认，发版必须是这个）
 * - `'normal'`：假装发现非强制更新
 * - `'force'`：假装发现强制更新
 *
 * 打开后**不会**真的去请求 update.json，直接用下面那个假的 APK 地址，
 * 所以能拿一个本地小文件（甚至一个几 KB 的假 apk）跑通"下载 → 进度 → 调起安装"。
 *
 * **发布前必须确认这里是 `'off'`。**
 */
export const DEV_FORCE_UPDATE: 'off' | 'normal' | 'force' = 'off';

/**
 * 开发用假 APK 地址
 *
 * 想验"下载 + 进度条 + 调起安装"，把它指向一个**手机能访问到**的地址：
 * 同局域网电脑上起的静态服务（`http://192.168.x.x:8000/test.apk`）最方便。
 *
 * ⚠️ 系统安装器会校验 APK 的包名与签名：拿一个**本项目签名的真 APK**
 * 最省事；随便找个别的 apk 也行，能弹出安装界面就说明链路通了
 * （最终会提示"应用未安装"之类的，属正常）。
 */
export const DEV_FAKE_APK_URL = '';

/**
 * 开发用假包的体积（字节）；0 = 弹窗上不显示体积那一行
 *
 * 只是为了让「安装包大小 xxx MB」那一行也能点到，
 * 填多少都不影响链路 —— 下载一开始就会被服务器返回的真实大小覆盖。
 */
export const DEV_FAKE_SIZE_BYTES = 0;

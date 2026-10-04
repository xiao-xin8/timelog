<div align="center">

<img src="assets/icon.png" width="100" alt="时光日志" />

# 时光日志 · TimeLog

**记录每一个重要时刻**

倒计时 · 时光日历 · 时光社区 · 私聊

### 官网 / 下载体验：<https://timelog.zhyhome.top>

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Android-3DDC84.svg)](#想自己跑起来)
[![Expo](https://img.shields.io/badge/Expo-57-000020.svg)](https://expo.dev)
[![React Native](https://img.shields.io/badge/React%20Native-0.86-61DAFB.svg)](https://reactnative.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6.svg)](https://www.typescriptlang.org)

[功能特性](#功能特性) · [自己跑起来](#想自己跑起来) · [常见问题](#常见问题) · [开源许可](#开源许可)

</div>

---

## 这是什么

一个**记录重要日子**的安卓 App。生日、纪念日、考试、旅行……记下来，
看它们还有多少天，也看已经过去了多久。

顺带带一点轻社交：可以把此刻的心情写成**故事**分享到社区，也可以和朋友**私聊**。

- **客户端和后端在一个包里**：本目录是客户端，`api/` 子目录是配套后端（Cloudflare Workers）。
- **数据本地优先**：不登录也能记、能看、能改、能删，离线完全可用。
- **不偷偷传数据**：没有后台轮询、没有埋点，联网只在你实际操作的时候发生。

## 功能特性

### ⏳ 倒数日（核心）

- 事件的**新增 / 编辑 / 删除**，删除有二次确认。
- 每个事件都能单独设置：
  - Emoji 图标、分类、**公历或农历**、目标日期与时间
  - 是否显示精确时间、是否显示秒
  - 字体颜色、背景颜色（跟随主题 / 预设 / 自己调）
  - **卡片尺寸：小 / 中 / 大**
  - **置顶（最多 3 个）**
  - 备注（最多 200 字，带字数计数）
  - **进度条**：设了起始时间，详情页就显示「已经过 X%」
- **分类**：7 个内置（生日 🎂 / 纪念日 💕 / 工作 💼 / 学习 📚 / 旅行 ✈️ / 节日 🎄 / 其他 📌），
  也能自己新建分类（可删；删掉后关联事件自动回到「其他」）。
- **首页**：三种卡片尺寸、置顶区排在最上面、按"离现在多近"排序、
  按分类筛选（带每类数量）、倒计时**每秒跳动**、长按卡片弹菜单、没有内容时有引导。
- **农历**：内置 1900–2100 的农历表，挑日期可以直接选农历（含闰月处理）。

### 📅 时光日历

- 6×7 的月历，每格显示公历 + 农历（初一会显示月名、节气当天显示节气名）。
- 每格最多 3 个彩色圆点，表示当天有事件；点某天就能看到当天的事件。
- 显示**本月 / 本年的进度百分比**，一键回到今天。

### 🖼 导出与放映

- **导出图片**：把倒数日卡片画成图片存进相册（权限被拒会引导去设置）。
- **全屏轮播播放器**：适合把手机放桌面上慢慢看。
  可设单张时长、过渡效果、排序、循环、显示哪些内容、字号、方向、自定义背景；
  播放时可以保持屏幕常亮、单击切换控件、滑动切换、双击暂停。

### ☁️ 账号与云同步

- **注册 / 登录**：密码强度校验、协议勾选；服务端用**短效访问令牌 + 长期刷新令牌**，
  密码以加盐哈希存储。
- **个人中心**：改昵称 / 简介 / 性别 / 生日 / 地区，换头像（内置头像，或自己上传）；
  还有设置、我的故事、退出登录。
- **云同步**：事件和分类做整体增量同步，**没有变化时不传输数据**；
  离线时的改动会排进队列，等联网了按顺序补传。

### 💌 时光社区（故事）

- **故事广场**：分页浏览、下拉刷新。
- **故事详情**：点赞、评论（分页）、**一键存为我的事件**、分享给好友；
  作者可以删自己的故事和评论。
- **发布**：挑一个自己的事件 + 写正文 + 最多 3 个标签。
- **我的故事**：多选批量删除。

### 💬 私聊

- **会话列表**：未读红点、按最后一条消息排序。
- **聊天室**：**WebSocket 实时收发**（消息秒到，不用刷新）、
  文本消息、**故事分享消息**、表情面板、清空聊天记录。
- **他人资料页**：点头像进主页，可以直接开聊。

### ✨ 一些体验上的讲究

- **接口缓存**：按数据变化快慢分档缓存，来回切页面不用重新加载；
  任何写操作都会立刻让相关缓存失效。
  聊天记录**刻意不缓存** —— 它带着「顺手把对方的消息标已读」的作用，缓存了对方就收不到已读。
- **页面请求精简**：会话列表、聊天室、故事详情各自只发一个请求。
- **应用内更新**：发现新版本后可以在 App 内下载（带进度条）并直接调起系统安装；
  下载或安装失败时，附送一个「用浏览器下载」的退路。
- **界面**：可爱萌系卡通风，四个标签页（时光日志 / 时光日历 / 时光社区 / 我的）；
  所有颜色和尺寸集中在 `src/theme/index.ts`，页面里不写死色值。

## 技术栈

| 层 | 选型 |
|---|---|
| 客户端 | **Expo 57** · React Native 0.86 · React 19 · **TypeScript**（严格模式） |
| 状态管理 | Zustand（一个领域一个 store） |
| 界面 | React Native Paper + react-navigation |
| 本地存储 | AsyncStorage |
| 后端 | **Cloudflare Workers** · D1（SQLite）· KV（头像）· Durable Objects（WebSocket 广播） |
| 认证 | 自实现 JWT（WebCrypto）+ PBKDF2 密码哈希，**零运行时依赖** |

## 想自己跑起来

> 装依赖、起服务、打包这些都是 Expo / Cloudflare 的标准流程，照着各自的文档做就行，这里不重复。
> 下面只列**必须改的地方**和**大家都会踩的坑**。
>
> 接口清单、响应格式、认证模型在 [`api/README.md`](api/README.md)。

### 必须改的地方（客户端和后端都要改，别只改一边）

| 文件 | 改成 |
|---|---|
| `src/services/config.ts` → `API_BASE_URL` | 你自己的后端地址（全 App 只有这一处写域名） |
| `src/constants/update.ts` → `UPDATE_SITE_URL` | 放 `update.json` 的静态站地址 |
| `src/constants/update.ts` → `UPDATE_SITE_FALLBACK_URL` | 备用地址；没有就把 `UPDATE_JSON_URLS` 里那一项删掉 |
| `src/constants/index.ts` → `COMPANY_NAME` | 版权行上显示的主体名 |
| `src/constants/legal.ts` → 邮箱（2 处） | 你的联系邮箱 |
| `app.json` → `android.package` | **你自己的包名** |
| `api/wrangler.toml` | 你自己创建的 D1 / KV 资源 id，以及 Worker 名字 |
| `JWT_SECRET` | 用 `wrangler secret put` 写入（**不要写进 wrangler.toml**） |

> 官网页面上那个「下载」按钮和 App 的「检查更新」读的是同一个 `update.json`，
> 所以改版本只需要改那一个文件。

### 几个常见的坑

- **后端 · 建 KV 那一步不能漏**。`wrangler.toml` 里声明了头像用的 KV，
  但光声明没用，还得 `wrangler kv namespace create AVATARS` 拿到 id 填进去 —— 漏了 `deploy` 会直接失败。
- **后端 · 本地库改表结构后要重建**。本地建表走的是 `CREATE TABLE IF NOT EXISTS`，
  **表已存在时不会补新列**。改过 `schema.sql` 的列之后，把 `.wrangler/state/v3/d1` 删掉再重建，
  否则会报莫名其妙的 `no such column`。
- **打包 · `prebuild` 会覆盖手改过的东西**。`android/` 是生成出来的，
  重跑 `npx expo prebuild` 会把它下面你改过的启动图、图标、签名配置冲掉。
  想长期保留的改动，写成 config plugin 更稳。
- **打包 · 签名会静默失效**。Gradle 读的是 **`$GRADLE_USER_HOME/gradle.properties`**，
  不是「用户目录/.gradle」。如果你的机器设了 `GRADLE_USER_HOME`，签名口令放错地方时
  Gradle **不会报错**，只会退回 debug 签名（日志里只有一行不起眼的 warning）——
  正式包打出来记得确认一下用的哪个签名。
- **`api/` 在客户端目录下，会影响类型检查**。客户端的 `tsc` 会顺着目录把后端代码也编进来，
  所以 `tsconfig.json` 里显式排除了 `api`。如果你动了目录结构，记得同步这个排除项。
- **应用内更新要自己兜住**。`apkUrl` 留空 = 不提示更新（安全默认）；
  `versionCode` 必须**大于**用户装的包才提示。⚠️ 更新地址必须是**你自己控制的**，
  否则等于把「安装应用」的权限交给别人。
- **别把密钥提交进仓库**。`*.keystore`（签名密钥，泄露=别人能冒名发你的更新）、
  `.dev.vars`（本地密钥）都别提交；`.gitignore` 已经挡住了大部分，别用 `-f` 绕过去。

### 应用内更新的 `update.json`

放在 `UPDATE_SITE_URL/update.json`，大概长这样：

```json
{
  "schemaVersion": 1,
  "enabled": true,
  "version": "0.2.0",
  "versionCode": 2,
  "minVersionCode": 1,
  "forceUpdate": false,
  "updateContent": "1. 修了 xxx",
  "apkUrl": "https://你的对象存储/timelog-0.2.0.apk",
  "sizeBytes": 41234567,
  "sha256": "",
  "publishedAt": "2026-10-20"
}
```

- `enabled: false` 是**一键关掉所有更新提示**的开关（发版出事时先改它）。
- `minVersionCode` 用来强制太老的版本升级；`forceUpdate` 是临时强推。
- APK 建议放对象存储，别塞进 Pages 站点（单文件有大小上限）。
- 字段语义在 `src/constants/update.ts` 和 `src/utils/update.ts` 的注释里写得很细。

## 目录结构

```
.                            客户端（本目录）
├── src/
│   ├── screens/             页面：首页 / 日历 / 社区 / 我的 / 事件增删改查 / 故事 / 聊天…
│   ├── store/               Zustand：事件 / 分类 / 账号 / 同步 / 轮播 / 更新
│   ├── services/            接口层：api / story / chat / sync / 缓存 / 更新 / 安装
│   ├── utils/               纯逻辑：倒计时 / 农历 / 事件 / 同步队列 / 缓存策略 / 更新判定
│   ├── constants/           常量：分类 / 表情 / 主题键名 / 协议正文 / 更新配置
│   ├── components/          公共组件
│   ├── navigation/          导航（底部 4 个标签 + 原生栈）
│   ├── theme/               颜色与尺寸（页面里不写死色值）
│   └── types/               类型定义
├── assets/                  应用图标与启动图
└── api/                     后端（Cloudflare Workers）
    ├── src/                 路由 / 数据库访问 / 中间件 / 工具
    ├── schema.sql           建表语句
    ├── .dev.vars.example    本地密钥模板
    └── README.md            接口清单、认证模型与设计取舍
```

`android/`、`ios/` 不在包里，由 `npx expo prebuild` 现场生成。

## 常见问题

**为什么没有 `android/`、`ios/` 目录？**
它们是 Expo 现场生成的，不入库 —— 这样能避免一堆生成物和手工补丁混在一起。

**应用内更新点了没反应？**
依次看：① `update.json` 的 `versionCode` 是不是比当前安装包大；② `apkUrl` 填了没有；
③ 手机有没有允许本应用「安装未知应用」；④ 更新地址能不能访问（App 会先试主地址、失败再试备用地址）。

**官网和这个仓库是什么关系？**
<https://timelog.zhyhome.top> 是作者自己维护的线上实例（可以直接下载体验）。
这份代码是它的源头；你自己部署时，请把配置全改成你自己的地址。

**只能跑安卓吗？**
代码本身是跨平台的，但本项目**只在安卓上开发和验证过**，文档也只写安卓。

**数据存在哪？**
本地存在手机里；登录后同步到你自己的后端。后端用的是你自己的 Cloudflare 账号，数据完全归你。

## 开源许可

[MIT](LICENSE) © 2026 xiaoxin

可以在保留版权声明的前提下自由使用、修改、分发本项目，包括商用。
本项目按「原样」提供，不附带任何担保。

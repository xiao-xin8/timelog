/**
 * 路由类型
 *
 * RootStack 是外层栈（承载四个 tab + 各种二级页面），
 * 具体有哪些二级页面会随着分片推进逐步加进来。
 */

export type RootStackParamList = {
  /** 底部四个 tab 的容器 */
  Tabs: undefined;
  /** 新增 / 编辑事件；带 id 即为编辑模式 */
  AddEvent: { id?: string } | undefined;
  /** 事件详情，带事件 id */
  EventDetail: { id: string };
  /** 导出图片，带事件 id */
  Export: { id: string };
  /** 登录 / 注册 */
  Login: undefined;
  /** 编辑资料 */
  EditProfile: undefined;
  /** 设置 */
  Settings: undefined;
  /** 关于 */
  About: undefined;
  /**
   * 故事列表
   *
   * 不带参数 = 广场（所有人的）；`userOnly: true` = 我的故事。
   * 两者是同一个页面，只有标题和空态文案不同。
   */
  StoryList: { userOnly?: boolean } | undefined;
  /** 故事详情，带故事 id */
  StoryDetail: { id: string };
  /** 发布故事 */
  StoryPublish: undefined;

  /** 会话列表（时光信笺） */
  ChatList: undefined;
  /** 聊天室，带对方 userId */
  ChatRoom: { userId: string };
  /** 看他人资料，带目标 userId */
  UserProfile: { id: string };

  /** 轮播放映设置（首页 ▶ 的入口） */
  SlideshowSettings: undefined;
  /** 全屏放映播放器 */
  SlideshowPlayer: undefined;
};

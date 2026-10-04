import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons as MaterialDesignIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, List, Text, TextInput } from 'react-native-paper';

import BottomSheet from '../components/BottomSheet';
import CountdownCard from '../components/CountdownCard';
import FloatingBar, { FloatingButton } from '../components/FloatingBar';
import UserAvatar from '../components/UserAvatar';
import { useFeedback } from '../components/feedback';
import { TOP_CONTENT_GAP } from '../navigation/layout';
import type { RootStackParamList } from '../navigation/types';
import { ApiError } from '../services/api';
import {
  addComment,
  deleteComment,
  deleteStory,
  fetchComments,
  fetchStoryDetail,
  markStoryListDirty,
  toggleStoryLike,
} from '../services/story';
import { fetchUsers, sendMessage } from '../services/chat';
import type { AuthUser } from '../services/api';
import { useAuthStore } from '../store/useAuthStore';
import { useEventStore } from '../store/useEventStore';
import { inputTheme, palette, radius, spacing } from '../theme';
import {
  STORY_COMMENT_MAX,
  STORY_COMMENT_PAGE_SIZE,
  type StoryAuthor,
  type StoryComment,
  type StoryItem,
} from '../types/story';
import { buildEventFromSnapshot, normalizeSnapshot } from '../utils/story';
import { formatRelativeTime } from '../utils/time';

/**
 * 故事详情（Slice 11c）
 *
 * 故事模块里交互最多的一页：倒计时卡、点赞（乐观更新）、评论分页、
 * 「存为我的事件」、作者才能看到删除。
 *
 * ## 倒计时为什么自己开定时器
 *
 * 故事里存的是**事件快照**，不是实时事件，所以**每分钟**刷一次就够
 * （首页才需要每秒）。但 `useTick` 是**单例**定时器 —— 第一个订阅者的
 * 间隔决定一切，首页按 1000ms 占着它，这里传 60000 不会生效。
 *
 * 为一个页面去改公共 hook、把首页的每秒刷新搞坏不划算，所以这里自己开。
 */

type Navigation = NativeStackNavigationProp<RootStackParamList>;
type StoryDetailRoute = RouteProp<RootStackParamList, 'StoryDetail'>;

/**
 * 底部评论输入条的高度（列表要按它留白，否则最后一段会被压住）
 *
 * 76 = dense 输入框带 label 之后的高度（约 52）+ 上下留白。
 * 原来是 64 —— 那是还没加 label 时的值。
 */
const INPUT_BAR_HEIGHT = 76;

/** 作者显示名：昵称优先，没有就用用户名（和头像上的首字母同一套逻辑） */
function displayName(author: StoryAuthor): string {
  return author.nickname?.trim() || author.username;
}

export default function StoryDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Navigation>();
  const { params } = useRoute<StoryDetailRoute>();
  const { toast, confirm } = useFeedback();

  const storyId = params.id;
  const me = useAuthStore(state => state.user);
  const signedIn = useAuthStore(state => state.status === 'signedIn');

  const [story, setStory] = useState<StoryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(0);
  const [liking, setLiking] = useState(false);

  const [comments, setComments] = useState<StoryComment[]>([]);
  const [commentCount, setCommentCount] = useState(0);
  const [commentPage, setCommentPage] = useState(0);
  const [commentsHasMore, setCommentsHasMore] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  /** 长按选中的评论（非 null 时弹删除菜单） */
  const [commentMenu, setCommentMenu] = useState<StoryComment | null>(null);


  const [shareOpen, setShareOpen] = useState(false);
  const [friends, setFriends] = useState<AuthUser[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  /** 正在往谁那边发（防连点发两条） */
  const [sharingTo, setSharingTo] = useState<string | null>(null);


  const [, setClock] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setClock(value => value + 1), 60_000);
    return () => clearInterval(timer);
  }, []);



  /**
   * 首屏加载：**故事本体 + 第一页评论**一起来（Slice 16 合并接口）。
   *
   * 合并前这里是两个独立的 useEffect（一个拉详情、一个拉评论第一页），
   * 各自 setState、谁先回来不确定。
   *
   * `force` 绕开接口缓存（重试时用）。
   */
  const loadStory = useCallback(
    async (force = false) => {
      setLoading(true);
      try {
        const data = await fetchStoryDetail(storyId, {
          pageSize: STORY_COMMENT_PAGE_SIZE,
          force,
        });

        setStory(data.story);
        setLiked(data.story.liked);
        setLikes(data.story.likes);
        setCommentCount(data.story.comments);

        setComments(data.comments);
        setCommentsHasMore(data.hasMore);
        setCommentPage(1);

        setError(null);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : '加载失败，请稍后重试');
      } finally {
        setLoading(false);
      }
    },
    [storyId],
  );

  useEffect(() => {
    void loadStory();
  }, [loadStory]);

  /**
   * 评论**翻页**用（第一页已经跟着首屏一起回来了）。
   *
   * 走的是原来那条 `GET /stories/:id/comments` —— 分页语义单一，
   * 没必要为它再开一个合并接口。
   */
  const loadComments = useCallback(
    async (page: number, append: boolean) => {
      setCommentsLoading(true);
      try {
        const result = await fetchComments(storyId, { page, pageSize: STORY_COMMENT_PAGE_SIZE });
        setComments(prev => (append ? [...prev, ...result.comments] : result.comments));
        setCommentsHasMore(result.hasMore);
        setCommentPage(page);
      } catch {

        toast('评论加载失败，请稍后重试');
      } finally {
        setCommentsLoading(false);
      }
    },
    [storyId, toast],
  );



  /**
   * 点赞（乐观更新）
   *
   * 点下去立刻变红，同时发请求；**成功后再用服务端的数字校准一次** ——
   * 本地那两个数字是猜的，如果别的设备同时操作过，以服务端为准。
   * 失败则回滚到点击前。
   */
  const handleLike = useCallback(async () => {
    if (!signedIn) {
      toast('请先登录');
      return;
    }
    if (liking) return;

    const previous = { liked, likes };
    const nextLiked = !liked;

    setLiked(nextLiked);
    setLikes(Math.max(0, likes + (nextLiked ? 1 : -1)));
    setLiking(true);

    try {
      const result = await toggleStoryLike(storyId);
      setLiked(result.liked);
      setLikes(result.likes);

      markStoryListDirty();
    } catch (err) {
      setLiked(previous.liked);
      setLikes(previous.likes);
      toast(err instanceof ApiError ? err.message : '操作失败，请稍后重试');
    } finally {
      setLiking(false);
    }
  }, [liked, likes, liking, signedIn, storyId, toast]);

  const handleSend = useCallback(async () => {
    const content = draft.trim();
    if (!content || sending) return;

    if (!signedIn) {
      toast('请先登录');
      return;
    }

    setSending(true);
    try {
      const comment = await addComment(storyId, content);

      setComments(prev => [comment, ...prev]);
      setCommentCount(count => count + 1);
      setDraft('');
      markStoryListDirty();
    } catch (err) {

      toast(err instanceof ApiError ? err.message : '评论发送失败，请稍后重试');
    } finally {
      setSending(false);
    }
  }, [draft, sending, signedIn, storyId, toast]);

  /**
   * 存为我的事件
   *
   * 写盘、排同步队列都是 `add()` 自己做的事 —— 这里**不要**再碰任何同步接口，
   * 否则会绕过防抖、一条一次请求。字段规则在 `utils/story.ts` 里（有测试盯着）。
   */
  const handleSaveEvent = useCallback(async () => {
    if (!story) return;

    const title = story.event?.title ?? '这个事件';
    const ok = await confirm({
      title: '保存为我的事件',
      message: `确定要将「${title}」保存为自己的事件吗？`,
      confirmText: '保存',
    });
    if (!ok) return;

    const newEvent = buildEventFromSnapshot(story.event ?? {}, story.id, story.content);
    if (!newEvent) {
      toast('这条故事没带可用的日期，存不了');
      return;
    }

    const result = await useEventStore.getState().add(newEvent);
    toast(result.ok ? '已保存到我的事件' : result.reason);

    /*
     * 存完**留在当前页**：用户可能还想看评论，或者再确认一眼。
     * 自动返回会让人以为"点错了"，而且回不去。
     */
  }, [story, confirm, toast]);

  const handleDelete = useCallback(async () => {
    const ok = await confirm({
      title: '删除故事',
      message: '确定要删除这条时光故事吗？删除后无法恢复。',
      confirmText: '删除',
    });
    if (!ok) return;

    try {
      await deleteStory(storyId);
      markStoryListDirty();
      toast('已删除');
      navigation.goBack();
    } catch (err) {

      toast(err instanceof ApiError ? err.message : '删除失败，请稍后重试');
    }
  }, [storyId, confirm, toast, navigation]);

  /**
   * 长按评论弹删除菜单。
   *
   * **只对自己的评论响应** —— 别人的长按没反应，和「我的故事」长按删故事是同一套语义
   * （同一个 App 里"长按弹菜单"只该有一个含义）。
   */
  const handleCommentLongPress = useCallback(
    (comment: StoryComment) => {
      if (!me || comment.author.id !== me.id) return;
      setCommentMenu(comment);
    },
    [me],
  );

  const handleDeleteComment = useCallback(
    async (comment: StoryComment) => {
      setCommentMenu(null);

      const ok = await confirm({
        title: '删除评论',
        message: '确定要删除这条评论吗？删除后无法恢复。',
        confirmText: '删除',
      });
      if (!ok) return;

      try {
        const latest = await deleteComment(comment.id);
        setComments(prev => prev.filter(item => item.id !== comment.id));

        setCommentCount(latest);
        markStoryListDirty();
        toast('已删除');
      } catch (err) {
        toast(err instanceof ApiError ? err.message : '删除失败，请稍后重试');
      }
    },
    [confirm, toast],
  );



  /**
   * 打开分享面板。
   *
   * 好友列表在打开**之前**拉好 —— 先开面板再拉会闪一下空列表。
   */
  const openShare = useCallback(async () => {
    setShareOpen(true);
    setFriendsLoading(true);

    try {
      setFriends(await fetchUsers());
    } catch (err) {
      setShareOpen(false);
      toast(err instanceof ApiError ? err.message : '好友列表加载失败');
    } finally {
      setFriendsLoading(false);
    }
  }, [toast]);

  /**
   * 把这条故事发给某个好友。
   *
   * 消息体（`storyId` / `title` / `icon`）是和聊天室**约定死的格式** ——
   * 对方点开就是这条故事的详情。服务端不解析这个 JSON，原样存原样推。
   */
  const handleShare = useCallback(
    async (friend: AuthUser) => {
      if (!story || sharingTo) return;

      setSharingTo(friend.id);
      try {
        await sendMessage({
          targetUserId: friend.id,
          content: JSON.stringify({
            storyId: story.id,
            title: story.event?.title ?? '一个故事',
            icon: story.event?.icon ?? '📖',
          }),
          type: 'story',
        });

        setShareOpen(false);
        toast(`已分享给 ${friend.nickname?.trim() || friend.username}`);
      } catch (err) {
        toast(err instanceof ApiError ? err.message : '分享失败，请稍后重试');
      } finally {
        setSharingTo(null);
      }
    },
    [story, sharingTo, toast],
  );

  const goBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('Tabs');
  }, [navigation]);

  const backBar = (
    <FloatingBar left={<FloatingButton icon="arrow-left" onPress={goBack} accessibilityLabel="返回" />} />
  );



  if (loading) {
    return (
      <View style={styles.root}>
        <View style={styles.center}>
          <ActivityIndicator color={palette.peach} />
        </View>
        {backBar}
      </View>
    );
  }

  if (error || !story) {
    return (
      <View style={styles.root}>
        <View style={styles.center}>
          <MaterialDesignIcons name="cloud-off-outline" size={56} color={palette.mauve} />
          <Text variant="titleMedium" style={styles.noticeTitle}>
            没能加载出来
          </Text>
          <Text variant="bodySmall" style={styles.noticeDesc}>
            {error ?? '这条故事不存在或已被删除'}
          </Text>
          <Button
            mode="contained"
            onPress={() => void loadStory(true)}
            style={styles.noticeButton}
            contentStyle={styles.noticeButtonInner}
          >
            重试
          </Button>
        </View>
        {backBar}
      </View>
    );
  }


  const snapshotEvent = normalizeSnapshot(story.event ?? {});

  const isAuthor = Boolean(me && me.id === story.author.id);

  /** 当前这页评论里有没有我自己发的（决定要不要提示"长按可删"） */
  const hasOwnComment = comments.some(comment => me != null && comment.author.id === me.id);

  return (
    <View style={styles.root}>
      {/*
        头部：返回按钮 + 作者信息**并排一行**。

        原来返回是个悬浮圆钮、作者单独占一行，两者一上一下各占一行，
        中间还空着一截。合成一行之后顶部只有一条，紧凑也好认。
        这一行固定不动，内容从它下面开始滚。
      */}
      <View style={[styles.header, { paddingTop: insets.top + TOP_CONTENT_GAP }]}>
        <FloatingButton icon="arrow-left" onPress={goBack} accessibilityLabel="返回" />
        <UserAvatar user={story.author} size={40} />
        <View style={styles.headerText}>
          <Text variant="bodyMedium" style={styles.authorName} numberOfLines={1}>
            {displayName(story.author)}
          </Text>
          <Text variant="bodySmall" style={styles.time}>
            {formatRelativeTime(story.createTime)}
          </Text>
        </View>

        <FloatingButton
          icon="share-outline"
          onPress={() => void openShare()}
          accessibilityLabel="分享给好友"
        />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {


            paddingBottom: insets.bottom + INPUT_BAR_HEIGHT + spacing.xxl,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/*
          1. 关联事件：直接用首页 / 事件详情页那张大卡

          和首页保持同一套视觉，用户一眼认得。故事里存的是快照，
          已经过 `normalizeSnapshot` 补齐字段，`CountdownCard` 拿到的是完整 `EventItem`。
        */}
        {snapshotEvent ? <CountdownCard event={snapshotEvent} withShadow /> : null}

        {/* 2. 正文 */}
        <Text variant="bodyLarge" style={styles.storyContent}>
          {story.content}
        </Text>

        {/* 3. 标签 */}
        {story.tags.length > 0 ? (
          <View style={styles.tagRow}>
            {story.tags.map(tag => (
              <Text key={tag} variant="bodySmall" style={styles.tag}>
                #{tag}
              </Text>
            ))}
          </View>
        ) : null}

        {/* 4. 点赞 / 评论数 */}
        <View style={styles.actionBar}>
          <Pressable
            onPress={handleLike}
            disabled={liking}
            hitSlop={8}
            style={styles.actionButton}
            accessibilityLabel={liked ? '取消点赞' : '点赞'}
          >
            <MaterialDesignIcons
              name={liked ? 'heart' : 'heart-outline'}
              size={22}
              color={liked ? palette.peachDeep : palette.mauve}
            />
            <Text variant="bodyMedium" style={[styles.actionText, liked && styles.actionTextActive]}>
              {likes}
            </Text>
          </Pressable>

          <View style={styles.actionButton}>
            <MaterialDesignIcons name="comment-outline" size={20} color={palette.mauve} />
            <Text variant="bodyMedium" style={styles.actionText}>
              {commentCount}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* 5. 评论 */}
        <View style={styles.sectionHeader}>
          <Text variant="titleSmall" style={styles.sectionTitle}>
            评论
          </Text>
          {/* 只有"这页里确实有我自己的评论"时才提这一句，否则白占地方 */}
          {hasOwnComment ? (
            <Text variant="bodySmall" style={styles.sectionHint}>
              长按自己的评论可删除
            </Text>
          ) : null}
        </View>

        {comments.length === 0 ? (

          <Text variant="bodySmall" style={styles.emptyComments}>
            暂无评论，快来抢沙发吧~
          </Text>
        ) : (
          comments.map(comment => (
            <Pressable
              key={comment.id}
              style={styles.commentRow}

              onLongPress={
                me && comment.author.id === me.id ? () => handleCommentLongPress(comment) : undefined
              }
            >
              <UserAvatar user={comment.author} size={32} />
              <View style={styles.commentBody}>
                <Text variant="bodySmall" style={styles.commentAuthor}>
                  {displayName(comment.author)}
                </Text>
                <Text variant="bodyMedium" style={styles.commentText}>
                  {comment.content}
                </Text>
                <Text variant="bodySmall" style={styles.commentTime}>
                  {formatRelativeTime(comment.createTime)}
                </Text>
              </View>
            </Pressable>
          ))
        )}

        {commentsHasMore ? (
          <Pressable
            onPress={() => void loadComments(commentPage + 1, true)}
            disabled={commentsLoading}
            style={styles.loadMore}
          >
            {commentsLoading ? (
              <ActivityIndicator size="small" color={palette.peach} />
            ) : (
              <Text variant="bodySmall" style={styles.loadMoreText}>
                加载更多评论
              </Text>
            )}
          </Pressable>
        ) : null}

        {/* 6. 底部操作 */}
        <View style={styles.footerActions}>
          <Button
            mode="contained"
            onPress={handleSaveEvent}
            disabled={!snapshotEvent}
            style={styles.footerButton}
            contentStyle={styles.footerButtonInner}
          >
            存为我的事件
          </Button>

          {/* 非作者**完全不显示**删除入口（旧版就是这样，不是置灰） */}
          {isAuthor ? (
            <Button
              mode="outlined"
              onPress={handleDelete}
              textColor={palette.danger}
              style={styles.footerButton}
              contentStyle={styles.footerButtonInner}
            >
              删除
            </Button>
          ) : null}
        </View>
      </ScrollView>

      {/* 评论输入条：固定在底部 */}
      <View style={[styles.inputBar, { paddingBottom: insets.bottom + spacing.sm }]}>
        <TextInput
          mode="outlined"
          dense

          label="写评论"
          placeholder={signedIn ? '说点什么…' : '登录后可以评论'}
          value={draft}
          onChangeText={setDraft}
          maxLength={STORY_COMMENT_MAX}
          disabled={sending || !signedIn}
          style={styles.input}
          theme={inputTheme}
        />
        <Button
          mode="contained"
          onPress={handleSend}
          disabled={sending || !draft.trim()}
          style={styles.sendButton}
          contentStyle={styles.sendButtonInner}
        >
          发送
        </Button>
      </View>

      {/* 长按评论的删除菜单（只有自己的评论能弹出来） */}
      <BottomSheet
        visible={commentMenu !== null}
        title="管理评论"
        onDismiss={() => setCommentMenu(null)}
        heightRatio={0.28}
      >
        <List.Item
          title="删除评论"
          titleStyle={styles.dangerText}
          left={props => <List.Icon {...props} icon="trash-can-outline" color={palette.danger} />}
          onPress={() => commentMenu && void handleDeleteComment(commentMenu)}
        />
      </BottomSheet>

      {/* 分享给好友（13d） */}
      <BottomSheet
        visible={shareOpen}
        title="分享给好友"
        onDismiss={() => setShareOpen(false)}
        heightRatio={0.6}
      >
        {friendsLoading ? (
          <View style={styles.shareLoading}>
            <ActivityIndicator color={palette.peach} />
          </View>
        ) : friends.length === 0 ? (
          <Text variant="bodySmall" style={styles.shareEmpty}>
            还没有其他用户可以分享
          </Text>
        ) : (
          <FlatList
            data={friends}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.friendList}
            renderItem={({ item }) => (

              <Pressable
                onPress={() => void handleShare(item)}
                disabled={sharingTo !== null}
                android_ripple={{ color: palette.peachLine20 }}
                style={styles.friendRow}
              >
                <UserAvatar user={item} size={40} />
                <View style={styles.friendBody}>
                  <Text variant="bodyMedium" style={styles.friendName} numberOfLines={1}>
                    {item.nickname?.trim() || item.username}
                  </Text>
                  <Text variant="bodySmall" style={styles.friendUsername}>
                    @{item.username}
                  </Text>
                </View>
                {sharingTo === item.id ? <ActivityIndicator color={palette.peach} /> : null}
              </Pressable>
            )}
          />
        )}
      </BottomSheet>

      {/* 这里**不能**再挂 `backBar` —— 顶部那行头部里已经有返回按钮了，
          加了会变成两个返回键并排（踩过一次）。 */}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  noticeTitle: {
    color: palette.cocoa,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  noticeDesc: {
    color: palette.cocoaFaint,
    textAlign: 'center',
  },
  noticeButton: {
    marginTop: spacing.md,
    borderRadius: radius.md,
  },
  noticeButtonInner: {
    height: 44,
    paddingHorizontal: spacing.lg,
  },


  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  authorName: {
    color: palette.cocoa,
    fontWeight: '600',
  },
  time: {
    color: palette.cocoaFaint,
  },


  storyContent: {
    color: palette.cocoaSoft,
    lineHeight: 24,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  tag: {
    color: palette.mauve,
  },


  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
    paddingTop: spacing.xs,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  actionText: {
    color: palette.cocoaFaint,
  },
  actionTextActive: {
    color: palette.peachDeep,
    fontWeight: '700',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.peachLine20,
  },


  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sectionTitle: {
    color: palette.cocoa,
    fontWeight: '700',
  },
  sectionHint: {
    color: palette.mauveLight,
  },
  dangerText: {
    color: palette.danger,
  },
  shareLoading: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  shareEmpty: {
    color: palette.cocoaFaint,
    textAlign: 'center',
    paddingVertical: spacing.xxl,
  },
  friendList: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: palette.peachLine20,
  },
  friendBody: {
    flex: 1,
    gap: 2,
  },
  friendName: {
    color: palette.cocoa,
    fontWeight: '600',
  },
  friendUsername: {
    color: palette.cocoaFaint,
  },
  emptyComments: {
    color: palette.cocoaFaint,
    paddingVertical: spacing.md,
  },
  commentRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  commentBody: {
    flex: 1,
    gap: 2,
  },
  commentAuthor: {
    color: palette.cocoa,
    fontWeight: '600',
  },
  commentText: {
    color: palette.cocoaSoft,
  },
  commentTime: {
    color: palette.mauveLight,
  },
  loadMore: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  loadMoreText: {
    color: palette.peachDeep,
    fontWeight: '600',
  },


  footerActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  footerButton: {
    flex: 1,
    borderRadius: radius.md,
  },
  footerButtonInner: {
    height: 44,
  },


  inputBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.peachLine20,
  },
  input: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  sendButton: {
    borderRadius: radius.md,
  },
  sendButtonInner: {
    height: 40,
    paddingHorizontal: spacing.md,
  },
});

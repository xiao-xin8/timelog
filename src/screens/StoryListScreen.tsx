import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { MaterialCommunityIcons as MaterialDesignIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, FAB, List, Text } from 'react-native-paper';

import BottomSheet from '../components/BottomSheet';
import FloatingBar, { FloatingButton } from '../components/FloatingBar';
import UserAvatar from '../components/UserAvatar';
import { useFeedback } from '../components/feedback';
import { FAB_SIZE, FLOATING_CLEARANCE, FLOATING_MARGIN } from '../navigation/layout';
import type { RootStackParamList } from '../navigation/types';
import { ApiError } from '../services/api';
import { consumeStoryListDirty, deleteStory, fetchStories } from '../services/story';
import { useAuthStore } from '../store/useAuthStore';
import { palette, radius, spacing } from '../theme';
import { STORY_PAGE_SIZE, type StoryItem } from '../types/story';
import { formatRelativeTime } from '../utils/time';

/**
 * 故事列表（Slice 11b）
 *
 * **一个页面承担两种模式**，靠路由参数区分（旧版也是这么做的）：
 *   - 不带参数            → 广场（所有人的故事）
 *   - `userOnly: true`   → 我的故事
 *
 * 两种模式只有**数据源**不同，其余逻辑一模一样，所以没必要写两个组件。
 *
 * ⚠️ 顶上那个「时光故事 / 我的故事」大标题**已经去掉**，两种模式都不显示 ——
 * 卡片本身的信息已经够全，标题只是白占一行。
 */

type Navigation = NativeStackNavigationProp<RootStackParamList>;
type StoryListRoute = RouteProp<RootStackParamList, 'StoryList'>;



function StoryCard({
  story,
  onPress,
  onLongPress,
}: {
  story: StoryItem;
  onPress(): void;
  /** 长按弹管理菜单（只有「我的故事」会传，广场不传） */
  onLongPress?(): void;
}) {
  const event = story.event;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      android_ripple={{ color: palette.peachLine20 }}
      style={styles.card}
    >
      <View style={styles.cardHeader}>
        <UserAvatar user={story.author} size={36} />
        <View style={styles.authorBlock}>
          <Text variant="bodyMedium" style={styles.authorName} numberOfLines={1}>
            {story.author.nickname?.trim() || story.author.username}
          </Text>
          <Text variant="bodySmall" style={styles.time}>
            {formatRelativeTime(story.createTime)}
          </Text>
        </View>
      </View>

      <Text variant="bodyMedium" style={styles.content} numberOfLines={3}>
        {story.content}
      </Text>

      {/* 故事带的那颗事件（快照，不是引用） */}
      {event?.title ? (
        <View style={styles.eventChip}>
          <Text style={styles.eventIcon}>{event.icon || '📅'}</Text>
          <Text variant="bodySmall" style={styles.eventTitle} numberOfLines={1}>
            {event.title}
          </Text>
        </View>
      ) : null}

      {story.tags.length > 0 ? (
        <View style={styles.tagRow}>
          {story.tags.map(tag => (
            <Text key={tag} variant="bodySmall" style={styles.tag}>
              #{tag}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.metrics}>
        <View style={styles.metric}>
          <MaterialDesignIcons
            name={story.liked ? 'heart' : 'heart-outline'}
            size={16}
            color={story.liked ? palette.peachDeep : palette.mauve}
          />
          <Text variant="bodySmall" style={styles.metricText}>
            {story.likes}
          </Text>
        </View>
        <View style={styles.metric}>
          <MaterialDesignIcons name="comment-outline" size={16} color={palette.mauve} />
          <Text variant="bodySmall" style={styles.metricText}>
            {story.comments}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}



interface NoticeProps {
  icon: React.ComponentProps<typeof MaterialDesignIcons>['name'];
  title: string;
  description: string;
  actionText?: string;
  onAction?(): void;
}

/** 空态 / 未登录 / 出错，共用同一个版式 */
function Notice({ icon, title, description, actionText, onAction }: NoticeProps) {
  return (
    <View style={styles.notice}>
      <MaterialDesignIcons name={icon} size={56} color={palette.mauve} />
      <Text variant="titleMedium" style={styles.noticeTitle}>
        {title}
      </Text>
      <Text variant="bodySmall" style={styles.noticeDesc}>
        {description}
      </Text>
      {actionText && onAction ? (
        <Button mode="contained" onPress={onAction} style={styles.noticeButton} contentStyle={styles.noticeButtonInner}>
          {actionText}
        </Button>
      ) : null}
    </View>
  );
}



export default function StoryListScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Navigation>();
  const { params } = useRoute<StoryListRoute>();
  const { toast, confirm } = useFeedback();

  const userOnly = params?.userOnly ?? false;
  const signedIn = useAuthStore(state => state.status === 'signedIn');

  const [stories, setStories] = useState<StoryItem[]>([]);
  const [hasMore, setHasMore] = useState(true);
  /** 已经加载到第几页（下一页就是它 + 1） */
  const [loadedPage, setLoadedPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 长按选中的故事（非 null 时弹管理菜单） */
  const [menuTarget, setMenuTarget] = useState<StoryItem | null>(null);

  /**
   * 防重入。
   *
   * `FlatList` 的 `onEndReached` 在快速滚动时会连着触发好几次，
   * 没这个锁的话同一个 page 会被请求好几遍（还可能把重复数据拼进列表）。
   */
  const busy = useRef(false);

  const goBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('Tabs');
  }, [navigation]);

  const load = useCallback(

    async (page: number, mode: 'reset' | 'append', force = false) => {
      if (busy.current) return;
      busy.current = true;

      try {
        const result = await fetchStories({ page, pageSize: STORY_PAGE_SIZE, userOnly, force });

        setStories(prev => (mode === 'reset' ? result.stories : [...prev, ...result.stories]));
        setHasMore(result.hasMore);
        setLoadedPage(page);
        setError(null);
      } catch (err) {

        setError(err instanceof ApiError ? err.message : '加载失败，请稍后重试');
      } finally {
        busy.current = false;
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [userOnly],
  );


  useEffect(() => {
    if (!signedIn) {
      setLoading(false);
      return;
    }
    void load(1, 'reset');
  }, [signedIn, load]);


  useFocusEffect(
    useCallback(() => {
      if (!signedIn) return;
      if (!consumeStoryListDirty()) return;

      setLoading(true);

      void load(1, 'reset', true);
    }, [signedIn, load]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load(1, 'reset', true);
  }, [load]);

  const onEndReached = useCallback(() => {
    if (!hasMore || busy.current || loading) return;
    setLoadingMore(true);
    void load(loadedPage + 1, 'append');
  }, [hasMore, loadedPage, load, loading]);

  const openStory = useCallback(
    (id: string) => {
      navigation.navigate('StoryDetail', { id });
    },
    [navigation],
  );

  const openPublish = useCallback(() => {
    navigation.navigate('StoryPublish');
  }, [navigation]);

  /**
   * 长按弹管理菜单。
   *
   * **只在「我的故事」里响应** —— 广场是公共区域。自己的故事在广场里也不给删：
   * 管理入口统一收在「我的故事」，同一个手势在不同页面含义不一样最容易误删。
   */
  const handleLongPress = useCallback(
    (story: StoryItem) => {
      if (!userOnly) return;
      setMenuTarget(story);
    },
    [userOnly],
  );

  const handleDeleteStory = useCallback(
    async (story: StoryItem) => {
      setMenuTarget(null);

      const ok = await confirm({

        title: '删除故事',
        message: '确定要删除这条时光故事吗？删除后无法恢复。',
        confirmText: '删除',
      });
      if (!ok) return;

      try {
        await deleteStory(story.id);

        setStories(prev => prev.filter(item => item.id !== story.id));
        toast('已删除');
      } catch (err) {
        toast(err instanceof ApiError ? err.message : '删除失败，请稍后重试');
      }
    },
    [confirm, toast],
  );


  if (!signedIn) {
    return (
      <View style={styles.root}>
        <Notice
          icon="account-lock-outline"
          title="登录后才能看故事"
          description="时光故事需要登录才能查看"
          actionText="去登录"
          onAction={() => navigation.navigate('Login')}
        />
        <FloatingBar left={<FloatingButton icon="arrow-left" onPress={goBack} accessibilityLabel="返回" />} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <FlatList
        data={stories}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <StoryCard
            story={item}
            onPress={() => openStory(item.id)}

            onLongPress={userOnly ? () => handleLongPress(item) : undefined}
          />
        )}
        contentContainerStyle={[
          styles.list,
          {

            paddingTop: insets.top + FLOATING_CLEARANCE,
            paddingBottom: insets.bottom + spacing.xxl,
          },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.peach} />
        }
        onEndReached={onEndReached}

        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={palette.peach} />
            </View>
          ) : error ? (
            <Notice
              icon="cloud-off-outline"
              title="没能加载出来"
              description={error}
              actionText="重试"
              onAction={() => {
                setLoading(true);
                void load(1, 'reset', true);
              }}
            />
          ) : (

            <Notice
              icon="book-outline"
              title="暂无时光故事"
              description="成为第一个分享时光故事的人吧"
              actionText="分享我的故事"
              onAction={openPublish}
            />
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator color={palette.peach} />
            </View>
          ) : stories.length > 0 && !hasMore ? (
            <Text variant="bodySmall" style={styles.footerText}>
              没有更多了
            </Text>
          ) : null
        }
      />

      {/* 发布入口只在「我的故事」有。
          广场是导航页，在那儿放「发布」会让人以为这里是发帖的地方 */}
      {userOnly ? (
        <FAB
          icon="plus"
          color="#FFFFFF"
          accessibilityLabel="发布故事"
          style={[
            styles.fab,
            {
              backgroundColor: palette.peach,

              bottom: insets.bottom + spacing.lg,
            },
          ]}
          onPress={openPublish}
        />
      ) : null}

      <FloatingBar left={<FloatingButton icon="arrow-left" onPress={goBack} accessibilityLabel="返回" />} />

      {/* 长按菜单（广场不挂长按，所以这里只有「我的故事」能弹出来） */}
      <BottomSheet
        visible={menuTarget !== null}
        title="管理故事"
        onDismiss={() => setMenuTarget(null)}
        heightRatio={0.28}
      >
        <List.Item
          title="删除故事"
          titleStyle={styles.dangerText}
          left={props => <List.Icon {...props} icon="trash-can-outline" color={palette.danger} />}
          onPress={() => menuTarget && void handleDeleteStory(menuTarget)}
        />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  list: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },


  fab: {
    position: 'absolute',
    right: FLOATING_MARGIN,

    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    // bottom 在渲染处按安全区算（见 CONTENT_CLEARANCE）
  },
  dangerText: {
    color: palette.danger,
  },


  card: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: palette.peachLine20,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  authorBlock: {
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
  content: {
    color: palette.cocoaSoft,
    lineHeight: 21,
  },
  eventChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingLeft: spacing.sm,
    paddingRight: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: palette.peachTint,
  },
  eventIcon: {
    fontSize: 14,
  },
  eventTitle: {
    color: palette.peachDeep,
    fontWeight: '600',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  tag: {
    color: palette.mauve,
  },
  metrics: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.xs,
  },
  metric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metricText: {
    color: palette.cocoaFaint,
  },


  notice: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
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

  center: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  footer: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  footerText: {
    textAlign: 'center',
    color: palette.cocoaFaint,
    paddingVertical: spacing.lg,
  },
});

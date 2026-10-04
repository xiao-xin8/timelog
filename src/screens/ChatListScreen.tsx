import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons as MaterialDesignIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Text } from 'react-native-paper';

import FloatingBar, { FloatingButton } from '../components/FloatingBar';
import UserAvatar from '../components/UserAvatar';
import { FLOATING_CLEARANCE } from '../navigation/layout';
import type { RootStackParamList } from '../navigation/types';
import type { AuthUser } from '../services/api';
import { ApiError } from '../services/api';
import { fetchChatOverview } from '../services/chat';
import { useAuthStore } from '../store/useAuthStore';
import { palette, radius, spacing } from '../theme';
import type { ChatConversation } from '../types/chat';
import { formatMessageTime, messagePreview } from '../utils/chat';

/**
 * 会话列表（Slice 13b）
 *
 * ## 列的是「所有人」，不是「聊过的人」
 *
 * 旧版就是这个语义：一进去能看到全部注册用户，直接开聊，不需要先"加好友"。
 * 聊过的排前面（按最后一条消息时间），没聊过的沉在下面并显示"还没聊过"。
 *
 * ## 为什么不在这里连 WebSocket
 *
 * 实时性放在**聊天室**里（那里才是你会盯着看的地方）。列表页靠
 * 「重新获得焦点时刷新」就够了 —— 从聊天室返回、或者切回这个 tab
 * 都会拉一次，不需要为它多挂一条长连接。
 */

type Navigation = NativeStackNavigationProp<RootStackParamList>;

interface Row {
  user: AuthUser;
  conversation: ChatConversation | null;
}

/** 昵称优先，没有就用用户名（和头像上的首字母同一套逻辑） */
function displayName(user: AuthUser): string {
  return user.nickname?.trim() || user.username;
}

export default function ChatListScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Navigation>();

  const signedIn = useAuthStore(state => state.status === 'signedIn');

  const [users, setUsers] = useState<AuthUser[]>([]);
  const [conversations, setConversations] = useState<Map<string, ChatConversation>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * `force` 绕开接口缓存（下拉刷新和重试用）。
   *
   * 注意：focus 时**不** force —— 那正是缓存要挡的场景（来回切 tab 不再重复拉
   * 用户目录）。未读数那一档 TTL 只有 10 秒，所以焦点回来时最多旧 10 秒。
   */
  const load = useCallback(async (force = false) => {
    try {

      const overview = await fetchChatOverview({ force });

      setUsers(overview.users);
      setConversations(new Map(overview.conversations.map(item => [item.userId, item])));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '加载失败，请稍后重试');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);


  useFocusEffect(
    useCallback(() => {
      if (!signedIn) return;
      void load();
    }, [signedIn, load]),
  );

  const rows = useMemo<Row[]>(() => {
    return users
      .map(user => ({ user, conversation: conversations.get(user.id) ?? null }))
      /*
       * 有消息的按最后一条时间倒序；没聊过的（时间当 0）自然沉底。
       * 稳定排序保证同一个时间戳的顺序不会每次刷新都跳。
       */
      .sort((a, b) => {
        const left = a.conversation?.lastMessage.createTime ?? 0;
        const right = b.conversation?.lastMessage.createTime ?? 0;
        return right - left;
      });
  }, [users, conversations]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load(true);
  }, [load]);

  const goBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('Tabs');
  }, [navigation]);

  const openChat = useCallback(
    (user: AuthUser) => {
      navigation.navigate('ChatRoom', { userId: user.id });
    },
    [navigation],
  );

  const backBar = (
    <FloatingBar left={<FloatingButton icon="arrow-left" onPress={goBack} accessibilityLabel="返回" />} />
  );



  if (!signedIn) {
    return (
      <View style={styles.root}>
        <View style={styles.center}>
          <MaterialDesignIcons name="account-lock-outline" size={56} color={palette.mauve} />
          <Text variant="titleMedium" style={styles.noticeTitle}>
            登录后才能用时光信笺
          </Text>
          <Text variant="bodySmall" style={styles.noticeDesc}>
            信笺只在登录的用户之间往来
          </Text>
          <Button
            mode="contained"
            onPress={() => navigation.navigate('Login')}
            style={styles.noticeButton}
            contentStyle={styles.noticeButtonInner}
          >
            去登录
          </Button>
        </View>
        {backBar}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <FlatList
        data={rows}
        keyExtractor={item => item.user.id}
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
        renderItem={({ item }) => (
          <ChatRow
            user={item.user}
            conversation={item.conversation}
            onPress={() => openChat(item.user)}
          />
        )}
        ListEmptyComponent={
          loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={palette.peach} />
            </View>
          ) : error ? (
            <View style={styles.center}>
              <MaterialDesignIcons name="cloud-off-outline" size={56} color={palette.mauve} />
              <Text variant="titleMedium" style={styles.noticeTitle}>
                没能加载出来
              </Text>
              <Text variant="bodySmall" style={styles.noticeDesc}>
                {error}
              </Text>
              <Button
                mode="contained"
                onPress={() => {
                  setLoading(true);
                  void load(true);
                }}
                style={styles.noticeButton}
                contentStyle={styles.noticeButtonInner}
              >
                重试
              </Button>
            </View>
          ) : (
            <View style={styles.center}>
              <MaterialDesignIcons name="account-search-outline" size={56} color={palette.mauve} />
              <Text variant="titleMedium" style={styles.noticeTitle}>
                还没有其他用户
              </Text>
              <Text variant="bodySmall" style={styles.noticeDesc}>
                等有人注册了就能在这里找到他
              </Text>
            </View>
          )
        }
      />

      {backBar}
    </View>
  );
}



function ChatRow({
  user,
  conversation,
  onPress,
}: {
  user: AuthUser;
  conversation: ChatConversation | null;
  onPress(): void;
}) {
  const unread = conversation?.unread ?? 0;

  return (
    <Pressable onPress={onPress} android_ripple={{ color: palette.peachLine20 }} style={styles.row}>
      <UserAvatar user={user} size={48} />

      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text variant="bodyLarge" style={styles.name} numberOfLines={1}>
            {displayName(user)}
          </Text>
          {conversation ? (
            <Text variant="bodySmall" style={styles.time}>
              {formatMessageTime(conversation.lastMessage.createTime)}
            </Text>
          ) : null}
        </View>

        <View style={styles.rowBottom}>
          <Text
            variant="bodySmall"
            style={[styles.preview, unread > 0 && styles.previewUnread]}
            numberOfLines={1}
          >
            {conversation ? messagePreview(conversation.lastMessage) : '还没聊过'}
          </Text>

          {unread > 0 ? (
            <View style={styles.badge}>
              {/* 超过 99 就显示 99+，否则角标会把整行撑开 */}
              <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  list: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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


  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: palette.peachLine20,
  },
  rowBody: {
    flex: 1,
    gap: spacing.xs,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  name: {
    flex: 1,
    color: palette.cocoa,
    fontWeight: '600',
  },
  time: {
    color: palette.cocoaFaint,
  },
  preview: {
    flex: 1,
    color: palette.cocoaFaint,
  },
  previewUnread: {
    color: palette.cocoaSoft,
    fontWeight: '600',
  },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.peach,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});

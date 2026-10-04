import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons as MaterialDesignIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Text } from 'react-native-paper';

import FloatingBar, { FloatingButton } from '../components/FloatingBar';
import UserAvatar from '../components/UserAvatar';
import { FLOATING_CLEARANCE } from '../navigation/layout';
import type { RootStackParamList } from '../navigation/types';
import type { AuthUser } from '../services/api';
import { ApiError } from '../services/api';
import { fetchUser } from '../services/chat';
import { palette, radius, spacing } from '../theme';
import { formatJoinDate, genderLabel } from '../utils/user';

/**
 * 看他人资料（Slice 13b）
 *
 * 从会话列表点某个人进来（13c 的聊天室顶部点对方名字也会进来）。
 *
 * 数据用 `GET /api/users/:id`，不是本地那份用户列表 —— 直接拿 URL 进来
 * 也能用，不依赖前一页有没有加载过。
 *
 * ⚠️ 邮箱在这里是**有意展示**的：旧版的这页就显示它，而这个 App 只有注册
 * 用户能进来（没有匿名浏览），使用者之间本来就是熟人。
 * 真要收敛隐私，改后端 `toPublicUser` 那一处映射即可。
 */

type Navigation = NativeStackNavigationProp<RootStackParamList>;
type UserProfileRoute = RouteProp<RootStackParamList, 'UserProfile'>;

/** 底部操作条的高度 */
const FOOTER_HEIGHT = 64;

export default function UserProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Navigation>();
  const { params } = useRoute<UserProfileRoute>();

  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** `force` 绕开接口缓存（重试时用 —— 用户主动重试就该真的去拉一次） */
  const load = useCallback(
    async (force = false) => {
      setLoading(true);
      try {
        setUser(await fetchUser(params.id, { force }));
        setError(null);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : '加载失败，请稍后重试');
      } finally {
        setLoading(false);
      }
    },
    [params.id],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const goBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('Tabs');
  }, [navigation]);

  const startChat = useCallback(() => {
    navigation.navigate('ChatRoom', { userId: params.id });
  }, [navigation, params.id]);

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

  if (error || !user) {
    return (
      <View style={styles.root}>
        <View style={styles.center}>
          <MaterialDesignIcons name="account-question-outline" size={56} color={palette.mauve} />
          <Text variant="titleMedium" style={styles.noticeTitle}>
            没能加载出来
          </Text>
          <Text variant="bodySmall" style={styles.noticeDesc}>
            {error ?? '这个用户不存在'}
          </Text>
          <Button
            mode="contained"
            onPress={() => void load(true)}
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

  const name = user.nickname?.trim() || user.username;

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + FLOATING_CLEARANCE,

            paddingBottom: insets.bottom + FOOTER_HEIGHT + spacing.xxl,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* 头部：大头像 + 昵称 + @用户名 */}
        <View style={styles.header}>
          <UserAvatar user={user} size={80} />
          <Text variant="titleLarge" style={styles.name}>
            {name}
          </Text>
          <Text variant="bodySmall" style={styles.username}>
            @{user.username}
          </Text>
        </View>

        {/* 简介 */}
        <View style={styles.bioCard}>
          <Text variant="bodyMedium" style={styles.bio}>
            {user.bio?.trim() || '这个人很低调，还没写简介'}
          </Text>
        </View>

        {/* 详细资料 */}
        <View style={styles.infoCard}>
          <InfoRow label="性别" value={genderLabel(user.gender) || '保密'} />
          <InfoRow label="生日" value={user.birthday?.trim() || '未填写'} />
          <InfoRow label="地区" value={user.location?.trim() || '未填写'} />
          <InfoRow label="邮箱" value={user.email} />
          <InfoRow label="加入时间" value={formatJoinDate(user.createdAt)} last />
        </View>
      </ScrollView>

      {/* 底部：发消息 */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
        <Button
          mode="contained"
          icon="message-text-outline"
          onPress={startChat}
          style={styles.footerButton}
          contentStyle={styles.footerButtonInner}
        >
          发消息
        </Button>
      </View>

      {backBar}
    </View>
  );
}



function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, !last && styles.infoRowDivider]}>
      <Text variant="bodyMedium" style={styles.infoLabel}>
        {label}
      </Text>
      <Text variant="bodyMedium" style={styles.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
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
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  name: {
    color: palette.cocoa,
    fontWeight: '700',
  },
  username: {
    color: palette.cocoaFaint,
  },


  bioCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: palette.peachLine20,
  },
  bio: {
    color: palette.cocoaSoft,
    lineHeight: 22,
  },


  infoCard: {
    borderRadius: radius.lg,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: palette.peachLine20,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  infoRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.peachLine20,
  },
  infoLabel: {
    color: palette.cocoaFaint,
  },
  infoValue: {
    flex: 1,
    color: palette.cocoa,
    textAlign: 'right',
  },


  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.peachLine20,
  },
  footerButton: {
    borderRadius: radius.md,
  },
  footerButtonInner: {
    height: 44,
  },
});

import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons as MaterialDesignIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActivityIndicator, Button, Text } from 'react-native-paper';

import UserAvatar from '../components/UserAvatar';
import { useFeedback } from '../components/feedback';
import { CONTENT_CLEARANCE, TOP_CONTENT_GAP } from '../navigation/layout';
import type { RootStackParamList } from '../navigation/types';
import { useAuthStore } from '../store/useAuthStore';
import { useSyncStore } from '../store/useSyncStore';
import { palette, radius, spacing } from '../theme';
import { formatLastSyncAt, formatSyncOutcome } from '../utils/syncQueue';
import { formatJoinMonth } from '../utils/user';

/**
 * 我的（Slice 09）
 *
 * 结构照旧版 `legacy/uniapp/pages/profile/profile.vue`：
 *   未登录 → 一张引导卡（未登录 / 登录后可同步数据、备份云端 / 立即登录）+ 关于入口
 *   已登录 → 用户卡（点头像区进编辑资料）+ 菜单（数据同步 / 设置 / 关于）+ 退出登录
 *
 * 有意与旧版不同的一处：**退出登录会真的调后端注销 refresh token**。
 * 旧版只清本地 storage，服务端那张会话一直有效 —— 那不叫登出。
 *
 * 另外旧版「我的故事」入口这里**先不放**：Slice 12 还没做，放了也点不进去。
 */

type Navigation = NativeStackNavigationProp<RootStackParamList>;

type IconName = React.ComponentProps<typeof MaterialDesignIcons>['name'];

interface MenuRowProps {
  icon: IconName;
  label: string;
  onPress(): void;
  danger?: boolean;
  /** 右侧的浅色说明文字 */
  hint?: string;
}

function MenuRow({ icon, label, onPress, danger, hint }: MenuRowProps) {
  const color = danger ? palette.danger : palette.cocoa;

  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: palette.peachLine20 }}
      style={styles.menuRow}
    >
      <MaterialDesignIcons name={icon} size={22} color={danger ? palette.danger : palette.mauve} />
      <Text variant="bodyLarge" style={[styles.menuLabel, { color }]}>
        {label}
      </Text>
      {hint ? (
        <Text variant="bodySmall" style={styles.menuHint}>
          {hint}
        </Text>
      ) : null}
      <MaterialDesignIcons name="chevron-right" size={22} color={palette.mauveLight} />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Navigation>();
  const { confirm, toast } = useFeedback();

  const status = useAuthStore(state => state.status);
  const user = useAuthStore(state => state.user);
  const syncing = useSyncStore(state => state.status === 'syncing');
  const lastSyncAt = useSyncStore(state => state.lastSyncAt);
  const [signingOut, setSigningOut] = useState(false);

  const signedIn = status === 'signedIn' && Boolean(user);

  const handleSignOut = useCallback(async () => {

    const ok = await confirm({
      title: '真的要离开吗？',
      message: '退出后您的数据仍然安全保存在云端，随时欢迎回来~',
      confirmText: '狠心退出',
      cancelText: '再等等',
    });
    if (!ok) return;

    setSigningOut(true);
    try {
      await useAuthStore.getState().signOut();
    } finally {
      setSigningOut(false);
    }
  }, [confirm]);

  /**
   * 手动同步（Slice 10）
   *
   * **结果要说清楚干了什么**。「同步成功」等于什么都没说 ——
   * 什么都没改也是成功，上传了 20 条也是成功，用户没法判断同没同。
   */
  const handleSync = useCallback(async () => {
    try {
      const outcome = await useSyncStore.getState().syncNow();
      toast(formatSyncOutcome(outcome));
    } catch (error) {
      toast(error instanceof Error ? error.message : '同步失败，请稍后重试');
    }
  }, [toast]);

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {

            paddingTop: insets.top + TOP_CONTENT_GAP,
            paddingBottom: insets.bottom + CONTENT_CLEARANCE,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {status === 'restoring' ? (
          <View style={styles.restoring}>
            <ActivityIndicator color={palette.peach} />
            <Text variant="bodySmall" style={styles.restoringText}>
              正在恢复登录状态…
            </Text>
          </View>
        ) : signedIn && user ? (
          <>
            {/* 用户卡：整块可点，进编辑资料 */}
            <Pressable
              onPress={() => navigation.navigate('EditProfile')}
              android_ripple={{ color: palette.peachLine20 }}
              style={styles.userCard}
            >
              <UserAvatar user={user} size={64} />

              <View style={styles.userInfo}>
                <Text variant="titleMedium" style={styles.nickname} numberOfLines={1}>
                  {user.nickname?.trim() || user.username || '用户'}
                </Text>
                <Text variant="bodySmall" style={styles.email} numberOfLines={1}>
                  {user.email}
                </Text>
                <Text variant="bodySmall" style={styles.joined}>
                  加入于 {formatJoinMonth(user.createdAt)}
                </Text>
              </View>

              <MaterialDesignIcons name="chevron-right" size={22} color={palette.mauveLight} />
            </Pressable>

            <View style={styles.menuGroup}>
              <MenuRow
                icon="sync"
                label={syncing ? '正在同步…' : '数据同步'}

                hint={syncing ? undefined : formatLastSyncAt(lastSyncAt)}
                onPress={handleSync}
              />
            </View>

            <View style={styles.menuGroup}>
              <MenuRow icon="cog-outline" label="设置" onPress={() => navigation.navigate('Settings')} />
              <MenuRow
                icon="information-outline"
                label="关于"
                onPress={() => navigation.navigate('About')}
              />
            </View>

            <View style={styles.menuGroup}>
              <MenuRow
                icon="logout"
                label={signingOut ? '正在退出…' : '退出登录'}
                onPress={handleSignOut}
                danger
              />
            </View>
          </>
        ) : (
          <>
            <View style={styles.guestCard}>
              <View style={styles.guestIcon}>
                <MaterialDesignIcons
                  name="account-circle-outline"
                  size={44}
                  color={palette.peachDeep}
                />
              </View>
              <Text variant="titleMedium" style={styles.guestTitle}>
                未登录
              </Text>
              <Text variant="bodySmall" style={styles.guestHint}>
                登录后可同步数据、备份云端
              </Text>
              <Button
                mode="contained"
                onPress={() => navigation.navigate('Login')}
                style={styles.loginButton}
                contentStyle={styles.loginButtonContent}
              >
                立即登录
              </Button>
            </View>

            {/* 未登录时也留一个关于入口（旧版就是这么放的） */}
            <View style={styles.menuGroup}>
              <MenuRow
                icon="information-outline"
                label="关于"
                hint="了解更多关于时光日志"
                onPress={() => navigation.navigate('About')}
              />
            </View>
          </>
        )}
      </ScrollView>
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
  restoring: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
  },
  restoringText: {
    color: palette.cocoaFaint,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: palette.peachLine20,
  },
  userInfo: {
    flex: 1,
    gap: 2,
  },
  nickname: {
    color: palette.cocoa,
    fontWeight: '700',
  },
  email: {
    color: palette.cocoaSoft,
  },
  joined: {
    color: palette.cocoaFaint,
  },
  menuGroup: {
    borderRadius: radius.lg,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: palette.peachLine20,

    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
  },
  menuLabel: {
    flex: 1,
  },
  menuHint: {
    color: palette.cocoaFaint,
  },
  guestCard: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: palette.peachLine20,
  },
  guestIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.peachTint,
    marginBottom: spacing.xs,
  },
  guestTitle: {
    color: palette.cocoa,
    fontWeight: '700',
  },
  guestHint: {
    color: palette.cocoaFaint,
  },
  loginButton: {
    marginTop: spacing.md,
    alignSelf: 'stretch',
    borderRadius: radius.md,
  },
  loginButtonContent: {
    height: 48,
  },
});

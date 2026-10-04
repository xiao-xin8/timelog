import React, { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons as MaterialDesignIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from 'react-native-paper';

import { CONTENT_CLEARANCE, TOP_CONTENT_GAP } from '../navigation/layout';
import type { RootStackParamList } from '../navigation/types';
import { palette, radius, spacing } from '../theme';

/**
 * 时光社区（Slice 11b）
 *
 * 这是个**纯入口页**（照旧版 `community.vue` 的结构）：一张张卡片竖排，
 * 点进各自的页面。本身不展示任何内容。
 *
 * ## 有意没做的两块
 *
 * - **「社区动态」**：旧版有个占位块写着"功能开发中"，从来没实现过。
 * - **「推荐用户」**：旧版有 3 个假用户（小红/小明/小李）写死在 js 里，
 *   但**模板根本没渲染这个变量** —— 页面上完全看不到。
 *   翻旧代码时很容易以为"漏做了"，其实它本来就是死的。
 *
 * ## 没有页面标题
 *
 * 一级 tab 页全都不放标题（首页、日历、我的也一样），内容直接顶到状态栏下面。
 * 见 `navigation/layout.ts` 顶部那段说明。
 */

type Navigation = NativeStackNavigationProp<RootStackParamList>;

type IconName = React.ComponentProps<typeof MaterialDesignIcons>['name'];

interface EntryCardProps {
  icon: IconName;
  title: string;
  description: string;
  onPress(): void;
}

/** 一张入口卡：圆形图标底 + 标题/副标题 + 右侧箭头 */
function EntryCard({ icon, title, description, onPress }: EntryCardProps) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: palette.peachLine20 }}
      style={styles.card}
    >
      <View style={styles.cardIcon}>
        <MaterialDesignIcons name={icon} size={26} color={palette.peachDeep} />
      </View>

      <View style={styles.cardText}>
        <Text variant="titleMedium" style={styles.cardTitle}>
          {title}
        </Text>
        <Text variant="bodySmall" style={styles.cardDesc} numberOfLines={1}>
          {description}
        </Text>
      </View>

      <MaterialDesignIcons name="chevron-right" size={22} color={palette.mauveLight} />
    </Pressable>
  );
}

export default function CommunityScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Navigation>();

  const openChat = useCallback(() => {
    navigation.navigate('ChatList');
  }, [navigation]);

  const openStories = useCallback(() => {
    navigation.navigate('StoryList');
  }, [navigation]);

  const openMyStories = useCallback(() => {
    navigation.navigate('StoryList', { userOnly: true });
  }, [navigation]);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        {

          paddingTop: insets.top + TOP_CONTENT_GAP,
          paddingBottom: insets.bottom + CONTENT_CLEARANCE,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/*
        未读角标等 Slice 13 有了真实数据再加。
        现在没有数据源，**别硬编一个 0 出来** —— 那个小红点会永远挂着。
      */}
      <EntryCard
        icon="message-text-outline"
        title="时光信笺"
        description="和好友聊聊最近的事"
        onPress={openChat}
      />
      <EntryCard
        icon="book-open-variant"
        title="时光故事"
        description="分享你的精彩时光，记录美好瞬间"
        onPress={openStories}
      />
      <EntryCard
        icon="account-heart-outline"
        title="我的故事"
        description="管理你分享的时光故事"
        onPress={openMyStories}
      />
    </ScrollView>
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
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: palette.peachLine20,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.peachTint,
  },
  cardText: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    color: palette.cocoa,
    fontWeight: '700',
  },
  cardDesc: {
    color: palette.cocoaFaint,
  },
});

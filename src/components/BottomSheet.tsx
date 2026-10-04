import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { IconButton, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette, radius, spacing } from '../theme';

/**
 * 通用底部面板
 *
 * **本项目所有选择器统一用它**（图标、分类、颜色、日期、时间……），
 * 不要再各自用 Dialog 或自己搭 Modal —— 样式、动画、关闭手势、底部安全区
 * 全都收在这里，页面里只关心内容。
 *
 * 布局约定：
 *   - 面板高度按屏幕比例给，默认 60%
 *   - 顶部固定：拖拽条 + 标题 + 关闭按钮
 *   - 中间 `children` 自动占满剩余空间（要滚动的列表自己套 FlatList/ScrollView）
 *   - 底部自动留系统导航栏的安全区，不会出现内容被遮挡或截断
 *
 * 动画用 `translateY` + native driver，比高度动画顺滑得多，
 * 也不会跟面板里开关一类的动画抢 JS 线程。
 */

interface Props {
  visible: boolean;
  /** 面板标题，如「选择图标」 */
  title: string;
  onDismiss(): void;
  children: React.ReactNode;
  /** 面板高度占屏幕比例，默认 0.6 */
  heightRatio?: number;
  /** 底部固定操作区（一般放按钮），可选 */
  footer?: React.ReactNode;
}

const DURATION = 240;

export default function BottomSheet({
  visible,
  title,
  onDismiss,
  children,
  heightRatio = 0.6,
  footer,
}: Props) {
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const sheetHeight = Math.round(screenHeight * heightRatio);


  const progress = useRef(new Animated.Value(0)).current;

  const [mounted, setMounted] = useState(visible);

  /**
   * 保留最后一次的内容
   *
   * 面板由父组件用 `visible` 控制。父组件一关就把标题/内容置空（比如把它从
   * 「设置项标题」变成了空字符串），而收起动画还在跑 —— 结果就是面板往下滑的同时
   * 标题先消失了，观感很怪。
   *
   * 所以收起过程中继续用上一次的内容，等动画跑完再一起清掉。
   */
  const [snapshot, setSnapshot] = useState({ title, children });

  useEffect(() => {
    if (visible) {
      setSnapshot({ title, children });
    }
  }, [visible, title, children]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(progress, {
        toValue: 1,
        duration: DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }

    Animated.timing(progress, {
      toValue: 0,
      duration: DURATION,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [visible, progress]);

  const touchableOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const renderHeader = useCallback(
    (headerTitle: string) => (
      <>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>
            {headerTitle}
          </Text>
          <IconButton
            icon="close"
            size={24}
            onPress={onDismiss}
            accessibilityLabel="关闭"
          />
        </View>
      </>
    ),
    [onDismiss],
  );

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <View style={styles.backdrop}>
        {/* 点空白处关闭 */}
        <Animated.View style={[styles.backdropTouchWrap, { opacity: touchableOpacity }]}>
          <Pressable style={styles.backdropTouch} onPress={onDismiss} />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              height: sheetHeight,
              paddingBottom: Math.max(insets.bottom, spacing.md),
              transform: [
                {
                  translateY: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [sheetHeight, 0],
                  }),
                },
              ],
            },
          ]}
        >
          {/* 用快照渲染，收起过程中内容不会先消失 */}
          {renderHeader(snapshot.title)}
          <View style={styles.body}>{snapshot.children}</View>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

/**
 * 横向分组切换条（图标、分类这类需要切组的场景通用）
 */
export function SheetGroupBar<T extends { name?: string; key?: string }>({
  data,
  activeKey,
  getKey,
  getLabel,
  onChange,
}: {
  data: readonly T[];
  activeKey: string;
  getKey(item: T): string;
  getLabel(item: T): string;
  onChange(key: string): void;
}) {
  return (
    <View style={styles.groupRow}>
      {/* 用 FlatList 而非 ScrollView，条目多了也不卡 */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={data as T[]}
        keyExtractor={item => getKey(item)}
        contentContainerStyle={styles.groupList}
        renderItem={({ item }) => {
          const key = getKey(item);
          const active = key === activeKey;
          return (
            <Pressable onPress={() => onChange(key)}>
              <Text style={[styles.groupChip, active && styles.groupChipActive]}>
                {getLabel(item)}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  backdropTouchWrap: {
    flex: 1,
  },
  backdropTouch: {
    flex: 1,
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: palette.peachLine30,
    marginBottom: spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: palette.cocoa,
  },
  body: {
    flex: 1,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.peachLine20,
    paddingTop: spacing.sm,
  },
  groupRow: {
    paddingBottom: spacing.sm,
  },
  groupList: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  groupChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: palette.peachTint,
    color: palette.cocoaSoft,
    fontSize: 14,
    overflow: 'hidden',
  },
  groupChipActive: {
    backgroundColor: palette.peach,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});

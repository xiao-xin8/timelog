import React, { memo, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { Divider, Text } from 'react-native-paper';

import { palette, radius, spacing } from '../theme';
import type { CategoryItem } from '../types/event';

/**
 * 分类筛选抽屉（左侧滑出）
 *
 * 对应旧版首页左上角的 ☰。结构：[全部] + 7 个内置分类 + 自定义分类，
 * 每项右侧显示该分类下的事件数量。
 *
 * 注意：Paper 的 `Drawer` 只是内容分区组件，并不提供滑出容器和遮罩，
 * 所以这里用 Modal + translateX 自己搭一个，行为和 BottomSheet 对称（左侧 vs 底部）。
 *
 * 筛选状态下**置顶事件始终显示**、不参与过滤 —— 这条规则在首页实现，这里只管抛选中的 key。
 */

export interface DrawerEntry extends CategoryItem {
  /** 该分类下的事件数量 */
  count: number;
}

interface Props {
  visible: boolean;
  onDismiss(): void;
  /** 当前选中的分类 key；null 表示「全部」 */
  selected: string | null;
  onSelect(key: string | null): void;
  entries: DrawerEntry[];
  /** 事件总数，用于「全部」那一项 */
  total: number;
}

const DURATION = 200;
/**
 * 遮罩单独一条更快的动画
 *
 * 抽屉滑动 200ms、遮罩只淡入 120ms，观感上"背景先沉下来、面板随后跟到位"，
 * 比两者同步要利落。两条都走 native driver。
 */
const SCRIM_DURATION = 120;

/** 遮罩点空白关闭，所以要能被点 —— 直接做成动画组件，省掉一层 Pressable */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** 抽屉宽度占屏幕比例 */
const WIDTH_RATIO = 0.76;

export default function CategoryDrawer({
  visible,
  onDismiss,
  selected,
  onSelect,
  entries,
  total,
}: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const drawerWidth = Math.round(screenWidth * WIDTH_RATIO);

  const progress = useRef(new Animated.Value(0)).current;
  /** 遮罩单独一条更快的动画，见 SCRIM_DURATION */
  const scrim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);


  useEffect(() => {
    if (!visible) return;

    progress.setValue(0);
    scrim.setValue(0);
    setMounted(true);
  }, [visible, progress, scrim]);


  useEffect(() => {
    if (!visible || !mounted) return;

    const opening = Animated.parallel([
      Animated.timing(progress, {
        toValue: 1,
        duration: DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(scrim, {
        toValue: 1,
        duration: SCRIM_DURATION,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]);
    opening.start();


    return () => opening.stop();
  }, [visible, mounted, progress, scrim]);


  useEffect(() => {
    if (visible || !mounted) return;

    const closing = Animated.parallel([
      Animated.timing(progress, {
        toValue: 0,
        duration: DURATION,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(scrim, {
        toValue: 0,
        duration: SCRIM_DURATION,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]);
    closing.start(({ finished }) => {
      if (finished) setMounted(false);
    });

    return () => closing.stop();
  }, [visible, mounted, progress, scrim]);

  const pick = (key: string | null) => {
    onSelect(key);
    onDismiss();
  };

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <View style={styles.backdrop}>
        {/* 单层即可：既做遮罩又负责点击空白关闭 */}
        <AnimatedPressable
          style={[styles.scrim, { opacity: scrim }]}
          onPress={onDismiss}
          accessibilityLabel="关闭筛选"
        />

        <Animated.View
          style={[
            styles.drawer,
            {
              width: drawerWidth,
              transform: [
                {
                  translateX: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-drawerWidth, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.header}>
            <Text style={styles.title}>按分类筛选</Text>
          </View>
          <Divider />

          <ScrollView contentContainerStyle={styles.list}>
            <Row
              icon="🗂️"
              label="全部"
              count={total}
              active={selected === null}
              onPress={() => pick(null)}
            />

            {entries.map(entry => (
              <Row
                key={entry.key}
                icon={entry.icon}
                label={entry.name}
                count={entry.count}
                active={selected === entry.key}
                onPress={() => pick(entry.key)}
              />
            ))}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

/** 单行：图标 + 名称 + 计数 */
function RowInner({
  icon,
  label,
  count,
  active,
  onPress,
}: {
  icon: string;
  label: string;
  count: number;
  active: boolean;
  onPress(): void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.row, active && styles.rowActive]}
      android_ripple={{ color: palette.peachSoft }}
    >
      <Text style={styles.rowIcon}>{icon}</Text>
      <Text style={[styles.rowLabel, active && styles.rowLabelActive]} numberOfLines={1}>
        {label}
      </Text>
      <View style={[styles.badge, active && styles.badgeActive]}>
        <Text style={[styles.badgeText, active && styles.badgeTextActive]}>{count}</Text>
      </View>
    </Pressable>
  );
}

/**
 * 行组件用 memo
 *
 * 真正的大头是上面两条（遮罩压成单层、去掉动画中的圆角裁剪）。
 * 这里 memo 只是顺手 —— 分类最多十几行，收益有限，别指望它救场。
 */
const Row = memo(RowInner);

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    flexDirection: 'row',
  },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  drawer: {
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderTopRightRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    /*
     * 故意不加 `overflow: hidden`。
     *
     * 圆角裁剪叠在 transform 动画上时，Android 每帧都要重算遮罩层 —— 这是这个抽屉
     * 之前推起来"发沉"的主因。这里没有子元素会真的溢出圆角（标题是纯色块、
     * 分类列表在内部自己滚），所以去掉裁剪既不掉视觉，也不影响布局。
     */
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.md,
  },
  title: {
    color: palette.cocoa,
    fontWeight: '700',
  },
  list: {
    paddingVertical: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowActive: {
    backgroundColor: palette.peachTint,
  },
  rowIcon: {
    fontSize: 20,
  },
  rowLabel: {
    flex: 1,
    color: palette.cocoaSoft,
  },
  rowLabelActive: {
    color: palette.cocoa,
    fontWeight: '700',
  },
  badge: {
    minWidth: 28,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: palette.peachLine15,
    alignItems: 'center',
  },
  badgeActive: {
    backgroundColor: palette.peach,
  },
  badgeText: {
    color: palette.peachDeep,
    fontWeight: '600',
  },
  badgeTextActive: {
    color: '#FFFFFF',
  },
});

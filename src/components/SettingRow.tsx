import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, TouchableRipple } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { palette, spacing } from '../theme';

/**
 * 设置行
 *
 * 为什么不用 Paper 的 `List.Item`：
 *
 * `List.Item` 在「有 description」和「没有 description」时内部走的是不同的渲染结构。
 * 表单里三个开关长得一模一样，唯独带 description 的两个（显示精准时间、置顶显示）
 * 出现了「开关没有动画」的问题 —— 滑块是直接跳过去的。
 * 原因是结构变化导致 `right` 里的 `Switch` 被重新挂载，动画进度被重置。
 *
 * 这里自己写一个固定结构的行，**左右两侧的节点位置永远不变**，
 * 开关就能稳定复用、动画正常。
 *
 * 结构固定为：`[图标] [标题 / 描述] ............ [右侧内容]`
 */
interface Props {
  /** MaterialCommunityIcons 的图标名 */
  icon: string;
  title: string;
  description?: string;
  /** 右侧内容，开关、文字、色块都放这 */
  right?: React.ReactNode;
  onPress?(): void;
}

function SettingRowInner({ icon, title, description, right, onPress }: Props) {
  const content = (
    <View style={styles.row}>
      <MaterialCommunityIcons
        name={icon as never}
        size={22}
        color={palette.cocoaSoft}
        style={styles.icon}
      />

      <View style={styles.texts}>
        <Text style={styles.title}>{title}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>

      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );

  if (!onPress) {
    return <View style={styles.wrapper}>{content}</View>;
  }

  return (
    <TouchableRipple onPress={onPress} style={styles.wrapper}>
      {content}
    </TouchableRipple>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    minHeight: 56,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  icon: {

    width: 24,
    textAlign: 'center',
  },
  texts: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: palette.cocoa,
  },
  description: {
    color: palette.cocoaFaint,
    fontSize: 12,
  },
  right: {

    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});

const SettingRow = memo(SettingRowInner);
export default SettingRow;

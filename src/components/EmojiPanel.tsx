import React, { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import BottomSheet from './BottomSheet';
import { getEmojiCategories, getEmojisByCategory } from '../constants/emojis';
import { palette, radius, spacing } from '../theme';



/** 每行几个 */
const COLUMNS = 8;
/** 单元格边长 */
const CELL = 44;

interface Props {
  visible: boolean;
  onDismiss(): void;
  /** 选中一个表情。调用方负责插进输入框 */
  onPick(char: string): void;
}

export default function EmojiPanel({ visible, onDismiss, onPick }: Props) {
  const categories = useMemo(() => getEmojiCategories(), []);
  const [categoryId, setCategoryId] = useState(() => categories[0]?.id ?? '');

  const emojis = useMemo(() => getEmojisByCategory(categoryId), [categoryId]);

  /**
   * 格子是定高的，告诉 FlatList 就不用去量 —— 切分类时不会有一帧空白。
   *
   * `offset` 按**行**算：`numColumns` 下每 COLUMNS 个格子才占一行。
   */
  const getItemLayout = useCallback(
    (_data: unknown, index: number) => ({
      length: CELL,
      offset: CELL * Math.floor(index / COLUMNS),
      index,
    }),
    [],
  );

  return (
    <BottomSheet visible={visible} title="表情" onDismiss={onDismiss} heightRatio={0.5}>
      {/* 分类切换 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}
      >
        {categories.map(category => {
          const active = category.id === categoryId;
          return (
            <Pressable key={category.id} onPress={() => setCategoryId(category.id)}>
              <Text style={[styles.tab, active && styles.tabActive]}>{category.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <FlatList
        data={emojis}
        numColumns={COLUMNS}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.grid}
        getItemLayout={getItemLayout}
        initialNumToRender={COLUMNS * 4}
        maxToRenderPerBatch={COLUMNS * 4}
        windowSize={5}
        renderItem={({ item }) => <EmojiCell char={item.char} onPress={onPick} />}
      />
    </BottomSheet>
  );
}



/**
 * `memo` 过的格子。
 *
 * `onPick` 从父组件一路传下来，只要它是稳定引用（`useCallback` 包过），
 * 切分类时已有的格子就不会白白重渲染。
 */
const EmojiCell = memo(function EmojiCell({
  char,
  onPress,
}: {
  char: string;
  onPress(char: string): void;
}) {
  return (
    <Pressable
      onPress={() => onPress(char)}
      android_ripple={{ color: palette.peachLine20, borderless: false }}
      style={styles.cell}
    >
      <Text style={styles.emoji}>{char}</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  tabs: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  tab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: palette.peachTint,
    color: palette.cocoaSoft,
    fontSize: 14,
    overflow: 'hidden',
  },
  tabActive: {
    backgroundColor: palette.peach,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  grid: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  cell: {

    flex: 1,
    height: CELL,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  emoji: {

    fontSize: 26,
    lineHeight: 32,
  },
});

import React, { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { TextInput } from 'react-native-paper';

import BottomSheet from './BottomSheet';
import { EMOJI_GROUPS } from '../constants/emoji';
import { inputTheme, palette, radius, spacing } from '../theme';

/**
 * Emoji 图标选择器（底部面板）
 *
 * 数据来自旧项目的 EMOJI_ICONS（12 组 / 986 个）。
 *
 * 之前卡顿和错乱的两个根因，这里都规避了：
 *   1. **默认只显示第一个分组**，不要一上来就渲染近千个格子
 *   2. 格子用 `TouchableRipple` 而不是 `IconButton`，并且固定尺寸交给 `getItemLayout`
 */

interface Props {
  visible: boolean;
  value: string;
  onSelect(icon: string): void;
  onDismiss(): void;
}

const COLUMNS = 8;
const CELL = 46;

const ALL_GROUP = '__all__';

const EmojiCell = memo(function EmojiCell({
  icon,
  active,
  onPress,
}: {
  icon: string;
  active: boolean;
  onPress(icon: string): void;
}) {
  return (
    <Pressable
      onPress={() => onPress(icon)}
      style={[styles.cell, active && styles.cellActive]}
      android_ripple={{ color: palette.peachSoft, borderless: true }}
    >
      <Text style={styles.emoji}>{icon}</Text>
    </Pressable>
  );
});

const GROUP_TABS = [
  { key: ALL_GROUP, label: '全部' },
  ...EMOJI_GROUPS.map(group => ({ key: group.name, label: group.name })),
];

export default function EmojiPicker({ visible, value, onSelect, onDismiss }: Props) {

  const [groupKey, setGroupKey] = useState<string>(
    EMOJI_GROUPS[0]?.name ?? ALL_GROUP,
  );
  const [keyword, setKeyword] = useState('');

  const icons = useMemo(() => {
    const searching = keyword.trim().length > 0;
    const base =
      searching || groupKey === ALL_GROUP
        ? EMOJI_GROUPS.flatMap(group => group.icons)
        : (EMOJI_GROUPS.find(group => group.name === groupKey)?.icons ?? []);

    const trimmed = keyword.trim();
    return trimmed ? base.filter(icon => icon.includes(trimmed)) : base;
  }, [groupKey, keyword]);

  const handleSelect = useCallback(
    (icon: string) => {
      onSelect(icon);
      onDismiss();
    },
    [onSelect, onDismiss],
  );

  const renderItem = useCallback(
    ({ item }: { item: string }) => (
      <EmojiCell icon={item} active={item === value} onPress={handleSelect} />
    ),
    [value, handleSelect],
  );

  return (
    <BottomSheet
      visible={visible}
      title="选择图标"
      onDismiss={onDismiss}
      heightRatio={0.8}
    >
      <View style={styles.searchRow}>
        <TextInput
          mode="outlined"
          dense
          placeholder="搜索（支持直接粘贴 emoji）"
          value={keyword}
          onChangeText={setKeyword}
          style={styles.search}
          theme={inputTheme}
          right={
            keyword ? <TextInput.Icon icon="close" onPress={() => setKeyword('')} /> : undefined
          }
        />
      </View>

      {/* 分组切换 */}
      <View style={styles.groupRow}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={GROUP_TABS}
          keyExtractor={item => item.key}
          contentContainerStyle={styles.groupList}
          renderItem={({ item }) => {
            const active = item.key === groupKey;
            return (
              <Pressable
                onPress={() => setGroupKey(item.key)}
                style={[styles.groupChip, active && styles.groupChipActive]}
              >
                <Text style={[styles.groupChipText, active && styles.groupChipTextActive]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>

      {/* 网格占满剩余空间 */}
      <FlatList
        data={icons}
        keyExtractor={item => item}
        numColumns={COLUMNS}
        renderItem={renderItem}
        getItemLayout={(_, index) => ({
          length: CELL,
          offset: CELL * Math.floor(index / COLUMNS),
          index,
        })}
        initialNumToRender={COLUMNS * 4}
        maxToRenderPerBatch={COLUMNS * 4}
        updateCellsBatchingPeriod={40}
        windowSize={5}
        removeClippedSubviews
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.gridContent}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  searchRow: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  search: {
    backgroundColor: '#FFFFFF',
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
  },
  groupChipActive: {
    backgroundColor: palette.peach,
  },
  groupChipText: {

    fontSize: 14,
    color: palette.cocoaSoft,
  },
  groupChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  gridContent: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  cell: {
    width: `${100 / COLUMNS}%`,
    height: CELL,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  cellActive: {
    backgroundColor: palette.peachSoft,
  },
  emoji: {
    fontSize: 26,
  },
});

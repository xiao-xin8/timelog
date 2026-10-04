import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import type { LegalBlock } from '../constants/legal';
import { palette, spacing } from '../theme';
import BottomSheet from './BottomSheet';

/**
 * 用户协议 / 隐私政策展示面板
 *
 * 旧版为了绕开 uni 的限制，专门做了两个独立页面（agreement.vue / privacy.vue）。
 * RN 这边没必要 —— 正文已经抽成结构化数据（`constants/legal.ts`），
 * 用底部面板展示即可，整块屏幕都让给正文，比 Dialog 好读得多。
 *
 * 正文块按类型分层：title / date / heading / body / item，
 * 字号一律走 Paper 的 variant，页面里不写 fontSize（项目约定）。
 */

interface Props {
  visible: boolean;
  title: string;
  blocks: readonly LegalBlock[];
  onDismiss(): void;
}

export default function LegalSheet({ visible, title, blocks, onDismiss }: Props) {
  return (
    <BottomSheet visible={visible} title={title} onDismiss={onDismiss} heightRatio={0.8}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {blocks.map((block, index) => {

          const key = `${block.type}-${index}`;

          switch (block.type) {
            case 'title':
              return (
                <Text key={key} variant="titleLarge" style={styles.title}>
                  {block.text}
                </Text>
              );
            case 'date':
              return (
                <Text key={key} variant="bodySmall" style={styles.date}>
                  {block.text}
                </Text>
              );
            case 'heading':
              return (
                <Text key={key} variant="titleMedium" style={styles.heading}>
                  {block.text}
                </Text>
              );
            case 'item':
              return (
                <View key={key} style={styles.itemRow}>
                  <Text variant="bodyMedium" style={styles.bullet}>
                    ·
                  </Text>
                  <Text variant="bodyMedium" style={styles.body}>
                    {block.text}
                  </Text>
                </View>
              );
            default:
              return (
                <Text key={key} variant="bodyMedium" style={styles.body}>
                  {block.text}
                </Text>
              );
          }
        })}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  title: {
    color: palette.cocoa,
    fontWeight: '700',
    textAlign: 'center',
  },
  date: {
    color: palette.cocoaFaint,
    textAlign: 'center',
  },
  heading: {
    color: palette.cocoa,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  body: {
    flex: 1,
    color: palette.cocoaSoft,

    lineHeight: 24,
  },
  itemRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  bullet: {
    color: palette.peach,
    fontWeight: '700',
    lineHeight: 24,
  },
});

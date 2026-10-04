import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, List, Text, TextInput } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BottomSheet from '../components/BottomSheet';
import { FloatingButton } from '../components/FloatingBar';
import { useFeedback } from '../components/feedback';
import { TOP_CONTENT_GAP } from '../navigation/layout';
import type { RootStackParamList } from '../navigation/types';
import { ApiError } from '../services/api';
import { markStoryListDirty, publishStory } from '../services/story';
import { useEventStore } from '../store/useEventStore';
import { inputTheme, palette, radius, spacing } from '../theme';
import type { EventItem } from '../types/event';
import {
  STORY_CONTENT_MAX,
  STORY_TAG_MAX_COUNT,
  STORY_TAG_MAX_LENGTH,
  STORY_TOPIC_PRESETS,
} from '../types/story';
import { calcCountdown, formatCountdownText, formatFullDate } from '../utils/countdown';
import { toStorySnapshot } from '../utils/story';

/**
 * 发布时光故事（Slice 11d）
 *
 * 发一条故事 = 挑一个本地事件 + 写一段正文 + 选几个话题标签。
 * 事件快照由 `toStorySnapshot()` 生成（纯逻辑，有验证脚本盯着）。
 *
 * ## 为什么发布成功后是「跳详情」而不是「返回列表」
 *
 * 停在发布页的话，用户会以为没发出去、再点一次 —— 就发两条了。
 * 跳到详情页能立刻看到成果，返回时自然回到列表（用 `replace` 把发布页从栈里换掉）。
 * 列表靠 `markStoryListDirty()` 在重新获得焦点时刷新。
 */

type Navigation = NativeStackNavigationProp<RootStackParamList>;

/** 底部发布条的高度（列表按它留白，否则最后一段会被压住） */
const FOOTER_HEIGHT = 64;

export default function StoryPublishScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Navigation>();
  const { toast } = useFeedback();

  const events = useEventStore(state => state.events);

  const [selected, setSelected] = useState<EventItem | null>(null);
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);

  /**
   * 事件列表按**创建时间倒序**。
   *
   * 不照搬首页那套「按距离目标日期排序」—— 发布时用户想找的是"我刚记的那个"，
   * 而不是"最快要到的那个"。
   */
  const sortedEvents = useMemo(
    () =>
      [...events].sort(
        (a, b) => new Date(b.createTime).getTime() - new Date(a.createTime).getTime(),
      ),
    [events],
  );

  const selectedMeta = useMemo(() => {
    if (!selected) return '';
    const countdown = calcCountdown(selected.targetDateTime, selected.showPreciseTime);
    const label = countdown.isPast ? '已过' : '还有';
    return `${formatFullDate(selected.targetDateTime)} · ${label} ${formatCountdownText(
      countdown,
      selected.showPreciseTime,
    )}`;
  }, [selected]);

  const trimmedContent = content.trim();

  const canPublish = Boolean(selected) && trimmedContent.length > 0 && !publishing;



  const toggleTag = useCallback(
    (tag: string) => {

      if (tags.includes(tag)) {
        setTags(tags.filter(item => item !== tag));
        return;
      }

      if (tags.length >= STORY_TAG_MAX_COUNT) {
        toast(`最多选 ${STORY_TAG_MAX_COUNT} 个话题`);
        return;
      }

      setTags([...tags, tag]);
    },
    [tags, toast],
  );

  const addCustomTag = useCallback(() => {
    const tag = customTag.trim();
    if (!tag) return;

    if (tags.includes(tag)) {
      toast('这个话题已经加过了');
      setCustomTag('');
      return;
    }

    if (tags.length >= STORY_TAG_MAX_COUNT) {
      toast(`最多选 ${STORY_TAG_MAX_COUNT} 个话题`);
      return;
    }

    setTags([...tags, tag]);
    setCustomTag('');
  }, [customTag, tags, toast]);



  const handlePublish = useCallback(async () => {
    if (!selected || !trimmedContent || publishing) return;

    setPublishing(true);
    try {
      const story = await publishStory({
        content: trimmedContent,
        event: toStorySnapshot(selected),
        tags,
      });


      markStoryListDirty();
      toast('发布成功');


      navigation.replace('StoryDetail', { id: story.id });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '发布失败，请稍后重试');
    } finally {
      setPublishing(false);
    }
  }, [selected, trimmedContent, publishing, tags, toast, navigation]);

  const goBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('Tabs');
  }, [navigation]);

  return (
    <View style={styles.root}>
      {/*
        头部：返回按钮 + 「选择事件」**并排一行**（和故事详情页同一套布局）。

        原来是悬浮圆钮一行、事件卡再一行，两者上下分开还空着一截。
        这一行固定不动，下面的正文和标签从它下面开始滚。
      */}
      <View style={[styles.header, { paddingTop: insets.top + TOP_CONTENT_GAP }]}>
        <FloatingButton icon="arrow-left" onPress={goBack} accessibilityLabel="返回" />

        <Pressable onPress={() => setPickerOpen(true)} style={styles.eventCard}>
          {selected ? (
            <>
              <Text style={styles.eventIcon}>{selected.icon}</Text>
              <View style={styles.eventBody}>
                <Text variant="titleMedium" style={styles.eventTitle} numberOfLines={1}>
                  {selected.title}
                </Text>
                <Text variant="bodySmall" style={styles.eventMeta}>{selectedMeta}</Text>
              </View>
              <Text variant="bodySmall" style={styles.eventAction}>更换</Text>
            </>
          ) : (
            <>
              <Text style={styles.eventIcon}>📅</Text>
              <View style={styles.eventBody}>
                <Text variant="bodyMedium" style={styles.eventPlaceholder}>
                  选择一个事件
                </Text>
                <Text variant="bodySmall" style={styles.eventHint}>
                  故事要带上一个日子
                </Text>
              </View>
              <Text variant="bodySmall" style={styles.eventAction}>选择</Text>
            </>
          )}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {


            paddingBottom: insets.bottom + FOOTER_HEIGHT + spacing.xxl,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* 1. 正文 */}
        <View style={styles.section}>
          <TextInput
            mode="outlined"

            label="正文"
            multiline

            textAlignVertical="top"

            contentStyle={styles.contentInputInner}

            style={styles.contentInput}
            placeholder="分享这个时光故事背后的故事..."
            value={content}
            onChangeText={setContent}
            maxLength={STORY_CONTENT_MAX}
            theme={inputTheme}
          />
          <Text variant="bodySmall" style={styles.counter}>
            {content.length}/{STORY_CONTENT_MAX}
          </Text>
        </View>

        {/* 2. 话题标签 */}
        <View style={styles.section}>
          <Text variant="titleSmall" style={styles.sectionTitle}>
            添加话题标签
          </Text>
          <Text variant="bodySmall" style={styles.sectionHint}>
            最多 {STORY_TAG_MAX_COUNT} 个
          </Text>

          <View style={styles.tagRow}>
            {STORY_TOPIC_PRESETS.map(tag => {
              const active = tags.includes(tag);
              return (
                <Pressable key={tag} onPress={() => toggleTag(tag)}>
                  <Text style={[styles.tagChip, active && styles.tagChipActive]}>#{tag}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* 自定义标签 */}
          <View style={styles.customTagRow}>
            <TextInput
              mode="outlined"
              dense
              label="自定义标签"
              placeholder="添加话题标签"
              value={customTag}
              onChangeText={setCustomTag}
              maxLength={STORY_TAG_MAX_LENGTH}
              style={styles.customTagInput}
              theme={inputTheme}
            />
            <Button
              mode="outlined"
              onPress={addCustomTag}
              disabled={!customTag.trim()}
              style={styles.customTagButton}
              contentStyle={styles.customTagButtonInner}
            >
              添加
            </Button>
          </View>

          {/* 已选的自定义标签（预设的已经在上面高亮了） */}
          {tags.filter(tag => !STORY_TOPIC_PRESETS.includes(tag as never)).length > 0 ? (
            <View style={styles.tagRow}>
              {tags
                .filter(tag => !STORY_TOPIC_PRESETS.includes(tag as never))
                .map(tag => (
                  <Pressable key={tag} onPress={() => toggleTag(tag)}>
                    <Text style={[styles.tagChip, styles.tagChipActive]}>
                      #{tag}　✕
                    </Text>
                  </Pressable>
                ))}
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* 底部：发布 */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
        <Button
          mode="contained"
          onPress={handlePublish}
          disabled={!canPublish}
          loading={publishing}
          style={styles.publishButton}
          contentStyle={styles.publishButtonInner}
        >
          发布
        </Button>
      </View>

      {/* 这里**不能**再挂 `FloatingBar` —— 顶部那行头部里已经有返回按钮了，
          加了会变成两个返回键并排（详情页踩过一次）。 */}

      {/* 选事件 */}
      <BottomSheet
        visible={pickerOpen}
        title="选择事件"
        onDismiss={() => setPickerOpen(false)}
        heightRatio={0.6}
      >
        {sortedEvents.length === 0 ? (
          <View style={styles.sheetEmpty}>
            <Text variant="bodyMedium" style={styles.sheetEmptyText}>
              你还没有记录任何事件
            </Text>
            <Button
              mode="contained"
              onPress={() => {
                setPickerOpen(false);
                navigation.navigate('AddEvent');
              }}
              style={styles.sheetEmptyButton}
              contentStyle={styles.sheetEmptyButtonInner}
            >
              去记一个
            </Button>
          </View>
        ) : (
          <FlatList
            data={sortedEvents}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <List.Item
                title={item.title}
                description={formatFullDate(item.targetDateTime)}
                left={() => <Text style={styles.sheetItemIcon}>{item.icon}</Text>}
                onPress={() => {
                  setSelected(item);
                  setPickerOpen(false);
                }}
              />
            )}
          />
        )}
      </BottomSheet>
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


  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  eventCard: {

    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: palette.peachLine20,
  },
  eventIcon: {
    fontSize: 32,
  },
  eventBody: {
    flex: 1,
    gap: 2,
  },
  eventTitle: {
    color: palette.cocoa,
    fontWeight: '700',
  },
  eventPlaceholder: {
    color: palette.cocoa,
    fontWeight: '600',
  },
  eventHint: {
    color: palette.cocoaFaint,
  },
  eventMeta: {
    color: palette.peachDeep,
    fontWeight: '600',
  },
  eventAction: {
    color: palette.peachDeep,
    fontWeight: '700',
  },


  section: {
    gap: spacing.sm,
  },
  contentInput: {
    backgroundColor: '#FFFFFF',
    minHeight: 140,
  },
  contentInputInner: {

    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  counter: {
    alignSelf: 'flex-end',
    color: palette.cocoaFaint,
  },


  sectionTitle: {
    color: palette.cocoa,
    fontWeight: '700',
  },
  sectionHint: {
    color: palette.cocoaFaint,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tagChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: palette.peachTint,
    color: palette.cocoaSoft,
    fontSize: 14,
    overflow: 'hidden',
  },
  tagChipActive: {
    backgroundColor: palette.peach,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  customTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  customTagInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  customTagButton: {
    borderRadius: radius.md,
  },
  customTagButtonInner: {
    height: 40,
    paddingHorizontal: spacing.md,
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
  publishButton: {
    borderRadius: radius.md,
  },
  publishButtonInner: {
    height: 44,
  },


  sheetEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  sheetEmptyText: {
    color: palette.cocoaFaint,
  },
  sheetEmptyButton: {
    borderRadius: radius.md,
  },
  sheetEmptyButtonInner: {
    height: 44,
    paddingHorizontal: spacing.lg,
  },
  sheetItemIcon: {
    fontSize: 24,
    alignSelf: 'center',
    marginLeft: spacing.lg,
  },
});

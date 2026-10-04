import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Divider, IconButton, Text, TouchableRipple } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import FloatingBar, { FloatingButton } from '../components/FloatingBar';
import CountdownCard from '../components/CountdownCard';
import SettingRow from '../components/SettingRow';
import Switch from '../components/Switch';
import { DateWheelPicker } from '../components/DateTimePicker';
import { useFeedback } from '../components/feedback';
import { useTick } from '../hooks/useTick';
import { CONTENT_CLEARANCE, FLOATING_CLEARANCE } from '../navigation/layout';
import { useCategoryStore } from '../store/useCategoryStore';
import { useEventStore } from '../store/useEventStore';
import { palette, radius, spacing } from '../theme';
import type { EventItem } from '../types/event';
import type { RootStackParamList } from '../navigation/types';
import { calcCountdown } from '../utils/countdown';

/**
 * 事件详情（Slice 05）
 *
 * 结构照搬旧版 `legacy/uniapp/pages/detail/detail.vue`：
 *   顶部胶囊（返回 / 导出 / 编辑）
 *   日历风倒计时大卡（标题 / 进度条 / 倒计时 / 目标日期 + 星期）
 *   进度设置（仅未过去时）→ 基本信息 → 日期时间 → 备注
 *   底部删除
 *
 * 倒计时每秒刷新：复用全局的 `useTick`，不另开定时器。
 * 文字颜色 / 背景色 / 卡片大小 / 置顶这些改动**不在详情页做**，
 * 统一回编辑页改（详情页只做「进度设置」这一项即时保存）。
 *
 * 大卡本身在 `components/CountdownCard.tsx`，导出页用的是**同一个组件**
 * （那边传 `scale` 缩放），所以两边显示必然一致。
 */

type Props = NativeStackScreenProps<RootStackParamList, 'EventDetail'>;

const pad2 = (value: number) => String(value).padStart(2, '0');

/** 日期时间区：`YYYY-MM-DD`，开了精准时间再补 ` HH:mm`（照搬旧版 formatFullDate） */
function formatFullDate(event: EventItem): string {
  const date = new Date(event.targetDateTime);
  const text = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  return event.showPreciseTime ? `${text} ${event.time}` : text;
}

/** 开始时间显示：startDateTime → createTime → "未设置"（照搬旧版 formatStartDate） */
function formatStartDate(event: EventItem): string {
  const source = event.startDateTime ?? event.createTime;
  if (!source) return '未设置';
  const date = new Date(source);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export default function EventDetailScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const insets = useSafeAreaInsets();
  const { toast, loading, confirm } = useFeedback();


  const tick = useTick();

  const loaded = useEventStore(state => state.loaded);
  const event = useEventStore(state => state.events.find(item => item.id === id));
  const categories = useCategoryStore(state => state.all);


  const [startDateOpen, setStartDateOpen] = useState(false);


  useEffect(() => {
    if (loaded && !event) {
      toast('事件不存在');
      const timer = setTimeout(() => navigation.goBack(), 1200);
      return () => clearTimeout(timer);
    }
  }, [loaded, event, navigation, toast]);


  const applyPatch = async (next: Partial<EventItem>) => {
    const result = await useEventStore.getState().update(id, next);
    if (!result.ok) {
      toast(result.reason);
      return;
    }
    // TODO(Slice 10)：这里接云端更新同步
  };

  if (!event) {
    return (
      <View style={styles.root}>
        <FloatingBar
          left={
            <FloatingButton
              icon="arrow-left"
              onPress={() => navigation.goBack()}
              accessibilityLabel="返回"
            />
          }
        />
        <View style={styles.missing}>
          <MaterialCommunityIcons name="calendar-remove" size={56} color={palette.mauve} />
          <Text variant="bodyMedium" style={styles.missingText}>
            事件不存在
          </Text>
        </View>
      </View>
    );
  }


  void tick;
  const countdown = calcCountdown(event.targetDateTime, event.showPreciseTime);

  const category = categories.find(item => item.key === event.category);
  const categoryName = category?.name ?? '其他';


  const handleDelete = async () => {
    const ok = await confirm({
      title: '确认删除',
      message: `确定要删除「${event.title}」吗？此操作不可恢复`,
      confirmText: '删除',
    });
    if (!ok) return;

    loading(true, '删除中…');
    try {
      await useEventStore.getState().remove(id);
      // TODO(Slice 10)：这里接云端删除同步（旧版 syncOnDeleteEvent）
    } finally {
      loading(false);
    }

    toast('删除成功');

    setTimeout(() => navigation.goBack(), 800);
  };


  return (
    <View style={styles.root}>
      {/* 顶部悬浮按钮：返回 / 导出 / 编辑 */}
      <FloatingBar
        left={
          <FloatingButton
            icon="arrow-left"
            onPress={() => navigation.goBack()}
            accessibilityLabel="返回"
          />
        }
        right={
          <>
            <FloatingButton
              icon="export-variant"
              onPress={() => navigation.navigate('Export', { id: event.id })}
              accessibilityLabel="导出"
            />
            <FloatingButton
              icon="pencil-outline"
              onPress={() => navigation.navigate('AddEvent', { id: event.id })}
              accessibilityLabel="编辑"
            />
          </>
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {

            paddingTop: insets.top + FLOATING_CLEARANCE,
            paddingBottom: insets.bottom + spacing.xxl,
          },
        ]}
      >
        {/* 日历风倒计时大卡（与导出页共用同一个组件） */}
        <CountdownCard event={event} withShadow />

        {/* 进度设置：只在未过去时可设 */}
        {!countdown.isPast ? (
          <Section title="进度设置">
            <SettingRow
              icon="chart-box-outline"
              title="显示进度条"
              right={
                <Switch
                  value={Boolean(event.showProgressBar)}
                  onValueChange={value => void applyPatch({ showProgressBar: value })}
                />
              }
            />
            {event.showProgressBar ? (
              <>
                <Divider />
                <SettingRow
                  icon="calendar-start"
                  title="开始时间"
                  right={
                    <View style={styles.rowValue}>
                      <Text variant="bodyMedium" style={styles.rowValueText}>
                        {formatStartDate(event)}
                      </Text>
                      <MaterialCommunityIcons
                        name="chevron-right"
                        size={20}
                        color={palette.mauveLight}
                      />
                    </View>
                  }
                  onPress={() => setStartDateOpen(true)}
                />
              </>
            ) : null}
          </Section>
        ) : null}

        {/* 基本信息 */}
        <Section title="基本信息">
          <InfoRow
            label="事件名称"
            value={
              <View style={styles.nameValue}>
                <Text style={styles.eventIcon}>{event.icon}</Text>
                <Text variant="bodyMedium" style={styles.eventName}>
                  {event.title}
                </Text>
              </View>
            }
          />
          <Divider />
          <InfoRow
            label="事件分类"
            value={
              <View style={styles.tag}>
                {category?.icon ? (
                  <Text variant="bodySmall" style={styles.tagIcon}>
                    {category.icon}
                  </Text>
                ) : null}
                <Text variant="bodySmall" style={styles.tagText}>
                  {categoryName}
                </Text>
              </View>
            }
          />
        </Section>

        {/* 日期时间 */}
        <Section title="日期时间">
          <InfoRow label="日历类型" value={event.calendarType === 'lunar' ? '农历' : '公历'} />
          <Divider />
          <InfoRow label="目标日期" value={formatFullDate(event)} />
          {event.lunarInfo ? (
            <>
              <Divider />
              <InfoRow label="农历日期" value={event.lunarInfo.fullDate} />
            </>
          ) : null}
          <Divider />
          <InfoRow label="精准时间" value={event.showPreciseTime ? event.time : '未开启'} />
          <Divider />
          <InfoRow label="显示秒数" value={event.showSeconds ? '是' : '否'} />
        </Section>

        {/* 备注 */}
        {event.remark ? (
          <Section title="备注">
            <Text variant="bodyMedium" style={styles.remark}>
              {event.remark}
            </Text>
          </Section>
        ) : null}

        {/* 底部删除 */}
        <TouchableRipple onPress={handleDelete} style={styles.delete} borderless>
          <View style={styles.deleteInner}>
            <MaterialCommunityIcons name="trash-can-outline" size={20} color={palette.danger} />
            <Text variant="bodyLarge" style={styles.deleteText}>
              删除事件
            </Text>
          </View>
        </TouchableRipple>
      </ScrollView>

      {/* 开始时间选择器（进度设置的「开始时间」用） */}
      <DateWheelPicker
        visible={startDateOpen}
        value={startDateOf(event)}
        onConfirm={date => {
          setStartDateOpen(false);
          void applyPatch({ startDateTime: `${date}T00:00:00` });
          toast('开始时间已更新');
        }}
        onDismiss={() => setStartDateOpen(false)}
      />
    </View>
  );
}

/** DateWheelPicker 的初值：`YYYY-MM-DD` */
function startDateOf(event: EventItem): string {
  const source = event.startDateTime ?? event.createTime;
  if (!source) {
    const date = new Date(event.targetDateTime);
    date.setFullYear(date.getFullYear() - 1);
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }
  const date = new Date(source);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}



/** 带标题的信息区块 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="titleSmall" style={styles.sectionTitle}>
        {title}
      </Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

/** 只读信息行：左标签、右值 */
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <View style={styles.infoRow}>
      <Text variant="bodyMedium" style={styles.infoLabel}>
        {label}
      </Text>
      <View style={styles.infoValue}>
        {typeof value === 'string' ? (
          <Text variant="bodyMedium" style={styles.infoValueText}>
            {value}
          </Text>
        ) : (
          value
        )}
      </View>
    </View>
  );
}

/** 顶部胶囊右侧要放两个图标（导出 + 编辑），槽位相应加宽 */
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.cream,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    // 顶/底避让在渲染处按安全区算，这里不重复叠加
  },
  headerButton: {
    margin: 0,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  missingText: {
    color: palette.cocoaFaint,
  },


  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    paddingLeft: spacing.sm,
    color: palette.cocoa,
    fontWeight: '600',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    overflow: 'hidden',
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  infoLabel: {
    color: palette.cocoaSoft,
  },
  infoValue: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoValueText: {
    color: palette.cocoa,
    fontWeight: '500',
  },

  rowValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginRight: spacing.md,
  },
  rowValueText: {
    color: palette.cocoa,
  },

  nameValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  eventIcon: {
    fontSize: 20,
  },
  eventName: {
    color: palette.cocoa,
    fontWeight: '600',
    flexShrink: 1,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: palette.peachLine15,
  },
  tagIcon: {
    marginRight: 1,
  },
  tagText: {
    color: palette.peachDeep,
    fontWeight: '500',
  },

  remark: {
    padding: spacing.lg,
    color: palette.cocoaSoft,
    lineHeight: 22,
  },


  delete: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  deleteInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    backgroundColor: palette.dangerSoft,
  },
  deleteText: {
    color: palette.danger,
    fontWeight: '600',
  },
});

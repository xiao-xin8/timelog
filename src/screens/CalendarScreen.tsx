import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import MonthGrid from '../components/MonthGrid';
import { TEXT_COLOR_OPTIONS } from '../constants';
import { CONTENT_CLEARANCE, TOP_CONTENT_GAP } from '../navigation/layout';
import { useCategoryStore } from '../store/useCategoryStore';
import { useEventStore } from '../store/useEventStore';
import {
  eventCardGradient,
  monthProgressGradient,
  palette,
  primaryGradient,
  radius,
  spacing,
  yearProgressGradient,
} from '../theme';
import type { EventItem } from '../types/event';
import type { RootStackParamList } from '../navigation/types';
import { calcCountdown, isSameDay, toDateKey } from '../utils/countdown';

/**
 * 时光日历（Slice 06）
 *
 * 结构与规则全部照搬旧版 `legacy/uniapp/pages/calendar/`：
 *   月份切换器（← 年月 今 →）→ 星期 + 6×7 网格 → 本月/本年进度 → 选中日事件列表
 *
 * 几个容易搞错的旧版行为，这里保持一致：
 *   - **周日开始**（不是周一开头）
 *   - 切月**不会**改选中日期，也不会让新月份里任何一格处于选中态
 *   - 补位格只显示公历日号，不显示农历
 *   - 圆点最多 3 个，超出直接截断，没有「+N」
 *   - 「本月 / 本年」进度按**真实的今天**算，与当前显示的是哪个月无关
 *   - 事件按 `targetDateTime` 的公历日期归组（不管它是不是农历类型）
 */

const WEEKDAYS_FULL = [
  '星期日',
  '星期一',
  '星期二',
  '星期三',
  '星期四',
  '星期五',
  '星期六',
] as const;

/** 事件圆点/文字颜色，规则照搬旧版 `getEventColor`（含旧数据兜底字段 `color`） */
function eventColorOf(event: EventItem): string {
  const key = event.textColor || event.color || 'default';
  return TEXT_COLOR_OPTIONS.find(option => option.key === key)?.value ?? '#007AFF';
}

/** 十六进制色 + 透明度 → `rgba()`，用于事件图标底色（旧版 15% 透明） */
function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map(char => char + char).join('') : value;
  const r = parseInt(full.substring(0, 2), 16);
  const g = parseInt(full.substring(2, 4), 16);
  const b = parseInt(full.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const EMPTY_EVENTS: EventItem[] = [];

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const events = useEventStore(state => state.events);
  const categories = useCategoryStore(state => state.all);

  /** 「今天」在页面存活期间固定为进入时那一天 */
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [selected, setSelected] = useState<Date>(today);
  /** 切月时 +1，用来重挂网格重播淡入（旧版是换 `:key`） */
  const [gridKey, setGridKey] = useState(0);


  const eventsByDate = useMemo(() => {
    const map = new Map<string, EventItem[]>();

    for (const event of events) {
      const key = toDateKey(event.targetDateTime);
      const list = map.get(key);
      if (list) {
        list.push(event);
      } else {
        map.set(key, [event]);
      }
    }


    for (const list of map.values()) {
      list.sort((a, b) => Number(Boolean(b.isTop)) - Number(Boolean(a.isTop)));
    }

    return map;
  }, [events]);

  /** 圆点颜色：每天最多 3 个（旧版直接截断，不显示 +N） */
  const colorsByDate = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const [key, list] of eventsByDate) {
      map.set(key, list.slice(0, 3).map(eventColorOf));
    }
    return map;
  }, [eventsByDate]);

  const selectedKey = toDateKey(selected);
  const selectedEvents = eventsByDate.get(selectedKey) ?? EMPTY_EVENTS;


  const monthProgress = useMemo(() => {
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    return Math.round((today.getDate() / daysInMonth) * 100);
  }, [today]);

  const yearProgress = useMemo(() => {
    const startOfYear = new Date(today.getFullYear(), 0, 1);
    const endOfYear = new Date(today.getFullYear() + 1, 0, 1);
    const totalDays = (endOfYear.getTime() - startOfYear.getTime()) / 86400000;
    const passedDays = (today.getTime() - startOfYear.getTime()) / 86400000;
    return Math.round((passedDays / totalDays) * 100);
  }, [today]);

  const showBackToToday =
    year !== today.getFullYear() || month !== today.getMonth() + 1;

  const selectedDateText = `${selected.getMonth() + 1}月${selected.getDate()}日 ${
    WEEKDAYS_FULL[selected.getDay()]
  }${isSameDay(selected, today) ? ' 今天' : ''}`;


  const shiftMonth = useCallback(
    (delta: number) => {
      let nextYear = year;
      let nextMonth = month + delta;

      if (nextMonth < 1) {
        nextMonth = 12;
        nextYear -= 1;
      } else if (nextMonth > 12) {
        nextMonth = 1;
        nextYear += 1;
      }

      setYear(nextYear);
      setMonth(nextMonth);
      setGridKey(key => key + 1);
    },
    [year, month],
  );

  const backToToday = useCallback(() => {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
    setSelected(now);
    setGridKey(key => key + 1);
  }, []);

  const openDetail = useCallback(
    (event: EventItem) => {
      navigation.navigate('EventDetail', { id: event.id });
    },
    [navigation],
  );

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {

            paddingTop: insets.top + TOP_CONTENT_GAP,
            paddingBottom: insets.bottom + CONTENT_CLEARANCE,
          },
        ]}
      >
        {/* 月份切换器：← 2026年 / 10月 今 → */}
        <View style={styles.switcher}>
          <Pressable
            onPress={() => shiftMonth(-1)}
            style={styles.arrow}
            hitSlop={8}
            accessibilityLabel="上个月"
          >
            <MaterialCommunityIcons name="chevron-left" size={28} color={palette.cocoaSoft} />
          </Pressable>

          <View style={styles.monthDisplay}>
            <Text variant="bodyMedium" style={styles.monthYear}>
              {year}年
            </Text>
            <View style={styles.monthCenter}>
              <Text variant="displaySmall" style={styles.monthNum}>
                {month}月
              </Text>
              {showBackToToday ? (
                <Pressable
                  onPress={backToToday}
                  style={styles.todayButton}
                  accessibilityLabel="回到今天"
                >
                  <Text variant="bodySmall" style={styles.todayButtonText}>
                    今
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          <Pressable
            onPress={() => shiftMonth(1)}
            style={styles.arrow}
            hitSlop={8}
            accessibilityLabel="下个月"
          >
            <MaterialCommunityIcons name="chevron-right" size={28} color={palette.cocoaSoft} />
          </Pressable>
        </View>

        {/* 6 × 7 月历网格 */}
        <MonthGrid
          key={gridKey}
          year={year}
          month={month}
          selectedKey={selectedKey}
          today={today}
          colorsByDate={colorsByDate}
          onSelect={setSelected}
        />

        {/* 本月 / 本年进度 */}
        <View style={styles.progressSection}>
          <ProgressRow name="本月" percent={monthProgress} colors={monthProgressGradient} />
          <ProgressRow name="本年" percent={yearProgress} colors={yearProgressGradient} />
        </View>

        {/* 选中日期的事件列表 */}
        <View style={styles.eventsSection}>
          <View style={styles.dateHeader}>
            <View style={styles.dateLine} />
            <Text variant="bodyMedium" style={styles.dateHeaderText}>
              {selectedDateText}
            </Text>
            <View style={styles.dateLine} />
          </View>

          {selectedEvents.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📅</Text>
              <Text variant="bodyMedium" style={styles.emptyText}>
                这一天没有事件
              </Text>
            </View>
          ) : (
            <View style={styles.eventsList}>
              {selectedEvents.map(event => (
                <EventRow
                  key={event.id}
                  event={event}
                  categoryName={
                    categories.find(item => item.key === event.category)?.name ?? '其他'
                  }
                  onPress={openDetail}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}



/** 进度条一行：名称 + 百分比 + 渐变填充 */
function ProgressRow({
  name,
  percent,
  colors,
}: {
  name: string;
  percent: number;
  colors: readonly [string, string];
}) {
  return (
    <View style={styles.progressItem}>
      <View style={styles.progressLabel}>
        <Text variant="bodySmall" style={styles.progressName}>
          {name}
        </Text>
        <Text variant="bodySmall" style={styles.progressValue}>
          {percent}%
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <LinearGradient
          colors={colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.progressFill, { width: `${percent}%` }]}
        />
      </View>
    </View>
  );
}

/** 事件行：图标 + 标题/分类 + 倒计时，下面一行是日历类型与目标日期 */
function EventRow({
  event,
  categoryName,
  onPress,
}: {
  event: EventItem;
  categoryName: string;
  onPress(event: EventItem): void;
}) {
  const color = eventColorOf(event);
  const countdown = calcCountdown(event.targetDateTime, false);
  const target = new Date(event.targetDateTime);
  const targetText = `${target.getFullYear()}年${target.getMonth() + 1}月${target.getDate()}日`;

  return (
    <Pressable
      onPress={() => onPress(event)}
      style={styles.eventPress}
      android_ripple={{ color: palette.peachSoft }}
    >
      <LinearGradient
        colors={eventCardGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.eventCard}
      >
        {event.isTop ? (
          <LinearGradient
            colors={primaryGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.topBadge}
          >
            <Text variant="labelSmall" style={styles.topBadgeText}>
              置顶
            </Text>
          </LinearGradient>
        ) : null}

        <View style={styles.eventMain}>
          <View style={[styles.eventIconWrapper, { backgroundColor: withAlpha(color, 0.15) }]}>
            <Text style={styles.eventIcon}>{event.icon}</Text>
          </View>

          <View style={styles.eventInfo}>
            <Text variant="bodyLarge" style={styles.eventTitle} numberOfLines={1}>
              {event.title}
            </Text>
            <View style={styles.eventMeta}>
              <Text variant="bodySmall" style={styles.eventCategory}>
                {categoryName}
              </Text>
              {event.remark ? (
                <Text variant="bodySmall" style={styles.eventNote} numberOfLines={1}>
                  {event.remark}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.eventCountdown}>
            <Text variant="bodySmall" style={[styles.countdownLabel, { color }]}>
              {countdown.isPast ? '已过' : '还有'}
            </Text>
            <Text variant="titleLarge" style={[styles.countdownDays, { color }]}>
              {countdown.days}
            </Text>
            <Text variant="bodySmall" style={styles.countdownUnit}>
              天
            </Text>
          </View>
        </View>

        <View style={styles.eventDateDetail}>
          <View style={styles.dateLabel}>
            <Text variant="labelSmall" style={styles.dateLabelText}>
              {event.calendarType === 'lunar' ? '农历' : '公历'}
            </Text>
          </View>
          <Text variant="bodySmall" style={styles.dateValue}>
            {targetText}
          </Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.cream,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.md,
    gap: spacing.lg,
    // 顶/底避让在渲染处按安全区算，这里不重复叠加
  },


  switcher: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  arrow: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  monthDisplay: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  monthYear: {
    color: palette.mauveLight,
  },
  monthCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  monthNum: {
    fontWeight: '700',
    color: palette.cocoa,
  },

  todayButton: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: palette.peach,
  },
  todayButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },


  progressSection: {
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
  },
  progressItem: {
    gap: spacing.xs,
  },
  progressLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressName: {
    color: palette.cocoaSoft,
  },
  progressValue: {
    color: palette.cocoaSoft,
    fontWeight: '600',
  },
  progressTrack: {
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: palette.peachLine20,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.pill,
  },


  eventsSection: {
    gap: spacing.md,
  },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dateLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.peachLine20,
  },
  dateHeaderText: {
    color: palette.cocoa,
    fontWeight: '500',
  },

  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyIcon: {
    fontSize: 32,
  },
  emptyText: {
    color: palette.mauveLight,
  },

  eventsList: {
    gap: spacing.sm,
  },
  eventPress: {
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.peachLine15,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },

  eventCard: {
    flex: 1,
  },


  topBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    zIndex: 1,
  },
  topBadgeText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },

  eventMain: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  eventIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventIcon: {
    fontSize: 18,
  },
  eventInfo: {
    flex: 1,
    gap: 2,
  },
  eventTitle: {
    color: palette.cocoa,
    fontWeight: '600',
  },
  eventMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  eventCategory: {
    color: palette.mauveLight,
  },
  eventNote: {
    flex: 1,
    color: palette.mauveLight,
  },
  eventCountdown: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  countdownLabel: {
    opacity: 0.9,
  },
  countdownDays: {
    fontWeight: '700',
  },
  countdownUnit: {
    color: palette.mauve,
  },

  eventDateDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  dateLabel: {
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: palette.peachLine15,
  },
  dateLabelText: {
    color: palette.peach,
    fontWeight: '500',
  },
  dateValue: {
    color: palette.cocoaSoft,
  },
});

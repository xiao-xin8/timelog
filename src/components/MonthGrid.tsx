import React, { memo, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from 'react-native-paper';

import { cardGradient, palette, primaryGradient, radius, spacing } from '../theme';
import { getSolarTerm, solarToLunar } from '../utils/lunar';
import { isSameDay, toDateKey } from '../utils/countdown';



/** 固定 6 行 × 7 列 */
const CELL_COUNT = 42;
const COLUMNS = 7;

/** 星期标题，**周日开始**（照搬旧版） */
const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六'] as const;

interface Props {
  /** 公元年，如 2026 */
  year: number;
  /** 月，1-12 */
  month: number;
  /** 选中的日期（`YYYY-MM-DD`） */
  selectedKey: string;
  /** 「今天」，用于高亮 */
  today: Date;
  /** `YYYY-MM-DD` → 该天的事件颜色（调用方已截断到 3 个） */
  colorsByDate: Map<string, string[]>;
  onSelect(date: Date): void;
}

/** 网格里的一格 */
interface CellData {
  date: Date;
  /** 是否属于当前显示的月份 */
  isCurrentMonth: boolean;
  /** 农历/节气要显示的文案，补位格为空串 */
  lunarText: string;
  /** 该文案是不是节气（节气要加重显示） */
  isSolarTerm: boolean;
}

/**
 * 生成 42 格数据
 *
 * 补位规则照搬旧版 `generateCalendarDays`：前面补上月尾部，
 * 后面把下月开头补到满 42 格为止。
 */
function buildCells(year: number, month: number): CellData[] {
  const cells: CellData[] = [];

  const push = (date: Date, isCurrentMonth: boolean) => {
    let lunarText = '';
    let isSolarTerm = false;


    if (isCurrentMonth) {
      const term = getSolarTerm(date);
      if (term) {
        lunarText = term;
        isSolarTerm = true;
      } else {
        const lunar = solarToLunar(date);
        if (lunar) {

          lunarText = lunar.dayName === '初一' ? lunar.monthName : lunar.dayName;
        }
      }
    }

    cells.push({ date, isCurrentMonth, lunarText, isSolarTerm });
  };


  const startDayOfWeek = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysInPrevMonth = new Date(year, month - 1, 0).getDate();


  for (let i = startDayOfWeek - 1; i >= 0; i -= 1) {
    push(new Date(year, month - 2, daysInPrevMonth - i), false);
  }


  for (let day = 1; day <= daysInMonth; day += 1) {
    push(new Date(year, month - 1, day), true);
  }


  for (let day = 1; cells.length < CELL_COUNT; day += 1) {
    push(new Date(year, month, day), false);
  }

  return cells;
}



interface CellProps {
  cell: CellData;
  isToday: boolean;
  isSelected: boolean;
  colors: string[];
  onPress(date: Date): void;
}

function DayCell({ cell, isToday, isSelected, colors, onPress }: CellProps) {
  const { date, isCurrentMonth, lunarText, isSolarTerm } = cell;

  const body = (
    <View style={styles.cellBody}>
      <Text variant="titleLarge" style={[styles.solar, isToday && styles.onToday]}>
        {date.getDate()}
      </Text>

      {lunarText ? (
        <Text
          variant="bodySmall"
          numberOfLines={1}
          style={[
            styles.lunar,

            isToday && styles.onToday,
            isSolarTerm && styles.lunarTerm,
          ]}
        >
          {lunarText}
        </Text>
      ) : null}

      {colors.length > 0 ? (
        <View style={styles.dots}>
          {colors.map((color, index) => (
            <View key={index} style={[styles.dot, { backgroundColor: color }]} />
          ))}
        </View>
      ) : null}
    </View>
  );

  return (
    <Pressable
      onPress={() => onPress(date)}
      style={[styles.cell, !isCurrentMonth && styles.cellMuted]}
      android_ripple={{ color: palette.peachSoft }}
    >
      {/* 今天：蜜桃渐变；选中（非今天）：粉色渐变 + 蜜桃描边（旧版的两种高亮） */}
      {isToday ? (
        <LinearGradient
          colors={primaryGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fill}
        >
          {body}
        </LinearGradient>
      ) : isSelected ? (
        <LinearGradient
          colors={cardGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.fill, styles.fillSelected]}
        >
          {body}
        </LinearGradient>
      ) : (
        body
      )}
    </Pressable>
  );
}

const DayCellMemo = memo(DayCell);



function MonthGrid({ year, month, selectedKey, today, colorsByDate, onSelect }: Props) {
  const cells = useMemo(() => buildCells(year, month), [year, month]);

  /**
   * 进场淡入
   *
   * 旧版是切月时换 `:key` 重挂网格、靠 CSS 动画淡入；这里同样靠父组件换 key
   * 重挂本组件，再用 `useEffect` 播一次 `opacity + translateY`（都支持原生驱动）。
   */
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [enter]);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: enter,
          transform: [
            { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) },
          ],
        },
      ]}
    >
      {/* 星期标题 */}
      <View style={styles.weekHeader}>
        {WEEK_LABELS.map(label => (
          <Text key={label} variant="bodyMedium" style={styles.weekLabel}>
            {label}
          </Text>
        ))}
      </View>

      {/* 6 × 7 网格 */}
      <View style={styles.grid}>
        {cells.map(cell => {
          const key = toDateKey(cell.date);
          return (
            <DayCellMemo
              key={key}
              cell={cell}
              isToday={isSameDay(cell.date, today)}
              isSelected={key === selectedKey}
              colors={colorsByDate.get(key) ?? EMPTY_COLORS}
              onPress={onSelect}
            />
          );
        })}
      </View>
    </Animated.View>
  );
}

/** 空数组常量，避免每次渲染新建（配合 memo） */
const EMPTY_COLORS: string[] = [];

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },

  weekHeader: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xs,
  },
  weekLabel: {

    width: `${100 / COLUMNS}%`,
    textAlign: 'center',
    color: palette.mauve,
    fontWeight: '500',
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },

  cell: {
    width: `${100 / COLUMNS}%`,

    padding: 1,
    aspectRatio: 1,
  },

  cellMuted: {
    opacity: 0.4,
  },


  fill: {
    flex: 1,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },

  fillSelected: {
    borderWidth: 1,
    borderColor: palette.peach,
  },

  cellBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    gap: 2,
  },

  solar: {
    fontWeight: '600',
    color: palette.cocoaSoft,
  },
  lunar: {
    color: palette.mauveLight,
  },

  lunarTerm: {
    fontWeight: '700',
    color: palette.peachDeep,
  },

  onToday: {
    color: '#FFFFFF',
  },

  dots: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 1,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: radius.pill,
  },
});

export default memo(MonthGrid);

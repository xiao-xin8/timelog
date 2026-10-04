import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  View,
} from 'react-native';
import { Button, Text } from 'react-native-paper';

import BottomSheet from './BottomSheet';
import { dialogButtonStyle, palette, radius, spacing } from '../theme';
import {
  LUNAR_DAY_NAMES,
  LUNAR_MAX_YEAR,
  LUNAR_MIN_YEAR,
  buildLunarInfo,
  clampLunarDay,
  getDaysInLunarMonth,
  getLunarMonthsInYear,
  lunarToSolar,
  solarToLunar,
} from '../utils/lunar';
import type { LunarInfo } from '../types/event';





/**
 * 单行高度
 *
 * 44 → 48：行更高一点，手指更好拨，吸附后的落点也更宽容。
 */
const ITEM_HEIGHT = 48;

/** 可视行数（奇数，中间那行即选中项） */
const VISIBLE_ROWS = 5;

/** 首尾留白，让第一项和最后一项也能滚到中间 */
const PAD = (ITEM_HEIGHT * (VISIBLE_ROWS - 1)) / 2;

/**
 * 松手后如果一直没等到 `onMomentumScrollEnd`，多久就自己收尾
 *
 * 手指划得很慢再松手（速度≈0）时，Android 有时只给 snap、不给惯性滚动，
 * `onMomentumScrollEnd` 不触发 —— 没有这个兜底，选中值就永远提交不出去，
 * 面板会一直停在旧值上。
 */
const SETTLE_FALLBACK = 260;

interface WheelProps {
  items: string[];
  index: number;
  onChange(index: number): void;
  /** 同一行里各列的宽度权重（年列比月/日宽一点） */
  flex: number;
}

function Wheel({ items, index, onChange, flex }: WheelProps) {
  const ref = useRef<FlatList<string>>(null);
  /** 本地高亮到第几行。只驱动样式，不往父级提交 —— 见下面的说明 */
  const [live, setLive] = useState(index);
  /** 已知的当前行。用 ref 避免在 onScroll 里读闭包里的旧值 */
  const liveRef = useRef(index);
  /** 最新的滚动偏移，兜底收尾时要用真实值，不能拿行号反推 */
  const offsetRef = useRef(index * ITEM_HEIGHT);
  /** 手指 / 惯性 / snap 还在进行中，期间不接受外部 index 回推 */
  const settling = useRef(false);
  /** 最近一次由**我们自己**提交出去的值，用来识别父级的回声 */
  const selfReported = useRef(index);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clamp = useCallback(
    (value: number) => Math.min(items.length - 1, Math.max(0, value)),
    [items.length],
  );

  /**
   * 收尾：停稳之后统一做三件事
   *
   * 1. 把偏移对齐到行高倍数（`drift > 1` 才用 animated，避免无谓的抖动）
   * 2. 清掉「进行中」标记
   * 3. **这时才**把值提交给父级
   */
  const settle = useCallback(
    (offsetY: number) => {
      if (settleTimer.current) {
        clearTimeout(settleTimer.current);
        settleTimer.current = null;
      }

      const target = clamp(Math.round(offsetY / ITEM_HEIGHT));
      const drift = Math.abs(offsetY - target * ITEM_HEIGHT);


      if (drift > 1) {
        ref.current?.scrollToOffset({
          offset: target * ITEM_HEIGHT,
          animated: true,
        });
      }

      settling.current = false;

      if (liveRef.current !== target) {
        liveRef.current = target;
        setLive(target);
      }
      if (target !== index) {
        selfReported.current = target;
        onChange(target);
      }
    },
    [clamp, index, onChange],
  );


  useEffect(() => {
    if (settling.current) return;
    if (index === selfReported.current) return;

    liveRef.current = index;
    setLive(index);

    selfReported.current = index;
    offsetRef.current = index * ITEM_HEIGHT;

    const timer = setTimeout(() => {
      ref.current?.scrollToOffset({ offset: index * ITEM_HEIGHT, animated: false });
    }, 0);
    return () => clearTimeout(timer);
  }, [index]);

  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    [],
  );

  /**
   * 拖动过程中只更新本地高亮，**不通知父级**
   *
   * 之前是边拖边 `onChange`，于是父级的 `days` / `index` 一直变，
   * 反馈环就闭上了：滚动 → 父级 → 回推 → 打断滚动。
   * 而且 `days` 的长度会随月变化（28/29/30/31），列表数据在滚动中途被换掉，
   * 本身就是另一个「跳」。
   *
   * 只改本地 state 高亮不会有任何副作用，等停稳了再提交一次。
   */
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = event.nativeEvent.contentOffset.y;
      offsetRef.current = offsetY;

      const next = clamp(Math.round(offsetY / ITEM_HEIGHT));
      if (next === liveRef.current) return;
      liveRef.current = next;
      setLive(next);
    },
    [clamp],
  );

  const handleMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      offsetRef.current = event.nativeEvent.contentOffset.y;
      settle(offsetRef.current);
    },
    [settle],
  );

  /**
   * 松手时先立一个兜底计时器
   *
   * 有惯性滚动时它会被 `onMomentumScrollEnd` 抢先清掉；
   * 没有惯性滚动（手指划得很慢再松手，`onMomentumScrollEnd` 不来）时由它兜底，
   * 否则选中值永远提交不出去，面板会停在旧值上。
   */
  const handleScrollEndDrag = useCallback(() => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      settleTimer.current = null;
      settle(offsetRef.current);
    }, SETTLE_FALLBACK);
  }, [settle]);

  return (
    <View style={[styles.wheel, { flex }]}>
      <FlatList
        ref={ref}
        data={items}
        keyExtractor={item => item}
        showsVerticalScrollIndicator={false}

        snapToOffsets={items.map((_, i) => i * ITEM_HEIGHT)}
        decelerationRate="fast"
        bounces={false}
        initialScrollIndex={index}
        getItemLayout={(_, i) => ({
          length: ITEM_HEIGHT,
          offset: ITEM_HEIGHT * i,
          index: i,
        })}
        contentContainerStyle={styles.wheelContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => {
          settling.current = true;
          if (settleTimer.current) {
            clearTimeout(settleTimer.current);
            settleTimer.current = null;
          }
        }}
        onScrollEndDrag={handleScrollEndDrag}
        onMomentumScrollEnd={handleMomentumEnd}
        renderItem={({ item, index: i }) => (
          <View style={styles.wheelItem}>
            <Text
              variant={i === live ? 'headlineSmall' : 'titleMedium'}
              style={[styles.wheelText, i === live && styles.wheelTextActive]}
              allowFontScaling={false}
            >
              {item}
            </Text>
          </View>
        )}
      />
    </View>
  );
}



const pad2 = (value: number) => String(value).padStart(2, '0');

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function parseDate(value: string): { year: number; month: number; day: number } {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (matched) {
    const year = Number(matched[1]);
    const month = Number(matched[2]);
    const day = Number(matched[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)) {
      return { year, month, day };
    }
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

function parseTime(value: string): { hour: number; minute: number } {
  const matched = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (matched) {
    const hour = Number(matched[1]);
    const minute = Number(matched[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return { hour, minute };
    }
  }
  return { hour: 0, minute: 0 };
}

/**
 * 底部按钮区
 *
 * 只放「确定」——关闭用右上角的叉，底下再摆一个「取消」是重复的。
 * 滚轮本身可随时拨动，取消没有任何意义。
 */
function SheetActions({ onConfirm }: { onConfirm(): void }) {
  return (
    <View style={styles.actions}>
      <Button
        mode="contained"
        onPress={onConfirm}
        style={dialogButtonStyle.button}
        contentStyle={dialogButtonStyle.content}
        labelStyle={dialogButtonStyle.label}
      >
        确定
      </Button>
    </View>
  );
}

/**
 * 三列 / 两列滚轮 + 居中指示条 + 单位行
 *
 * 列宽用 flex 权重而不是固定 dp：窄屏上也不会溢出。
 * 单位和滚轮**共用同一组权重**，所以永远对得齐（之前是写死 92 / 84，
 * 改列宽就容易歪）。
 */
function WheelGroup({
  columns,
  units,
}: {
  columns: { items: string[]; index: number; onChange(next: number): void; flex: number }[];
  units: string[];
}) {
  return (
    <View style={styles.group}>
      <View style={styles.wheelsRow}>
        {/* 指示条压在滚轮下面（先渲染 = 更靠底） */}
        <View style={styles.band} pointerEvents="none" />

        {columns.map((column, i) => (
          <Wheel
            key={i}
            items={column.items}
            index={column.index}
            onChange={column.onChange}
            flex={column.flex}
          />
        ))}
      </View>

      <View style={styles.unitsRow}>
        {units.map((unit, i) => (
          <Text
            key={unit}
            variant="bodySmall"
            style={[styles.unit, { flex: columns[i].flex }]}
            allowFontScaling={false}
          >
            {unit}
          </Text>
        ))}
      </View>
    </View>
  );
}



const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 201 }, (_, i) => THIS_YEAR - 100 + i);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export function DateWheelPicker({
  visible,
  value,
  onConfirm,
  onDismiss,
}: {
  visible: boolean;
  value: string;
  onConfirm(next: string): void;
  onDismiss(): void;
}) {
  const initial = useMemo(() => parseDate(value), [value]);
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [day, setDay] = useState(initial.day);

  useEffect(() => {
    if (visible) {
      const parsed = parseDate(value);
      setYear(parsed.year);
      setMonth(parsed.month);
      setDay(parsed.day);
    }
  }, [visible, value]);


  const maxDay = daysInMonth(year, month);
  useEffect(() => {
    if (day > maxDay) setDay(maxDay);
  }, [day, maxDay]);

  const days = Array.from({ length: maxDay }, (_, i) => i + 1);

  return (
    <BottomSheet
      visible={visible}
      title="选择日期"
      onDismiss={onDismiss}
      heightRatio={0.52}
      footer={
        <SheetActions onConfirm={() => onConfirm(`${year}-${pad2(month)}-${pad2(day)}`)} />
      }
    >
      <View style={styles.pickerBody}>
        <WheelGroup
          units={['年', '月', '日']}
          columns={[
            {
              items: YEARS.map(String),
              index: YEARS.indexOf(year),
              onChange: i => setYear(YEARS[i]),
              flex: 1.3,
            },
            { items: MONTHS.map(String), index: month - 1, onChange: i => setMonth(MONTHS[i]), flex: 1 },
            { items: days.map(String), index: day - 1, onChange: i => setDay(days[i]), flex: 1 },
          ]}
        />
      </View>
    </BottomSheet>
  );
}



const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

export function TimeWheelPicker({
  visible,
  value,
  onConfirm,
  onDismiss,
}: {
  visible: boolean;
  value: string;
  onConfirm(next: string): void;
  onDismiss(): void;
}) {
  const initial = useMemo(() => parseTime(value), [value]);
  const [hour, setHour] = useState(initial.hour);
  const [minute, setMinute] = useState(initial.minute);

  useEffect(() => {
    if (visible) {
      const parsed = parseTime(value);
      setHour(parsed.hour);
      setMinute(parsed.minute);
    }
  }, [visible, value]);

  return (
    <BottomSheet
      visible={visible}
      title="选择时间"
      onDismiss={onDismiss}
      heightRatio={0.46}
      footer={<SheetActions onConfirm={() => onConfirm(`${pad2(hour)}:${pad2(minute)}`)} />}
    >
      <View style={styles.pickerBody}>
        <WheelGroup
          units={['时', '分']}
          columns={[
            { items: HOURS.map(h => pad2(h)), index: hour, onChange: i => setHour(HOURS[i]), flex: 1 },
            {
              items: MINUTES.map(m => pad2(m)),
              index: minute,
              onChange: i => setMinute(MINUTES[i]),
              flex: 1,
            },
          ]}
        />
      </View>
    </BottomSheet>
  );
}



/**
 * 农历年范围
 *
 * 直接取算法数据表的范围（1900-2047）。旧版写的是 1900-2100 ——
 * 超出数据表的年份算不出结果，选到那儿只会得到一片空白，不如不给选。
 */
const LUNAR_YEARS = Array.from(
  { length: LUNAR_MAX_YEAR - LUNAR_MIN_YEAR + 1 },
  (_, i) => LUNAR_MIN_YEAR + i,
);

interface LunarPickState {
  year: number;
  month: number;
  isLeap: boolean;
  day: number;
}

/** 把「当前公历日期」换算成选择器的初始农历状态；超出数据表就落到今天 */
function resolveLunarState(value: string): LunarPickState {
  const solar = parseDate(value);
  const lunar = solarToLunar(new Date(solar.year, solar.month - 1, solar.day));

  if (lunar) {
    return {
      year: lunar.lunarYear,
      month: lunar.lunarMonth,
      isLeap: lunar.isLeap,
      day: lunar.lunarDay,
    };
  }

  const today = solarToLunar(new Date());
  if (today) {
    return {
      year: today.lunarYear,
      month: today.lunarMonth,
      isLeap: today.isLeap,
      day: today.lunarDay,
    };
  }

  return { year: LUNAR_MAX_YEAR, month: 1, isLeap: false, day: 1 };
}

export interface LunarPickResult {
  /** 换算出来的**公历**日期（`YYYY-MM-DD`，存进 `EventItem.date`） */
  date: string;
  /** 农历信息（存进 `EventItem.lunarInfo`） */
  lunarInfo: LunarInfo;
}

/**
 * 农历日期选择器（底部面板 + 三列滚轮）
 *
 * 交互和公历那个 `DateWheelPicker` 保持一致（年/月/日三列并排），而不是照抄旧版
 * 那种「先点年、再弹一层滚轮」的两段式 —— 本项目里已经有现成的三列滚轮组件，
 * 一致比复古更重要。**行为**上仍然是旧版那套：
 *   - 月份列表含闰月，名字形如「闰六月」；
 *   - 换年/换月后日期自动夹到该月真实天数（旧版也是静默夹取）；
 *   - 确认时把农历换算成公历存进 `date`，同时给出 `lunarInfo`。
 *
 * ⚠️ 换算全部走 `utils/lunar.ts`，而那个文件里的闰月处理**刚刚被修过**
 * （旧版有 bug，闰月之后的日子会错位）。改这里时不要绕开它自己算。
 */
export function LunarWheelPicker({
  visible,
  value,
  onConfirm,
  onDismiss,
}: {
  visible: boolean;
  /** 当前公历日期（`YYYY-MM-DD`），用来决定打开时停在哪一天 */
  value: string;
  onConfirm(next: LunarPickResult): void;
  onDismiss(): void;
}) {
  const [state, setState] = useState<LunarPickState>(() => resolveLunarState(value));

  useEffect(() => {
    if (visible) setState(resolveLunarState(value));
  }, [visible, value]);

  const months = useMemo(() => getLunarMonthsInYear(state.year), [state.year]);

  /**
   * 当前月份在下拉列表里的下标
   *
   * 换年之后原来的闰月可能不存在了（比如今年闰六月、明年没有），
   * 那就退回到**同名普通月**，而不是跳回正月。
   */
  const monthIndex = useMemo(() => {
    const exact = months.findIndex(m => m.month === state.month && m.isLeap === state.isLeap);
    if (exact >= 0) return exact;
    const sameMonth = months.findIndex(m => m.month === state.month);
    return sameMonth >= 0 ? sameMonth : 0;
  }, [months, state.month, state.isLeap]);


  const day = clampLunarDay(state.year, state.month, state.isLeap, state.day);
  const days = Array.from(
    { length: getDaysInLunarMonth(state.year, state.month, state.isLeap) },
    (_, i) => i + 1,
  );


  const previewSolar = lunarToSolar(state.year, state.month, day, state.isLeap);
  const previewText = previewSolar
    ? `${state.year}年${months[monthIndex]?.name ?? ''}${LUNAR_DAY_NAMES[day - 1]} · 公历 ${previewSolar.getFullYear()}-${pad2(
        previewSolar.getMonth() + 1,
      )}-${pad2(previewSolar.getDate())}`
    : '这个农历日期超出可换算范围';

  const handleConfirm = () => {
    const solar = lunarToSolar(state.year, state.month, day, state.isLeap);
    if (!solar) {
      onDismiss();
      return;
    }


    const lunar = solarToLunar(solar);
    if (!lunar) {
      onDismiss();
      return;
    }

    onConfirm({
      date: `${solar.getFullYear()}-${pad2(solar.getMonth() + 1)}-${pad2(solar.getDate())}`,
      lunarInfo: buildLunarInfo(solar, lunar),
    });
  };

  return (
    <BottomSheet
      visible={visible}
      title="选择农历日期"
      onDismiss={onDismiss}
      heightRatio={0.56}
      footer={<SheetActions onConfirm={handleConfirm} />}
    >
      <View style={styles.pickerBody}>
        <Text variant="bodySmall" style={styles.lunarPreview} allowFontScaling={false}>
          {previewText}
        </Text>
        <WheelGroup
          units={['年', '月', '日']}
          columns={[
            {
              items: LUNAR_YEARS.map(String),
              index: LUNAR_YEARS.indexOf(state.year),
              onChange: i => setState(prev => ({ ...prev, year: LUNAR_YEARS[i] })),
              flex: 1.3,
            },
            {
              items: months.map(m => m.name),
              index: monthIndex,
              onChange: i =>
                setState(prev => ({
                  ...prev,
                  month: months[i].month,
                  isLeap: months[i].isLeap,
                })),
              flex: 1.2,
            },
            {
              items: days.map(d => LUNAR_DAY_NAMES[d - 1]),
              index: day - 1,
              onChange: i => setState(prev => ({ ...prev, day: days[i] })),
              flex: 1,
            },
          ]}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  pickerBody: {
    flex: 1,
    justifyContent: 'center',
  },
  lunarPreview: {
    textAlign: 'center',
    color: palette.cocoaFaint,
    marginBottom: spacing.md,
  },
  group: {
    marginHorizontal: spacing.lg,
  },
  wheelsRow: {
    flexDirection: 'row',
    height: ITEM_HEIGHT * VISIBLE_ROWS,
    borderRadius: radius.md,

    overflow: 'hidden',
    backgroundColor: palette.peachTint,
  },

  band: {
    position: 'absolute',
    top: PAD,
    left: spacing.xs,
    right: spacing.xs,
    height: ITEM_HEIGHT,
    borderRadius: radius.sm,
    backgroundColor: palette.peachLine20,
  },
  wheel: {
    height: '100%',
  },
  wheelContent: {
    paddingVertical: PAD,
  },
  wheelItem: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelText: {
    color: palette.cocoaFaint,
  },
  wheelTextActive: {
    color: palette.cocoa,
    fontWeight: '700',
  },
  unitsRow: {
    flexDirection: 'row',
    marginTop: spacing.sm,
  },
  unit: {
    color: palette.cocoaSoft,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xs,
  },
});

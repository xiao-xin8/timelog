import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from 'react-native-paper';

import { BG_COLOR_OPTIONS, TEXT_COLOR_OPTIONS } from '../constants';
import { cardGradient, palette, radius, spacing } from '../theme';
import type { EventItem } from '../types/event';
import { calcCountdown, calcProgress, getWeekday } from '../utils/countdown';



/** 基准尺寸：所有字号 / 间距的原始值（scale = 1） */
const BASE = {
  cardRadius: radius.lg, // 16
  cardBorder: 1,
  padX: spacing.lg, // 16
  padY: spacing.md, // 12
  padYBody: spacing.xl, // 24
  gap: spacing.sm, // 8
  gapNumber: spacing.lg, // 16
  progressHeight: 6,
  chipRadius: radius.sm, // 8
  chipPadX: spacing.sm, // 8
  chipPadY: spacing.xs, // 4
  fontTitle: 22, // MD3 titleLarge
  fontLabel: 16, // MD3 bodyLarge
  fontNumber: 36, // MD3 displaySmall
  fontSmall: 12, // MD3 bodySmall
} as const;

const BAND_TOP = 'rgba(255,255,255,0.15)';
const BAND_BOTTOM = 'rgba(255,255,255,0.1)';
const TRACK_BG = 'rgba(255,255,255,0.2)';
const CHIP_BG = 'rgba(255,255,255,0.15)';

const WEEKDAYS_FULL = [
  '星期日',
  '星期一',
  '星期二',
  '星期三',
  '星期四',
  '星期五',
  '星期六',
] as const;

interface Props {
  event: EventItem;
  /** 整体缩放。详情页传 1（默认），导出时传 `宽度 / 340` */
  scale?: number;
  /** 卡片宽度。给了就固定宽度，不给则撑满父容器（详情页） */
  width?: number;
  /** 覆盖文字色；不传则按事件自己的 `textColor` 解析 */
  textColor?: string;
  /**
   * 卡片底色，**三态**：
   * - `undefined`（不传，默认）= **按事件自己的 `bgColor` 解析**（详情页就靠这条）
   * - `null` = 强制用主题粉色渐变
   * - 字符串 = 纯色；字符串数组 = 渐变
   *
   * 导出页三种配色都要能强制指定，所以必须留 `null` 这一档；
   * 而详情页不传，让它跟着事件走 —— 这两件事没法用一个默认值同时表达。
   */
  background?: string | readonly string[] | null;
  /**
   * 是否带投影
   *
   * 详情页要（卡片浮在奶油色背景上），**导出图不要** ——
   * 截图里阴影会变成四周的脏边，而且圆角裁剪会把投影切掉，反而更难看。
   */
  withShadow?: boolean;
}

export default function CountdownCard({
  event,
  scale = 1,
  width,
  textColor,
  background,
  withShadow = false,
}: Props) {
  const s = scale;
  const st = useMemo(() => buildStyles(s), [s]);

  /** 文字色：没传就按事件自己的设置来（与首页 EventCard 同一套解析） */
  const color =
    textColor ??
    TEXT_COLOR_OPTIONS.find(option => option.key === event.textColor)?.value ??
    palette.cocoa;

  /** 底色：没传就按事件自己的设置来；`bgColor: 'follow'` 才是主题渐变 */
  const bg: string | readonly string[] | null =
    background !== undefined ? background : resolveEventBackground(event);

  const countdown = calcCountdown(event.targetDateTime, event.showPreciseTime);
  const progress = calcProgress(event.startDateTime, event.targetDateTime, event.createTime);
  const showProgress = !countdown.isPast && Boolean(event.showProgressBar);

  const target = new Date(event.targetDateTime);
  const weekday = WEEKDAYS_FULL[target.getDay()];

  const body = (
    <>
      {/* 头部：标题 */}
      <View style={st.cardHeader}>
        <Text
          style={[st.cardTitle, { color }]}
          numberOfLines={1}
          allowFontScaling={false}
        >
          {event.title}
        </Text>
      </View>

      {/* 进度条：开了才显示，已经过去的事件不显示 */}
      {showProgress ? (
        <View style={st.progressWrap}>
          <View style={st.progressTrack}>
            <View
              style={[
                st.progressFill,
                { width: `${progress.percent}%`, backgroundColor: color },
              ]}
            />
          </View>
          <Text style={[st.progressText, { color }]} allowFontScaling={false}>
            {progress.label === '进行中' ? `已完成 ${progress.percent}%` : progress.label}
          </Text>
        </View>
      ) : null}

      {/* 还有 / 已过 + 数字组 */}
      <View style={st.cardBody}>
        <Text style={[st.countdownLabel, { color }]} allowFontScaling={false}>
          {countdown.isPast ? '已过' : '还有'}
        </Text>

        <View style={st.numbers}>
          <TimeUnit value={countdown.days} unit="天" color={color} st={st} />
          {event.showPreciseTime ? (
            <>
              <TimeUnit value={countdown.hours} unit="时" color={color} st={st} />
              <TimeUnit value={countdown.minutes} unit="分" color={color} st={st} />
              {event.showSeconds ? (
                <TimeUnit value={countdown.seconds} unit="秒" color={color} st={st} />
              ) : null}
            </>
          ) : null}
        </View>
      </View>

      {/* 底部：目标日期 + 星期 */}
      <View style={st.cardFooter}>
        <Text style={[st.targetDate, { color }]} allowFontScaling={false}>
          目标日期: {target.getFullYear()}年{target.getMonth() + 1}月{target.getDate()}日
        </Text>
        <View style={st.weekdayChip}>
          <Text style={[st.weekdayText, { color }]} allowFontScaling={false}>
            {weekday}
          </Text>
        </View>
      </View>
    </>
  );

  const cardStyle = [st.card, withShadow && st.cardShadow, width != null ? { width } : null];


  if (bg === null) {
    return (
      <LinearGradient
        colors={cardGradient as unknown as [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={cardStyle}
      >
        {body}
      </LinearGradient>
    );
  }

  if (Array.isArray(bg)) {
    return (
      <LinearGradient
        colors={bg as unknown as [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={cardStyle}
      >
        {body}
      </LinearGradient>
    );
  }

  return (
    <View style={[cardStyle, { backgroundColor: bg as string }]}>{body}</View>
  );
}

/**
 * 按事件自己的 `bgColor` 解析卡片底色
 *
 * 与首页 `EventCard` / 原详情页同一套规则：
 * - `follow` → `null`，交给主题粉色渐变
 * - `custom` → 自定义色值（没填色值时兜底白色）
 * - 其余 key → 从 `BG_COLOR_OPTIONS` 查；查不到也退回主题渐变
 */
function resolveEventBackground(event: EventItem): string | readonly string[] | null {
  if (event.bgColor === 'custom') {
    return event.customBgColorValue ?? '#FFFFFF';
  }
  if (event.bgColor === 'follow') {
    return null;
  }
  return BG_COLOR_OPTIONS.find(option => option.key === event.bgColor)?.value ?? null;
}



type Styles = ReturnType<typeof buildStyles>;

function TimeUnit({
  value,
  unit,
  color,
  st,
}: {
  value: number;
  unit: string;
  color: string;
  st: Styles;
}) {
  return (
    <View style={st.unit}>
      <Text style={[st.number, { color }]} allowFontScaling={false}>
        {value}
      </Text>
      <Text style={[st.unitLabel, { color }]} allowFontScaling={false}>
        {unit}
      </Text>
    </View>
  );
}



function buildStyles(s: number) {
  return StyleSheet.create({
    card: {
      width: '100%',
      borderRadius: BASE.cardRadius * s,
      borderWidth: BASE.cardBorder,
      borderColor: palette.peachLine20,
      overflow: 'hidden', // 圆角裁剪：导出时也是靠它出圆角
    },

    cardShadow: {
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },

    cardHeader: {
      alignItems: 'center',
      paddingVertical: BASE.padY * s,
      paddingHorizontal: BASE.padX * s,
      backgroundColor: BAND_TOP,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: 'rgba(255,255,255,0.2)',
    },
    cardTitle: {
      fontSize: BASE.fontTitle * s,
      lineHeight: BASE.fontTitle * 1.25 * s,
      fontWeight: '700',
      textAlign: 'center',
    },

    progressWrap: {
      paddingHorizontal: BASE.padX * s,
      paddingVertical: BASE.padY * s,
      alignItems: 'center',
      gap: BASE.gap * s,
    },
    progressTrack: {
      width: '100%',
      height: BASE.progressHeight * s,
      borderRadius: (BASE.progressHeight * s) / 2,
      backgroundColor: TRACK_BG,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: (BASE.progressHeight * s) / 2,
    },
    progressText: {
      fontSize: BASE.fontSmall * s,
      lineHeight: BASE.fontSmall * 1.3 * s,
      fontWeight: '500',
    },

    cardBody: {
      paddingVertical: BASE.padYBody * s,
      paddingHorizontal: BASE.padX * s,
      alignItems: 'center',
    },
    countdownLabel: {
      fontSize: BASE.fontLabel * s,
      lineHeight: BASE.fontLabel * 1.3 * s,
      marginBottom: BASE.padY * s,
      opacity: 0.9,
    },
    numbers: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'center',
      flexWrap: 'wrap',
      gap: BASE.gapNumber * s,
    },
    unit: {
      alignItems: 'center',
      gap: BASE.gap * 0.5 * s,
    },
    number: {
      fontSize: BASE.fontNumber * s,
      lineHeight: BASE.fontNumber * 1.1 * s,
      fontWeight: '800',
    },
    unitLabel: {
      fontSize: BASE.fontSmall * s,
      lineHeight: BASE.fontSmall * 1.2 * s,
      opacity: 0.9,
    },

    cardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: BASE.padY * s,
      paddingHorizontal: BASE.padX * s,
      backgroundColor: BAND_BOTTOM,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: 'rgba(255,255,255,0.15)',
    },
    targetDate: {
      fontSize: BASE.fontSmall * s,
      lineHeight: BASE.fontSmall * 1.3 * s,
      opacity: 0.9,
    },
    weekdayChip: {
      paddingHorizontal: BASE.chipPadX * s,
      paddingVertical: BASE.chipPadY * s,
      borderRadius: BASE.chipRadius * s,
      backgroundColor: CHIP_BG,
    },
    weekdayText: {
      fontSize: BASE.fontSmall * s,
      lineHeight: BASE.fontSmall * 1.3 * s,
      opacity: 0.8,
    },
  });
}

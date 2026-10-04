import React, { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from 'react-native-paper';

import { BG_COLOR_OPTIONS, TEXT_COLOR_OPTIONS } from '../constants';
import { useTick } from '../hooks/useTick';
import { cardGradient, palette, radius, spacing } from '../theme';
import type { EventItem } from '../types/event';
import { calcCountdown, formatShortDate, getWeekday } from '../utils/countdown';

/**
 * 事件卡片
 *
 * **三种尺寸的排版各不一样，全部照抄旧版** `legacy/uniapp/pages/index/index.css`：
 *
 *   small  —— 横向一行：[图标] [标题] … [还有 128 天] [02/06]
 *   medium —— 纵向三排：第一排图标+标题+分类，第二排倒计时，第三排日期
 *   large  —— 头部（图标+标题+分类）／倒计时（大号数字块，上下有分隔线）／底部日期+星期
 *
 * 倒计时文案规则三种尺寸统一：
 *   未开精准时间 → 还有 128 天
 *   开了精准时间 → 还有 128 天 5 时 9 分
 *   再开显示秒数 → 还有 128 天 5 时 9 分 30 秒
 *   已过去       → 已过 128 天
 */

interface Props {
  event: EventItem;
  categoryLabel?: string;
  /** 分类图标（emoji），与分类名一起显示在标签里 */
  categoryIcon?: string;
  onPress?(event: EventItem): void;
  onLongPress?(event: EventItem): void;
}

/** 旧版用 rpx，按 750rpx = 屏宽折算，这里直接给 dp 值 */
const RPX = 0.5;

function dateOf(event: EventItem): string {
  if (event.calendarType === 'lunar' && event.lunarInfo) {
    return `${event.lunarInfo.fullDate}（农历）`;
  }
  return formatShortDate(event.targetDateTime);
}

/**
 * 倒计时数字组
 *
 * `column` 用于大卡片（数字在上、单位在下），`baseline` 用于小/中卡片（连成一句）。
 */
function CountdownParts({
  event,
  color,
  layout,
}: {
  event: EventItem;
  color: string;
  layout: 'baseline' | 'column';
}) {
  const countdown = calcCountdown(event.targetDateTime, event.showPreciseTime);
  const label = countdown.isPast ? '已过' : '还有';

  if (layout === 'column') {
    return (
      <View style={styles.largeCountdown}>
        {/* 「已过/还有」单独一块，右侧有竖分隔线（旧版 time-block-label） */}
        <View style={styles.largeLabelBlock}>
          <Text style={[styles.largeLabel, { color }]}>{label}</Text>
        </View>

        <LargeBlock value={countdown.days} unit="天" color={color} />
        {event.showPreciseTime ? (
          <>
            <LargeBlock value={countdown.hours} unit="时" color={color} />
            <LargeBlock value={countdown.minutes} unit="分" color={color} />
          </>
        ) : null}
        {event.showPreciseTime && event.showSeconds ? (
          <LargeBlock value={countdown.seconds} unit="秒" color={color} />
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.countdownRow}>
      <Text style={[styles.countdownLabel, { color }]}>{label}</Text>
      <Text style={[styles.countdownNumber, { color }]}>{countdown.days}</Text>
      <Text style={[styles.countdownUnit, { color }]}>天</Text>

      {event.showPreciseTime ? (
        <>
          <Text style={[styles.countdownNumber, { color }]}>{countdown.hours}</Text>
          <Text style={[styles.countdownUnit, { color }]}>时</Text>
          <Text style={[styles.countdownNumber, { color }]}>{countdown.minutes}</Text>
          <Text style={[styles.countdownUnit, { color }]}>分</Text>
        </>
      ) : null}

      {event.showPreciseTime && event.showSeconds ? (
        <>
          <Text style={[styles.countdownNumber, { color }]}>{countdown.seconds}</Text>
          <Text style={[styles.countdownUnit, { color }]}>秒</Text>
        </>
      ) : null}
    </View>
  );
}

/** 大卡片的单个数字块：大数字在上，单位在下 */
function LargeBlock({
  value,
  unit,
  color,
}: {
  value: number;
  unit: string;
  color: string;
}) {
  return (
    <View style={styles.largeBlock}>
      <Text style={[styles.largeNumber, { color }]}>{value}</Text>
      <Text style={[styles.largeUnit, { color }]}>{unit}</Text>
    </View>
  );
}

/**
 * 分类标签：**图标 + 名称**
 *
 * 照搬旧版：`.event-tag-icon`（28rpx，比文字略大）+ `.event-tag-text`（26rpx），
 * 小卡片上是 `.top-small-category-icon` + `.top-small-category-name`。
 * 三种卡片尺寸的标签都带图标，所以这里只做一个组件给三种尺寸共用。
 */
function CategoryTag({ icon, label }: { icon?: string; label: string }) {
  return (
    <View style={styles.tag}>
      {icon ? (
        <Text variant="bodyMedium" allowFontScaling={false}>
          {icon}
        </Text>
      ) : null}
      <Text style={styles.tagText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}



/** 横向一行：[图标] [标题] … [还有 X 天] [日期] */
function SmallCard({ event, categoryLabel, categoryIcon, color }: CardParts) {
  return (
    <View style={styles.smallRow}>
      <Text style={[styles.smallIcon, { color }]}>{event.icon}</Text>
      <Text style={[styles.smallTitle, { color }]} numberOfLines={1}>
        {event.title}
      </Text>

      <CountdownParts event={event} color={color} layout="baseline" />

      <Text style={[styles.smallDate, { color }]} numberOfLines={1}>
        {event.calendarType === 'lunar' && event.lunarInfo
          ? event.lunarInfo.fullDate
          : formatShortDate(event.targetDateTime)}
      </Text>
      {categoryLabel ? <CategoryTag icon={categoryIcon} label={categoryLabel} /> : null}
    </View>
  );
}



/** 纵向三排：图标+标题+分类 ／ 倒计时 ／ 日期 */
function MediumCard({ event, categoryLabel, categoryIcon, color }: CardParts) {
  return (
    <View style={styles.mediumBody}>
      <View style={styles.mediumRow1}>
        <View style={styles.titleGroup}>
          <Text style={[styles.mediumIcon, { color }]}>{event.icon}</Text>
          <Text style={[styles.mediumTitle, { color }]} numberOfLines={1}>
            {event.title}
          </Text>
        </View>
        {categoryLabel ? <CategoryTag icon={categoryIcon} label={categoryLabel} /> : null}
      </View>

      <CountdownParts event={event} color={color} layout="baseline" />

      <Text style={[styles.mediumDate, { color }]} numberOfLines={1}>
        {dateOf(event)}
      </Text>
    </View>
  );
}



/** 头部 ／ 大号倒计时块（上下分隔线）／ 底部日期 + 星期 */
function LargeCard({ event, categoryLabel, categoryIcon, color }: CardParts) {
  const target = event.targetDateTime;

  return (
    <View style={styles.largeBody}>
      <View style={styles.largeHeader}>
        <View style={styles.titleGroup}>
          <Text style={[styles.largeIcon, { color }]}>{event.icon}</Text>
          <Text style={[styles.largeTitle, { color }]} numberOfLines={1}>
            {event.title}
          </Text>
        </View>
        {categoryLabel ? <CategoryTag icon={categoryIcon} label={categoryLabel} /> : null}
      </View>

      <View style={styles.largeCountdownSection}>
        <CountdownParts event={event} color={color} layout="column" />
      </View>

      <View style={styles.largeFooter}>
        <Text style={[styles.largeDate, { color }]} numberOfLines={1}>
          {dateOf(event)}
        </Text>
        <Text style={[styles.largeWeekday, { color }]}>{getWeekday(target)}</Text>
      </View>
    </View>
  );
}

interface CardParts {
  event: EventItem;
  categoryLabel?: string;
  categoryIcon?: string;
  color: string;
}



function EventCardInner({ event, categoryLabel, categoryIcon, onPress, onLongPress }: Props) {

  useTick();

  const color =
    TEXT_COLOR_OPTIONS.find(option => option.key === event.textColor)?.value ??
    palette.cocoa;

  const resolvedBg =
    event.bgColor === 'follow'
      ? null
      : event.bgColor === 'custom'
        ? (event.customBgColorValue ?? '#FFFFFF')
        : (BG_COLOR_OPTIONS.find(option => option.key === event.bgColor)?.value ?? null);

  const parts: CardParts = { event, categoryLabel, categoryIcon, color };

  const body =
    event.cardSize === 'small' ? (
      <SmallCard {...parts} />
    ) : event.cardSize === 'large' ? (
      <LargeCard {...parts} />
    ) : (
      <MediumCard {...parts} />
    );

  const wrapperStyle = [styles.card, event.cardSize === 'small' && styles.cardSmall];

  const touchable = (
    <Pressable
      onPress={onPress ? () => onPress(event) : undefined}
      onLongPress={onLongPress ? () => onLongPress(event) : undefined}
      android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
    >
      {body}
    </Pressable>
  );


  if (resolvedBg === null) {
    return (
      <LinearGradient
        colors={cardGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={wrapperStyle}
      >
        {touchable}
      </LinearGradient>
    );
  }

  return <View style={[wrapperStyle, { backgroundColor: resolvedBg }]}>{touchable}</View>;
}

const styles = StyleSheet.create({

  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.peachLine20,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    overflow: 'hidden',
  },
  cardSmall: {
    // 小卡片本身内容就矮，内边距给紧凑些
  },


  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: palette.peachLine15,
    flexShrink: 0,
  },
  tagText: {
    color: palette.peachDeep,
    fontWeight: '500',
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },


  countdownRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
  },
  countdownLabel: {
    fontWeight: '600',
    marginRight: 2,
  },
  countdownNumber: {
    fontSize: Math.round(36 * RPX),
    fontWeight: '800',
  },
  countdownUnit: {
    fontSize: Math.round(20 * RPX),
    marginLeft: 2,
    marginRight: spacing.xs,
    opacity: 0.75,
  },


  smallRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Math.round(20 * RPX),
    paddingVertical: Math.round(16 * RPX),
    gap: spacing.sm,
  },
  smallIcon: {
    fontSize: Math.round(32 * RPX),
  },
  smallTitle: {
    flex: 1,
    fontSize: Math.round(26 * RPX),
    fontWeight: '600',
  },
  smallDate: {
    fontSize: Math.round(22 * RPX),
    minWidth: Math.round(80 * RPX),
    textAlign: 'right',
    opacity: 0.7,
  },


  mediumBody: {
    padding: Math.round(24 * RPX),
    gap: spacing.md,
  },
  mediumRow1: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  mediumIcon: {
    fontSize: Math.round(40 * RPX),
  },
  mediumTitle: {
    fontSize: Math.round(32 * RPX),
    fontWeight: '700',
    flexShrink: 1,
  },
  mediumDate: {
    fontSize: Math.round(24 * RPX),
    opacity: 0.65,
  },


  largeBody: {
    padding: Math.round(36 * RPX),
  },
  largeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  largeIcon: {
    fontSize: Math.round(48 * RPX),
  },
  largeTitle: {
    fontSize: Math.round(40 * RPX),
    fontWeight: '700',
    flexShrink: 1,
  },
  largeCountdownSection: {
    paddingVertical: spacing.lg,
    marginBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  largeCountdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
    flexWrap: 'wrap',
  },
  largeLabelBlock: {
    paddingRight: spacing.lg,
    marginRight: spacing.sm,
    borderRightWidth: 1,
    borderRightColor: 'rgba(0,0,0,0.1)',
  },
  largeLabel: {
    fontSize: Math.round(32 * RPX),
    fontWeight: '600',
  },
  largeBlock: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  largeNumber: {
    fontSize: Math.round(72 * RPX),
    lineHeight: Math.round(72 * RPX),
    fontWeight: '800',
  },
  largeUnit: {
    fontSize: Math.round(28 * RPX),
    opacity: 0.7,
  },
  largeFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  largeDate: {
    fontSize: Math.round(26 * RPX),
    opacity: 0.7,
  },
  largeWeekday: {
    fontSize: Math.round(26 * RPX),
    opacity: 0.5,
  },
});

const EventCard = memo(EventCardInner);
export default EventCard;

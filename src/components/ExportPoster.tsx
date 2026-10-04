import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from 'react-native-paper';

import CountdownCard from './CountdownCard';
import { BG_COLOR_OPTIONS, TEXT_COLOR_OPTIONS } from '../constants';
import { cardGradient, palette, primaryGradient, radius, spacing } from '../theme';
import type { EventItem } from '../types/event';
import { calcCountdown, calcProgress } from '../utils/countdown';



/** 模板 */
export type PosterTemplate = 'classic' | 'tall';

/** 配色方案 */
export type PosterPalette = 'event' | 'theme' | 'plain';

export const POSTER_TEMPLATES: readonly {
  key: PosterTemplate;
  name: string;
  desc: string;
  /** 宽高比 = 高 / 宽，用来在预览区算高度（classic 为 null = 高度由内容决定） */
  ratio: number | null;
}[] = [
  { key: 'classic', name: '经典卡片', desc: '和详情页完全一致', ratio: null },
  { key: 'tall', name: '竖版海报', desc: '3:4，适合发朋友圈', ratio: 480 / 360 },
] as const;

export const POSTER_PALETTES: readonly {
  key: PosterPalette;
  name: string;
  desc: string;
}[] = [
  { key: 'event', name: '跟随事件', desc: '用事件自己设的颜色' },
  { key: 'theme', name: '蜜桃主题', desc: 'App 的标志性配色' },
  { key: 'plain', name: '纯白', desc: '干净的黑白文字' },
] as const;

/** 经典卡片的基准宽度（旧版就是 340，这里沿用以便算缩放） */
const CLASSIC_BASE_WIDTH = 340;



interface PosterColors {
  /** 渐变数组（长度 1 表示纯色） */
  bg: readonly string[];
  /** 主文字色 */
  fg: string;
  /** 次要文字色 */
  sub: string;
  /** 半透明色带（深底用白、浅底用黑） */
  band: string;
}

/** 粗略判断底色深浅：深底配白色带，浅底配黑色带 */
function isDark(hex: string): boolean {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map(c => c + c).join('') : value;
  const r = parseInt(full.substring(0, 2), 16);
  const g = parseInt(full.substring(2, 4), 16);
  const b = parseInt(full.substring(4, 6), 16);

  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

const DARK_BAND = 'rgba(255,255,255,0.18)';
const LIGHT_BAND = 'rgba(0,0,0,0.05)';

function resolveColors(event: EventItem, mode: PosterPalette): PosterColors {
  if (mode === 'theme') {
    return {
      bg: primaryGradient,
      fg: '#FFFFFF',
      sub: 'rgba(255,255,255,0.85)',
      band: 'rgba(255,255,255,0.22)',
    };
  }

  if (mode === 'plain') {
    return { bg: ['#FFFFFF'], fg: palette.cocoa, sub: palette.cocoaFaint, band: LIGHT_BAND };
  }


  const fg =
    TEXT_COLOR_OPTIONS.find(option => option.key === event.textColor)?.value ?? palette.cocoa;

  const solidBg =
    event.bgColor === 'follow'
      ? null
      : event.bgColor === 'custom'
        ? (event.customBgColorValue ?? '#FFFFFF')
        : (BG_COLOR_OPTIONS.find(option => option.key === event.bgColor)?.value ?? null);

  if (solidBg === null) {
    return { bg: cardGradient, fg, sub: fg, band: DARK_BAND };
  }
  return { bg: [solidBg], fg, sub: fg, band: isDark(solidBg) ? DARK_BAND : LIGHT_BAND };
}

/** 颜色数组 → CountdownCard 的 background 参数（它接受 null / 字符串 / 数组） */
function toBackground(colors: PosterColors): string | readonly string[] {
  return colors.bg.length >= 2 ? colors.bg : colors.bg[0];
}



function CountdownNumbers({
  event,
  color,
  numberSize,
  unitSize,
  gap,
}: {
  event: EventItem;
  color: string;
  numberSize: number;
  unitSize: number;
  gap: number;
}) {
  const countdown = calcCountdown(event.targetDateTime, event.showPreciseTime);

  const units = [{ value: countdown.days, unit: '天' }];
  if (event.showPreciseTime) {
    units.push({ value: countdown.hours, unit: '时' });
    units.push({ value: countdown.minutes, unit: '分' });
    if (event.showSeconds) {
      units.push({ value: countdown.seconds, unit: '秒' });
    }
  }

  return (
    <View style={[styles.unitsRow, { gap }]}>
      {units.map(item => (
        <View key={item.unit} style={styles.unit}>
          <Text style={{ fontSize: numberSize, lineHeight: numberSize * 1.1, fontWeight: '800', color }}>
            {item.value}
          </Text>
          <Text style={{ fontSize: unitSize, lineHeight: unitSize * 1.2, color }}>{item.unit}</Text>
        </View>
      ))}
    </View>
  );
}



const TALL_W = 360;
const TALL_H = 480;

function TallPoster({
  event,
  colors,
  width,
  showProgress,
  categoryName,
}: {
  event: EventItem;
  colors: PosterColors;
  width: number;
  showProgress: boolean;
  categoryName: string;
}) {
  const s = width / TALL_W;
  const progress = calcProgress(event.startDateTime, event.targetDateTime, event.createTime);
  const target = new Date(event.targetDateTime);
  const isPast = calcCountdown(event.targetDateTime, false).isPast;

  const today = new Date();
  const watermark = `时光日志 · ${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;

  return (
    <View style={{ width, paddingBottom: 0 }}>
      {/* 品牌装饰：右上角小星星 */}
      <Text style={[styles.star, { top: 14 * s, right: 16 * s, fontSize: 20 * s, color: colors.fg }]}>
        ✦
      </Text>

      {/* 头部：图标 + 标题 + 分类 */}
      <View style={{ paddingHorizontal: 24 * s, paddingTop: 40 * s, alignItems: 'center' }}>
        <Text style={{ fontSize: 40 * s, lineHeight: 48 * s }}>{event.icon}</Text>
        <Text
          numberOfLines={2}
          style={{
            marginTop: 6 * s,
            fontSize: 28 * s,
            lineHeight: 36 * s,
            fontWeight: '700',
            textAlign: 'center',
            color: colors.fg,
          }}
        >
          {event.title}
        </Text>
        <View
          style={[
            styles.posterTag,
            {
              marginTop: 10 * s,
              paddingHorizontal: 12 * s,
              paddingVertical: 3 * s,
              borderRadius: radius.pill,
              backgroundColor: colors.band,
            },
          ]}
        >
          <Text style={{ fontSize: 12 * s, lineHeight: 16 * s, color: colors.fg }}>
            {categoryName}
          </Text>
        </View>
      </View>

      {/* 中部：还有/已过 + 大号数字 */}
      <View style={{ marginTop: 26 * s, alignItems: 'center' }}>
        <Text style={{ fontSize: 15 * s, lineHeight: 20 * s, color: colors.sub }}>
          {isPast ? '已过' : '还有'}
        </Text>
        <View style={{ marginTop: 6 * s }}>
          <CountdownNumbers
            event={event}
            color={colors.fg}
            numberSize={58 * s}
            unitSize={15 * s}
            gap={14 * s}
          />
        </View>
      </View>

      {/* 进度条 */}
      {showProgress ? (
        <View
          style={{
            marginTop: 22 * s,
            paddingHorizontal: 40 * s,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8 * s,
          }}
        >
          <View
            style={[styles.progressTrack, { flex: 1, height: 7 * s, borderRadius: 3.5 * s }]}
          >
            <View
              style={{
                width: `${progress.percent}%`,
                height: '100%',
                borderRadius: 3.5 * s,
                backgroundColor: colors.fg,
              }}
            />
          </View>
          <Text style={{ fontSize: 12 * s, lineHeight: 16 * s, color: colors.fg }}>
            {Math.round(progress.percent)}%
          </Text>
        </View>
      ) : null}

      {/* 目标日期 + 星期 + 农历 */}
      <View style={{ marginTop: 'auto', paddingHorizontal: 24 * s }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: 10 * s,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.band,
          }}
        >
          <Text style={{ fontSize: 14 * s, lineHeight: 19 * s, color: colors.fg }}>
            {target.getFullYear()}年{target.getMonth() + 1}月{target.getDate()}日{' '}
            {getWeekdayFull(target)}
          </Text>
          {event.lunarInfo ? (
            <Text style={{ fontSize: 12 * s, lineHeight: 16 * s, color: colors.sub }}>
              {event.lunarInfo.fullDate}
            </Text>
          ) : null}
        </View>

        {/* 备注 */}
        {event.remark ? (
          <Text
            numberOfLines={3}
            style={{ paddingTop: 8 * s, fontSize: 13 * s, lineHeight: 19 * s, color: colors.sub }}
          >
            {event.remark}
          </Text>
        ) : null}

        {/* 水印 */}
        <Text
          style={{
            paddingTop: 12 * s,
            paddingBottom: 18 * s,
            fontSize: 11 * s,
            lineHeight: 15 * s,
            textAlign: 'center',
            color: colors.sub,
          }}
        >
          {watermark}
        </Text>
      </View>
    </View>
  );
}

const WEEKDAYS_FULL = [
  '星期日',
  '星期一',
  '星期二',
  '星期三',
  '星期四',
  '星期五',
  '星期六',
] as const;

function getWeekdayFull(date: Date): string {
  return WEEKDAYS_FULL[date.getDay()];
}



interface Props {
  event: EventItem;
  template: PosterTemplate;
  paletteMode: PosterPalette;
  /** 渲染宽度；高度按模板比例自动算（经典卡片由内容决定） */
  width: number;
  categoryName: string;
  /** 截图用的 ref 挂在外层 View 上 */
  innerRef?: React.Ref<View>;
}

export default function ExportPoster({
  event,
  template,
  paletteMode,
  width,
  categoryName,
  innerRef,
}: Props) {
  const colors = resolveColors(event, paletteMode);
  const showProgress =
    Boolean(event.showProgressBar) && !calcCountdown(event.targetDateTime, false).isPast;

  const isClassic = template === 'classic';
  const height = isClassic ? undefined : width * (TALL_H / TALL_W);

  return (
    <View
      ref={innerRef}
      collapsable={false}
      style={[styles.shot, { width, height, borderRadius: radius.xl }]}
    >
      {isClassic ? (

        <CountdownCard
          event={event}
          scale={width / CLASSIC_BASE_WIDTH}
          width={width}
          textColor={colors.fg}
          background={toBackground(colors)}
        />
      ) : (
        <LinearGradient
          colors={colors.bg as unknown as [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fill}
        >
          <TallPoster
            event={event}
            colors={colors}
            width={width}
            showProgress={showProgress}
            categoryName={categoryName}
          />
        </LinearGradient>
      )}
    </View>
  );
}

const styles = StyleSheet.create({

  shot: {
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  fill: {
    flex: 1,
  },

  unitsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  unit: {
    alignItems: 'center',
  },

  progressTrack: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },

  star: {
    position: 'absolute',
  },
  posterTag: {
    // 圆角/内边距在渲染处按 scale 给
  },
});

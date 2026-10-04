import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Button,
  Divider,
  IconButton,
  SegmentedButtons,
  Text,
  TextInput,
  TouchableRipple,
} from 'react-native-paper';

import { FloatingButton } from '../components/FloatingBar';
import CategoryPicker from '../components/CategoryPicker';
import Collapsible from '../components/Collapsible';
import SettingRow from '../components/SettingRow';
import Switch from '../components/Switch';
import {
  BgColorPicker,
  CustomColorPicker,
  TextColorPicker,
} from '../components/ColorPicker';
import {
  DateWheelPicker,
  LunarWheelPicker,
  TimeWheelPicker,
} from '../components/DateTimePicker';
import EmojiPicker from '../components/EmojiPicker';
import { useFeedback } from '../components/feedback';
import {
  BG_COLOR_OPTIONS,
  CARD_SIZE_OPTIONS,
  DEFAULT_CARD_SIZE,
  REMARK_MAX_LENGTH,
  TEXT_COLOR_OPTIONS,
} from '../constants';
import { TOP_CONTENT_GAP } from '../navigation/layout';
import { useCategoryStore } from '../store/useCategoryStore';
import { useEventStore } from '../store/useEventStore';
import { inputTheme, palette, radius, spacing } from '../theme';
import type { CalendarType, CardSize, EventItem, LunarInfo } from '../types/event';
import type { RootStackParamList } from '../navigation/types';
import { buildTargetDateTime, clampRemark, validateEventDraft } from '../utils/event';
import { lunarInfoFromSolar } from '../utils/lunar';

/**
 * 新增 / 编辑事件（Slice 03）
 *
 * 旧项目用一个页面 + mode 参数同时承担新增和编辑，这里沿用同样的做法。
 * 路由带 id 进来即为编辑模式。
 */

type Props = NativeStackScreenProps<RootStackParamList, 'AddEvent'>;

const pad2 = (value: number) => String(value).padStart(2, '0');
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
};

/**
 * `'YYYY-MM-DD'` → 本地时区那一天的 `Date`
 *
 * 不能写 `new Date('2025-01-28')`：那个按 **UTC** 解析，在负时区的机器上
 * 会退回前一天，农历换算就会差一天。
 */
function solarDateOf(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year || 1970, (month || 1) - 1, day || 1);
}

export default function AddEventScreen({ route, navigation }: Props) {
  const editId = route.params?.id;
  const isEdit = Boolean(editId);

  const insets = useSafeAreaInsets();
  const { toast, loading } = useFeedback();
  const events = useEventStore(state => state.events);
  const all = useCategoryStore(state => state.all);


  const original = useMemo(
    () => (editId ? events.find(event => event.id === editId) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editId],
  );


  const [title, setTitle] = useState(original?.title ?? '');
  const [icon, setIcon] = useState(original?.icon ?? '📅');
  const [category, setCategory] = useState(original?.category ?? 'other');
  const [calendarType, setCalendarType] = useState<CalendarType>(
    original?.calendarType ?? 'solar',
  );
  const [date, setDate] = useState(original?.date ?? today());
  /**
   * 农历信息（只有日历类型为「农历」时才会存进事件）
   *
   * 编辑已有农历事件时直接沿用存下来的；用户重新挑日期时由选择器给出，
   * 切换历法时按当前 `date` 现算 —— **始终和 `date` 保持一致**。
   */
  const [lunarInfo, setLunarInfo] = useState<LunarInfo | undefined>(original?.lunarInfo);
  const [showPreciseTime, setShowPreciseTime] = useState(
    original?.showPreciseTime ?? false,
  );
  const [time, setTime] = useState(original?.time ?? '00:00');
  const [showSeconds, setShowSeconds] = useState(original?.showSeconds ?? false);
  const [textColor, setTextColor] = useState(original?.textColor ?? 'default');
  const [bgColor, setBgColor] = useState(original?.bgColor ?? 'follow');
  const [customBgColorValue, setCustomBgColorValue] = useState(
    original?.customBgColorValue,
  );
  const [isTop, setIsTop] = useState(original?.isTop ?? false);
  const [cardSize, setCardSize] = useState<CardSize>(
    original?.cardSize ?? DEFAULT_CARD_SIZE,
  );
  const [remark, setRemark] = useState(original?.remark ?? '');


  const [emojiOpen, setEmojiOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [textColorOpen, setTextColorOpen] = useState(false);
  const [bgColorOpen, setBgColorOpen] = useState(false);
  const [customColorOpen, setCustomColorOpen] = useState(false);




  const categoryLabel = all.find(item => item.key === category)?.name ?? '其他';
  const categoryIcon = all.find(item => item.key === category)?.icon ?? '📌';

  const textColorLabel =
    TEXT_COLOR_OPTIONS.find(option => option.key === textColor)?.name ?? '默认蓝';

  const bgColorLabel = (() => {
    const option = BG_COLOR_OPTIONS.find(item => item.key === bgColor);
    if (!option) return '跟随应用';
    if (option.type === 'custom') return customBgColorValue ?? '自定义';
    return option.name;
  })();

  const cardSizeLabel =
    CARD_SIZE_OPTIONS.find(option => option.key === cardSize)?.name ?? '中卡片';


  const handleSave = async () => {
    const invalid = validateEventDraft({ title, date });
    if (invalid) {
      toast(invalid);
      return;
    }

    const finalTime = showPreciseTime ? time : '00:00';
    const targetDateTime = buildTargetDateTime(date, time, showPreciseTime);


    const finalLunarInfo =
      calendarType === 'lunar'
        ? lunarInfo ?? lunarInfoFromSolar(solarDateOf(date)) ?? undefined
        : undefined;

    const payload = {
      title: title.trim(),
      icon,
      category,
      calendarType,
      date,
      lunarInfo: finalLunarInfo,
      time: finalTime,
      targetDateTime,
      showPreciseTime,
      showSeconds,
      textColor,
      bgColor,
      customBgColorValue: bgColor === 'custom' ? customBgColorValue : undefined,
      isTop,
      remark: remark.slice(0, REMARK_MAX_LENGTH),
      cardSize,
    };

    loading(true, '保存中…');
    try {
      const result = isEdit && editId
        ? await useEventStore.getState().update(editId, payload)
        : await useEventStore.getState().add({
            id: String(Date.now()),
            createTime: new Date().toISOString(),
            ...payload,
          } satisfies EventItem);

      if (!result.ok) {

        toast(result.reason);
        return;
      }
    } finally {
      loading(false);
    }

    toast('保存成功');

    setTimeout(() => navigation.goBack(), 800);
  };

  /**
   * 切换公历 / 农历
   *
   * **不重置已选日期**，而是把当前那一天在两种历法之间换算后保留 ——
   * 旧版就是这么做的（切错历法不该把用户挑好的日子弄丢）。
   * 日期本身（`date`）永远是公历，切到农历只是把它的农历表示算出来。
   */
  const handleCalendarTypeChange = (next: CalendarType) => {
    setCalendarType(next);
    if (next === 'lunar') {
      setLunarInfo(lunarInfoFromSolar(solarDateOf(date)) ?? undefined);
    }
  };

  /** 农历模式且换算成功 —— 界面据此决定显示农历还是公历文案 */
  const isLunarReady = calendarType === 'lunar' && Boolean(lunarInfo);

  return (
    <>
      <ScrollView
        style={styles.root}
        contentContainerStyle={[
          styles.content,
          {

            paddingTop: insets.top + TOP_CONTENT_GAP,
            paddingBottom: insets.bottom + spacing.xxl,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* 1. 名称（返回按钮和它同一行，省掉顶上那一条空白） */}
        <View style={styles.titleRow}>
          <FloatingButton
            icon="arrow-left"
            onPress={() => navigation.goBack()}
            accessibilityLabel="返回"
          />
          <TextInput
            mode="outlined"
            label="事件名称"
            placeholder="比如：妈妈生日"
            value={title}
            onChangeText={setTitle}
            style={[styles.input, styles.titleInput]}
            theme={inputTheme}
          />
        </View>

        {/* 2/3. 图标与分类 */}
        <View style={styles.section}>
          <SettingRow
            icon="emoticon-happy-outline"
            title="事件图标"
            description="点右侧选择"
            right={<Text style={styles.valueEmoji}>{icon}</Text>}
            onPress={() => setEmojiOpen(true)}
          />
          <Divider />
          <SettingRow
            icon="shape-outline"
            title="事件分类"
            right={
              <Text style={styles.valueText}>
                {categoryIcon} {categoryLabel}
              </Text>
            }
            onPress={() => setCategoryOpen(true)}
          />
        </View>

        {/* 4. 日期类型 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>日期类型</Text>
          <SegmentedButtons
            value={calendarType}
            onValueChange={next => handleCalendarTypeChange(next as CalendarType)}
            buttons={[
              { value: 'solar', label: '公历', icon: 'white-balance-sunny' },
              { value: 'lunar', label: '农历', icon: 'moon-waning-crescent' },
            ]}
          />
        </View>

        {/* 5/6/7/8. 日期与时间 */}
        <View style={styles.section}>
          <SettingRow
            icon="calendar"
            title={calendarType === 'lunar' ? '农历日期' : '目标日期'}
            description={isLunarReady ? `公历 ${date}` : undefined}
            right={
              <Text style={styles.valueText}>
                {isLunarReady && lunarInfo ? lunarInfo.fullDate : date}
              </Text>
            }
            onPress={() => setDateOpen(true)}
          />
          <Divider />
          <SettingRow
            icon="clock-outline"
            title="显示精准时间"
            description="关闭时只倒数到「天」"
            right={
              <Switch value={showPreciseTime} onValueChange={setShowPreciseTime} />
            }
          />
          {/* 开关一动，下面的内容伸缩展开，而不是直接"啪"地出现 */}
          <Collapsible open={showPreciseTime}>
            <Divider />
            <SettingRow
              icon="timer-outline"
              title="目标时间"
              right={<Text style={styles.valueText}>{time}</Text>}
              onPress={() => setTimeOpen(true)}
            />
            <Divider />
            <SettingRow
              icon="timer-sand"
              title="显示秒数"
              right={<Switch value={showSeconds} onValueChange={setShowSeconds} />}
            />
          </Collapsible>
        </View>

        {/* 9/10. 颜色 */}
        <View style={styles.section}>
          <SettingRow
            icon="format-color-text"
            title="字体颜色"
            right={
              <View style={styles.colorValue}>
                <View
                  style={[
                    styles.colorDot,
                    {
                      backgroundColor:
                        TEXT_COLOR_OPTIONS.find(o => o.key === textColor)?.value ??
                        palette.peach,
                    },
                  ]}
                />
                <Text style={styles.valueText}>{textColorLabel}</Text>
              </View>
            }
            onPress={() => setTextColorOpen(true)}
          />
          <Divider />
          <SettingRow
            icon="palette-outline"
            title="背景颜色"
            right={
              <View style={styles.colorValue}>
                {bgColor === 'custom' && customBgColorValue ? (
                  <View
                    style={[styles.colorDot, { backgroundColor: customBgColorValue }]}
                  />
                ) : null}
                <Text style={styles.valueText}>{bgColorLabel}</Text>
              </View>
            }
            onPress={() => setBgColorOpen(true)}
          />
        </View>

        {/* 11/12. 置顶与卡片大小 */}
        <View style={styles.section}>
          <SettingRow
            icon="pin-outline"
            title="置顶显示"
            description="最多同时置顶 3 个"
            right={<Switch value={isTop} onValueChange={setIsTop} />}
          />
          <Divider />
          <SettingRow
            icon="card-outline"
            title="卡片大小"
            right={<Text style={styles.valueText}>{cardSizeLabel}</Text>}
          />
          <View style={styles.cardSizeRow}>
            {CARD_SIZE_OPTIONS.map(option => {
              const active = option.key === cardSize;
              return (
                <TouchableRipple
                  key={option.key}
                  onPress={() => setCardSize(option.key as CardSize)}
                  style={[styles.cardSizeItem, active && styles.cardSizeItemActive]}
                  borderless
                >
                  <View style={styles.cardSizeInner}>
                    <View
                      style={[
                        styles.cardSizePreview,
                        option.key === 'small' && styles.previewSmall,
                        option.key === 'medium' && styles.previewMedium,
                        option.key === 'large' && styles.previewLarge,
                        active && styles.previewActive,
                      ]}
                    />
                    <Text
                      style={[styles.cardSizeText, active && styles.cardSizeTextActive]}
                    >
                      {option.name}
                    </Text>
                  </View>
                </TouchableRipple>
              );
            })}
          </View>
        </View>

        {/* 13. 备注 */}
        <View style={styles.section}>
          <TextInput
            mode="outlined"
            label="备注"
            multiline
            numberOfLines={4}
            value={remark}
            onChangeText={text => setRemark(clampRemark(text))}
            style={[styles.input, styles.remark]}
            theme={inputTheme}
          />
          <Text style={styles.counter}>
            {remark.length} / {REMARK_MAX_LENGTH}
          </Text>
        </View>

        <Button
          mode="contained"
          icon="content-save"
          onPress={handleSave}
          style={styles.save}
          contentStyle={styles.saveContent}
        >
          保存
        </Button>
      </ScrollView>

      {/* ── 各类弹窗 ── */}
      <EmojiPicker
        visible={emojiOpen}
        value={icon}
        onSelect={setIcon}
        onDismiss={() => setEmojiOpen(false)}
      />

      <CategoryPicker
        visible={categoryOpen}
        value={category}
        onSelect={setCategory}
        onDismiss={() => setCategoryOpen(false)}
      />

      {/*
        公历 / 农历两个选择器共用 dateOpen 这一个开关，按日历类型二选一 ——
        和旧版 openDatePicker() 的做法一致（用户永远只会看到一个）。
      */}
      {calendarType === 'lunar' ? (
        <LunarWheelPicker
          visible={dateOpen}
          value={date}
          onConfirm={next => {
            setDate(next.date);
            setLunarInfo(next.lunarInfo);
            setDateOpen(false);
          }}
          onDismiss={() => setDateOpen(false)}
        />
      ) : (
        <DateWheelPicker
          visible={dateOpen}
          value={date}
          onConfirm={next => {
            setDate(next);

            setLunarInfo(undefined);
            setDateOpen(false);
          }}
          onDismiss={() => setDateOpen(false)}
        />
      )}

      <TimeWheelPicker
        visible={timeOpen}
        value={time}
        onConfirm={next => {
          setTime(next);
          setTimeOpen(false);
        }}
        onDismiss={() => setTimeOpen(false)}
      />

      <TextColorPicker
        visible={textColorOpen}
        value={textColor}
        onSelect={setTextColor}
        onDismiss={() => setTextColorOpen(false)}
      />

      <BgColorPicker
        visible={bgColorOpen}
        value={bgColor}
        customValue={customBgColorValue}
        onSelect={setBgColor}
        onPickCustom={() => {
          setBgColorOpen(false);
          setCustomColorOpen(true);
        }}
        onDismiss={() => setBgColorOpen(false)}
      />

      <CustomColorPicker
        visible={customColorOpen}
        value={customBgColorValue}
        onConfirm={value => {
          setCustomBgColorValue(value);
          setBgColor('custom');
          setCustomColorOpen(false);
        }}
        onDismiss={() => setCustomColorOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.cream,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    // 顶/底避让在渲染处按安全区算，这里不重复叠加
  },

  titleRow: {
    flexDirection: 'row',

    alignItems: 'center',
    gap: spacing.sm,
  },
  titleInput: {
    flex: 1,
  },
  input: {
    backgroundColor: '#FFFFFF',
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  sectionTitle: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    color: palette.cocoaSoft,
    fontWeight: '600',
  },
  row: {
    paddingVertical: spacing.xs,
  },
  valueText: {
    color: palette.cocoa,
  },
  valueEmoji: {
    fontSize: 26,
    lineHeight: 36,
    marginRight: spacing.lg,
  },
  colorValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginRight: spacing.lg,
  },
  colorDot: {
    width: 16,
    height: 16,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.15)',
  },
  note: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    color: palette.cocoaFaint,
  },

  cardSizeRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  cardSizeItem: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
  },
  cardSizeItemActive: {
    backgroundColor: palette.peachTint,
  },
  cardSizeInner: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  cardSizePreview: {
    backgroundColor: palette.pinkBlush,
    borderRadius: radius.sm,
  },
  previewSmall: {
    width: 44,
    height: 14,
  },
  previewMedium: {
    width: 44,
    height: 20,
  },
  previewLarge: {
    width: 44,
    height: 26,
  },
  previewActive: {
    backgroundColor: palette.peach,
  },
  cardSizeText: {
    color: palette.cocoaFaint,
  },
  cardSizeTextActive: {
    color: palette.cocoa,
    fontWeight: '700',
  },
  remark: {
    minHeight: 96,
  },
  counter: {
    marginTop: spacing.xs,

    paddingRight: spacing.lg,
    paddingBottom: spacing.lg,
    textAlign: 'right',
    color: palette.cocoaFaint,
  },
  save: {
    borderRadius: radius.pill,
  },
  saveContent: {
    paddingVertical: spacing.sm,
  },
});

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons as MaterialDesignIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from 'react-native-paper';

import BottomSheet from '../components/BottomSheet';
import FloatingBar, { FloatingButton } from '../components/FloatingBar';
import SettingRow from '../components/SettingRow';
import Switch from '../components/Switch';
import { useFeedback } from '../components/feedback';
import {
  ANIMATION_OPTIONS,
  COUNTDOWN_FORMAT_OPTIONS,
  DISPLAY_OPTIONS,
  DURATION_OPTIONS,
  EASING_OPTIONS,
  FONT_SIZE_OPTIONS,
  ORDER_OPTIONS,
  SLIDESHOW_ORIENTATION_OPTIONS,
  TRANSITION_OPTIONS,
  type SlideshowAnimation,
  type SlideshowOrientation,
  type ValueOption,
} from '../constants/slideshow';
import { FLOATING_BUTTON_SIZE, FLOATING_CLEARANCE } from '../navigation/layout';
import type { RootStackParamList } from '../navigation/types';
import { useEventStore } from '../store/useEventStore';
import { useSlideshowStore } from '../store/useSlideshowStore';
import { palette, radius, spacing } from '../theme';
import { SLIDESHOW_ERROR_MESSAGE, filterAndSortForSlideshow } from '../utils/slideshow';

/**
 * 放映设置（Slice 14）
 *
 * 结构照旧版 `legacy/uniapp/pages/slideshow/settings.vue` 的五组设置，
 * 但**控件样式刻意做了区分**，不是一水儿的胶囊：
 *
 *   | 设置项 | 控件 |
 *   |---|---|
 *   | 停留时长 / 过渡时长 / 字体大小 / 播放顺序 | 分段控件（连体、等宽，选中块填充） |
 *   | 缓动曲线 | 行 + 右侧当前值，点开底部面板选（项目统一的选择器） |
 *   | 循环 / 自动播放 / 3D / 筛选 / 背景 | 开关 |
 *   | 过渡动画 | 图标网格（12 个方块，图标 + 名称） |
 *   | 显示元素 | 双列开关网格 |
 *   | 倒计时格式 | 单选列表（右侧勾） |
 *   | 屏幕方向 | 四个「手机示意」预览卡，直接看出是哪个朝向 |
 *
 * 「开始放映 / 恢复默认」放在**顶部**和返回键同一行，不再占底部一整条。
 */

type Navigation = NativeStackNavigationProp<RootStackParamList>;

/** 需要弹底部面板的项（目前只有缓动曲线；播放顺序已改成内联分段控件） */
type SheetKind = 'easing';

export default function SlideshowSettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Navigation>();
  const { toast, confirm } = useFeedback();

  const events = useEventStore(state => state.events);
  const config = useSlideshowStore(state => state.config);
  const setConfig = useSlideshowStore(state => state.setConfig);
  const setDisplay = useSlideshowStore(state => state.setDisplay);
  const resetConfig = useSlideshowStore(state => state.reset);

  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [bgSheet, setBgSheet] = useState(false);

  useEffect(() => {
    void useSlideshowStore.getState().load();
  }, []);

  const goBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('Tabs');
  }, [navigation]);

  /** 开始前校验：没有可播的事件时要给出明确原因（照旧版的错误码） */
  const handleStart = useCallback(() => {
    const result = filterAndSortForSlideshow(events, config);
    if (result.code !== 'ok') {
      toast(SLIDESHOW_ERROR_MESSAGE[result.code]);
      return;
    }
    navigation.navigate('SlideshowPlayer');
  }, [config, events, navigation, toast]);

  const handleReset = useCallback(async () => {
    const ok = await confirm({
      title: '恢复默认',
      message: '确定要恢复默认设置吗？',
      confirmText: '确定',
    });
    if (!ok) return;
    resetConfig();
    toast('已恢复默认');
  }, [confirm, resetConfig, toast]);

  const handlePickBackground = useCallback(
    async (source: 'library' | 'camera') => {
      setBgSheet(false);
      const result = await pickBackgroundImage(source);
      if (!result.uri) {
        if (result.message) toast(result.message);
        return;
      }
      setConfig('customBgImage', result.uri);
      setConfig('useCustomBg', true);
      toast('背景设置成功');
    },
    [setConfig, toast],
  );

  const handleResetBackground = useCallback(() => {
    setBgSheet(false);
    setConfig('customBgImage', '');
    setConfig('useCustomBg', false);
    toast('已恢复默认背景');
  }, [setConfig, toast]);

  /** 当前底部面板里要选的那组（缓动曲线） */
  const sheetOptions: ReadonlyArray<ValueOption<string>> = EASING_OPTIONS;
  const sheetValue = config.easing;

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + FLOATING_CLEARANCE,
            paddingBottom: insets.bottom + spacing.xxl,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 播放设置 ── */}
        <Section icon="play-circle-outline" title="播放设置">
          <FieldBlock label="停留时长">
            <Segmented
              options={DURATION_OPTIONS}
              value={config.duration}
              onChange={value => setConfig('duration', value)}
            />
          </FieldBlock>

          <FieldBlock label="过渡时长">
            <Segmented
              options={TRANSITION_OPTIONS}
              value={config.transitionDuration}
              onChange={value => setConfig('transitionDuration', value)}
            />
          </FieldBlock>

          <FieldBlock label="播放顺序">
            <Segmented
              options={ORDER_OPTIONS}
              value={config.order}
              onChange={value => setConfig('order', value)}
            />
          </FieldBlock>

          <ToggleRow
            icon="repeat"
            title="循环播放"
            value={config.loop}
            onChange={value => setConfig('loop', value)}
          />
          <ToggleRow
            icon="play-speed"
            title="自动播放"
            value={config.autoPlay}
            onChange={value => setConfig('autoPlay', value)}
          />
        </Section>

        {/* ── 动画设置 ── */}
        <Section icon="animation-outline" title="动画设置">
          <FieldBlock label="过渡动画">
            <View style={styles.animGrid}>
              {ANIMATION_OPTIONS.map(option => {
                const active = option.value === config.animation;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setConfig('animation', option.value)}
                    style={[styles.animCell, active && styles.animCellActive]}
                    android_ripple={{ color: palette.peachLine20 }}
                  >
                    <MaterialDesignIcons
                      name={ANIMATION_ICONS[option.value]}
                      size={22}
                      color={active ? palette.peachDeep : palette.mauve}
                    />
                    <Text style={[styles.animLabel, active && styles.animLabelActive]} numberOfLines={1}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </FieldBlock>

          <PickerRow
            icon="chart-bell-curve"
            title="缓动曲线"
            value={EASING_OPTIONS.find(o => o.value === config.easing)?.label ?? ''}
            onPress={() => setSheet('easing')}
          />

          <ToggleRow
            icon="rotate-3d-variant"
            title="启用3D效果"
            description="翻转 / 立方体 / 卡片动画的透视感"
            value={config.enable3D}
            onChange={value => setConfig('enable3D', value)}
          />
        </Section>

        {/* ── 显示内容 ── */}
        <Section icon="eye-outline" title="显示内容">
          <FieldBlock label="显示元素">
            <View style={styles.displayGrid}>
              {DISPLAY_OPTIONS.map(item => (
                <View key={item.key} style={styles.displayItem}>
                  <Text variant="bodyMedium" style={styles.displayLabel} numberOfLines={1}>
                    {item.label}
                  </Text>
                  <Switch
                    size="small"
                    value={config.display[item.key]}
                    onValueChange={value => setDisplay(item.key, value)}
                  />
                </View>
              ))}
            </View>
          </FieldBlock>

          <FieldBlock label="倒计时格式">
            <View style={styles.radioGroup}>
              {COUNTDOWN_FORMAT_OPTIONS.map(option => {
                const active = option.value === config.countdownFormat;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setConfig('countdownFormat', option.value)}
                    style={styles.radioRow}
                    android_ripple={{ color: palette.peachLine20 }}
                  >
                    <View style={[styles.radioDot, active && styles.radioDotActive]}>
                      {active ? <View style={styles.radioDotInner} /> : null}
                    </View>
                    <Text style={[styles.radioLabel, active && styles.radioLabelActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </FieldBlock>

          <FieldBlock label="字体大小">
            <Segmented
              options={FONT_SIZE_OPTIONS}
              value={config.fontSize}
              onChange={value => setConfig('fontSize', value)}
            />
          </FieldBlock>

          <FieldBlock label="屏幕方向">
            <OrientationPicker
              value={config.screenOrientation}
              onChange={value => setConfig('screenOrientation', value)}
            />
            <Text variant="bodySmall" style={styles.hint}>
              屏幕方向将在放映时生效
            </Text>
          </FieldBlock>
        </Section>

        {/* ── 放映背景 ── */}
        <Section icon="image-outline" title="放映背景">
          <ToggleRow
            icon="image-filter-hdr"
            title="使用自定义背景"
            description={config.useCustomBg ? '显示自定义背景图片' : '使用默认背景'}
            value={config.useCustomBg}
            onChange={value => {
              setConfig('useCustomBg', value);
              if (value && !config.customBgImage) setBgSheet(true);
            }}
          />
          {config.useCustomBg ? (
            <PickerRow
              icon="image-multiple-outline"
              title={config.customBgImage ? '更换背景图' : '选择背景图'}
              onPress={() => setBgSheet(true)}
            />
          ) : null}
        </Section>

        {/* ── 筛选设置 ── */}
        <Section icon="filter-variant" title="筛选设置">
          <ToggleRow
            icon="calendar-arrow-right"
            title="包含未来事件"
            value={config.futureEvents}
            onChange={value => setConfig('futureEvents', value)}
          />
          <ToggleRow
            icon="calendar-arrow-left"
            title="包含已过事件"
            value={config.pastEvents}
            onChange={value => setConfig('pastEvents', value)}
          />
          <ToggleRow
            icon="pin-outline"
            title="置顶优先"
            value={config.priorityFirst}
            onChange={value => setConfig('priorityFirst', value)}
          />
        </Section>
      </ScrollView>

      <FloatingBar
        left={<FloatingButton icon="arrow-left" onPress={goBack} accessibilityLabel="返回" />}
        right={
          <>
            <TopButton
              icon="restore"
              label="恢复默认"
              onPress={() => void handleReset()}
              accessibilityLabel="恢复默认"
            />
            <TopButton
              icon="play"
              label="开始放映"
              primary
              onPress={handleStart}
              accessibilityLabel="开始放映"
            />
          </>
        }
      />

      {/* 缓动曲线：底部面板选 */}
      <BottomSheet
        visible={sheet !== null}
        title="缓动曲线"
        onDismiss={() => setSheet(null)}
        heightRatio={0.46}
      >
        <View style={styles.sheetList}>
          {sheetOptions.map(option => {
            const active = option.value === sheetValue;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  setConfig('easing', option.value as typeof config.easing);
                  setSheet(null);
                }}
                style={styles.sheetOption}
                android_ripple={{ color: palette.peachLine20 }}
              >
                <Text variant="bodyLarge" style={styles.sheetOptionLabel}>
                  {option.label}
                </Text>
                {active ? (
                  <MaterialDesignIcons name="check" size={20} color={palette.peachDeep} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>

      {/* 背景来源 */}
      <BottomSheet
        visible={bgSheet}
        title="选择背景"
        onDismiss={() => setBgSheet(false)}
        heightRatio={0.36}
      >
        <View style={styles.sheetList}>
          <SheetOption
            icon="image-multiple-outline"
            label="从相册选择"
            onPress={() => void handlePickBackground('library')}
          />
          <SheetOption
            icon="camera-outline"
            label="拍照"
            onPress={() => void handlePickBackground('camera')}
          />
          <SheetOption icon="restore" label="恢复默认背景" onPress={handleResetBackground} />
        </View>
      </BottomSheet>
    </View>
  );
}



function Section({
  icon,
  title,
  children,
}: {
  icon: React.ComponentProps<typeof MaterialDesignIcons>['name'];
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <MaterialDesignIcons name={icon} size={16} color={palette.mauveLight} />
        <Text variant="bodySmall" style={styles.sectionTitle}>
          {title}
        </Text>
      </View>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

/** 卡片里的一段：上方小标题（左边距和 SettingRow 对齐），下方放控件 */
function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.fieldBlock}>
      <Text variant="bodySmall" style={styles.fieldLabel}>
        {label}
      </Text>
      {children}
    </View>
  );
}

/** 连体分段控件：等宽、选中块填充 */
function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<ValueOption<T>>;
  value: T;
  onChange(value: T): void;
}) {
  return (
    <View style={styles.segment}>
      {options.map(option => {
        const active = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            onPress={() => onChange(option.value)}
            style={[styles.segmentItem, active && styles.segmentItemActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** 行 + 右侧当前值：点开底部面板选 */
function PickerRow({
  icon,
  title,
  value,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialDesignIcons>['name'];
  title: string;
  value?: string;
  onPress(): void;
}) {
  return (
    <SettingRow
      icon={icon}
      title={title}
      onPress={onPress}
      right={
        <View style={styles.pickerValue}>
          {value ? (
            <Text variant="bodyMedium" style={styles.pickerValueText}>
              {value}
            </Text>
          ) : null}
          <MaterialDesignIcons name="chevron-right" size={20} color={palette.mauveLight} />
        </View>
      }
    />
  );
}

/** 开关行：复用设置页的 SettingRow，右侧放自研 Switch */
function ToggleRow({
  icon,
  title,
  description,
  value,
  onChange,
}: {
  icon: React.ComponentProps<typeof MaterialDesignIcons>['name'];
  title: string;
  description?: string;
  value: boolean;
  onChange(value: boolean): void;
}) {
  return (
    <SettingRow
      icon={icon}
      title={title}
      description={description}
      right={<Switch value={value} onValueChange={onChange} />}
    />
  );
}

/** 手机示意朝向：外框里的短横线代表「屏幕顶端」 */
const ORIENTATION_ROTATE: Record<SlideshowOrientation, string> = {
  'portrait-primary': '0deg',
  'portrait-secondary': '180deg',
  'landscape-primary': '90deg',
  'landscape-secondary': '-90deg',
};

function OrientationPicker({
  value,
  onChange,
}: {
  value: SlideshowOrientation;
  onChange(value: SlideshowOrientation): void;
}) {
  return (
    <View style={styles.orientationRow}>
      {SLIDESHOW_ORIENTATION_OPTIONS.map(option => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.orientationCard, active && styles.orientationCardActive]}
            android_ripple={{ color: palette.peachLine20 }}
          >
            <View style={styles.phoneBox}>
              <View
                style={[
                  styles.phone,
                  { borderColor: active ? palette.peachDeep : palette.mauveLight },
                  { transform: [{ rotate: ORIENTATION_ROTATE[option.value] }] },
                ]}
              >
                <View
                  style={[
                    styles.phoneTop,
                    { backgroundColor: active ? palette.peachDeep : palette.mauveLight },
                  ]}
                />
              </View>
            </View>
            <Text style={[styles.orientationLabel, active && styles.orientationLabelActive]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** 顶部操作胶囊：和悬浮返回键同一套白底 + 蜜桃描边，主操作填充 */
function TopButton({
  icon,
  label,
  onPress,
  primary = false,
  accessibilityLabel,
}: {
  icon: React.ComponentProps<typeof MaterialDesignIcons>['name'];
  label: string;
  onPress(): void;
  primary?: boolean;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.topButton,
        primary && styles.topButtonPrimary,
        pressed && styles.topButtonPressed,
      ]}
    >
      <MaterialDesignIcons name={icon} size={18} color={primary ? '#FFFFFF' : palette.cocoa} />
      <Text style={[styles.topButtonText, primary && styles.topButtonTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

function SheetOption({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialDesignIcons>['name'];
  label: string;
  onPress(): void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.sheetOption}
      android_ripple={{ color: palette.peachLine20 }}
    >
      <MaterialDesignIcons name={icon} size={22} color={palette.mauve} />
      <Text variant="bodyLarge" style={styles.sheetOptionLabel}>
        {label}
      </Text>
    </Pressable>
  );
}



const ANIMATION_ICONS: Record<SlideshowAnimation, React.ComponentProps<typeof MaterialDesignIcons>['name']> = {
  fade: 'opacity',
  slide: 'arrow-left-right',
  'slide-v': 'arrow-up-down',
  flip: 'flip-horizontal',
  cube: 'cube-outline',
  zoom: 'magnify-plus-outline',
  stack: 'layers-outline',
  blinds: 'blinds',
  blur: 'blur',
  rotate: 'rotate-3d-variant',
  card: 'card-outline',
  random: 'shuffle-variant',
};



/**
 * 选一张背景图，返回本地 URI。
 *
 * 与头像不同，背景不做裁剪压缩 —— 直接存 URI，由 `Image` 的
 * `resizeMode="cover"` 在渲染层处理。
 * ⚠️ 存的是 picker 给的临时 URI（和旧版一样），系统清理缓存后可能失效；
 * 真要长期稳定得先把图拷进应用私有目录（需要 expo-file-system，暂未引入）。
 */
async function pickBackgroundImage(
  source: 'library' | 'camera',
): Promise<{ uri?: string; message?: string }> {
  try {
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return { message: '需要相机权限才能拍照' };
    } else {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return { message: '需要相册权限才能选图' };
    }

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: 1,
    };
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

    if (result.canceled) return {};
    const uri = result.assets?.[0]?.uri;
    return uri ? { uri } : { message: '没能读到这张图片，请换一张试试' };
  } catch (error) {
    console.warn('[slideshow] 选择背景图失败', error);
    return { message: '处理图片失败了，请换一张试试' };
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    marginLeft: spacing.sm,
  },
  sectionTitle: {
    color: palette.cocoaFaint,
  },
  card: {
    borderRadius: radius.lg,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: palette.peachLine20,
    overflow: 'hidden',
  },

  fieldBlock: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  fieldLabel: {
    color: palette.cocoaFaint,
  },
  hint: {
    color: palette.cocoaFaint,
  },


  segment: {
    flexDirection: 'row',
    backgroundColor: palette.peachTint,
    borderRadius: radius.md,
    padding: 3,
    gap: 3,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  segmentItemActive: {
    backgroundColor: '#FFFFFF',
  },
  segmentText: {
    color: palette.cocoaFaint,
  },
  segmentTextActive: {
    color: palette.peachDeep,
    fontWeight: '700',
  },


  animGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  animCell: {

    width: '31.5%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.peachLine20,
    backgroundColor: palette.creamRose,
  },
  animCellActive: {
    borderColor: palette.peach,
    backgroundColor: palette.peachTint,
  },
  animLabel: {
    color: palette.cocoaFaint,
    fontSize: 12,
  },
  animLabelActive: {
    color: palette.peachDeep,
    fontWeight: '700',
  },


  radioGroup: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.peachLine20,
    overflow: 'hidden',
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  radioDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: palette.mauveLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDotActive: {
    borderColor: palette.peachDeep,
  },
  radioDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.peachDeep,
  },
  radioLabel: {
    color: palette.cocoaSoft,
  },
  radioLabelActive: {
    color: palette.cocoa,
    fontWeight: '600',
  },


  displayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  displayItem: {
    width: '50%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingRight: spacing.lg,
  },
  displayLabel: {
    color: palette.cocoa,
    flexShrink: 1,
  },


  orientationRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  orientationCard: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.peachLine20,
    backgroundColor: palette.creamRose,
  },
  orientationCardActive: {
    borderColor: palette.peach,
    backgroundColor: palette.peachTint,
  },
  phoneBox: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phone: {
    width: 20,
    height: 34,
    borderRadius: 5,
    borderWidth: 2,
    alignItems: 'center',
    paddingTop: 3,
  },
  phoneTop: {
    width: 8,
    height: 2.5,
    borderRadius: 2,
  },
  orientationLabel: {
    color: palette.cocoaFaint,
    fontSize: 12,
  },
  orientationLabelActive: {
    color: palette.peachDeep,
    fontWeight: '700',
  },


  topButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: FLOATING_BUTTON_SIZE,
    paddingHorizontal: spacing.md,
    borderRadius: FLOATING_BUTTON_SIZE / 2,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: palette.peachLine20,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  topButtonPrimary: {
    backgroundColor: palette.peach,
    borderColor: palette.peachDeep,
  },
  topButtonPressed: {
    opacity: 0.85,
  },
  topButtonText: {
    color: palette.cocoa,
    fontWeight: '600',
  },
  topButtonTextPrimary: {
    color: '#FFFFFF',
  },


  pickerValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  pickerValueText: {
    color: palette.peachDeep,
  },


  sheetList: {
    paddingTop: spacing.xs,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
  },
  sheetOptionLabel: {
    flex: 1,
    color: palette.cocoa,
  },
});

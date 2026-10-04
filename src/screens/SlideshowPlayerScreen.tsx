import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useKeepAwake } from 'expo-keep-awake';
import * as ScreenOrientation from 'expo-screen-orientation';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from 'react-native-paper';

import { useFeedback } from '../components/feedback';
import {
  ANIMATION_POOL,
  SLIDESHOW_BASE_FONT,
  SLIDESHOW_CATEGORY_FALLBACK,
  SLIDESHOW_FONT_SCALE,
  type SlideshowAnimation,
  type SlideshowEasing,
  type SlideshowOrientation,
} from '../constants/slideshow';
import { useTick } from '../hooks/useTick';
import type { RootStackParamList } from '../navigation/types';
import { useCategoryStore } from '../store/useCategoryStore';
import { useEventStore } from '../store/useEventStore';
import { useSlideshowStore } from '../store/useSlideshowStore';
import { backgroundGradient, cardGradient, palette, radius, spacing } from '../theme';
import { restoreOrientation } from '../utils/orientation';
import {
  buildSlide,
  filterAndSortForSlideshow,
  getCountdownBlocks,
  getCountdownLabel,
  resolveEventBgColor,
  resolveEventTextColor,
  type SlideItem,
} from '../utils/slideshow';

/**
 * 全屏播放器（Slice 14）
 *
 * 交互照旧版 `legacy/uniapp/pages/slideshow/player.js`：
 *   - 每张停留 `duration` 毫秒后自动切，切之前先播「出场」再播「入场」
 *   - 左右滑动切上一张 / 下一张；双击暂停；单击显示 / 隐藏控件（3 秒后自动隐藏）
 *   - 进度条 + 圆点指示 + 上一张 / 播放 / 下一张 / 关闭
 *   - 退出要二次确认；全屏隐藏状态栏；屏幕常亮；按配置锁方向
 *
 * 与旧版的差异：
 *   1. 数据不走事件总线（旧版 `uni.$emit('slideshow:start')`），
 *      直接从事件 store + 配置 store 里取，重算一次（与设置页同一套纯函数）。
 *   2. 12 种动画里 **blur 用「淡入 + 轻微缩放」近似**（RN 没有原生模糊动画），
 *      其余 11 种都是真实的位移 / 旋转 / 缩放。
 *   3. 控件统一放底部（旧版横屏时是左侧竖排），一套布局横竖屏通用。
 */

type Navigation = NativeStackNavigationProp<RootStackParamList>;

/** 控件自动隐藏延时（旧版 3000ms） */
const CONTROLS_HIDE_DELAY = 3000;

/** 缓动曲线：全部用贝塞尔实现，原生驱动可识别 */
const EASING_MAP: Record<SlideshowEasing, (value: number) => number> = {
  linear: Easing.linear,
  'ease-in-out': Easing.bezier(0.42, 0, 0.58, 1),
  'ease-out': Easing.bezier(0, 0, 0.58, 1),
  spring: Easing.bezier(0.34, 1.56, 0.64, 1),
  bounce: Easing.bezier(0.68, -0.55, 0.27, 1.55),
};

const ORIENTATION_LOCK: Record<SlideshowOrientation, ScreenOrientation.OrientationLock> = {
  'portrait-primary': ScreenOrientation.OrientationLock.PORTRAIT_UP,
  'portrait-secondary': ScreenOrientation.OrientationLock.PORTRAIT_DOWN,
  'landscape-primary': ScreenOrientation.OrientationLock.LANDSCAPE,

  'landscape-secondary': ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT,
};

export default function SlideshowPlayerScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Navigation>();
  const { confirm } = useFeedback();
  const { width, height } = useWindowDimensions();


  useKeepAwake();

  const events = useEventStore(state => state.events);
  const config = useSlideshowStore(state => state.config);
  const configLoaded = useSlideshowStore(state => state.loaded);
  const loadConfig = useSlideshowStore(state => state.load);
  const categories = useCategoryStore(state => state.all);


  const tick = useTick();

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  /** 只算一次「顺序 + 那一批事件」，倒计时在渲染层按当前时间重算 */
  const slides = useMemo(() => filterAndSortForSlideshow(events, config).events, [events, config]);


  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [controlsShown, setControlsShown] = useState(true);

  const indexRef = useRef(0);
  const playingRef = useRef(false);
  /** 正在播过渡动画，期间忽略新的切换请求 */
  const busyRef = useRef(false);
  const directionRef = useRef(1);
  /** 本次过渡使用的动画（random 时每次重新抽） */
  const animationRef = useRef<Exclude<SlideshowAnimation, 'random'>>('fade');
  const slideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap = useRef(0);
  /** 单击的延迟判定会在 300ms 后才跑，卸载后不能再 setState */
  const mountedRef = useRef(true);

  const anim = useRef(new Animated.Value(1)).current; 
  const progress = useRef(new Animated.Value(0)).current; 
  const controlsAnim = useRef(new Animated.Value(1)).current;

  const fontSize = SLIDESHOW_FONT_SCALE[config.fontSize];


  const categoryOf = useMemo(() => {
    const map = new Map(categories.map(item => [item.key, item]));
    return (key: string) => map.get(key);
  }, [categories]);


  const clearSlideTimer = useCallback(() => {
    if (slideTimer.current) {
      clearTimeout(slideTimer.current);
      slideTimer.current = null;
    }
  }, []);

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const startProgress = useCallback(() => {
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: config.duration,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();
  }, [config.duration, progress]);

  const advance = useCallback(
    (dir: 1 | -1) => {
      const total = slides.length;
      if (total <= 1 || busyRef.current) return;

      const current = indexRef.current;
      let target: number;
      if (dir > 0) {
        if (current < total - 1) target = current + 1;
        else if (config.loop) target = 0;
        else {

          playingRef.current = false;
          setPlaying(false);
          clearSlideTimer();
          return;
        }
      } else if (current > 0) {
        target = current - 1;
      } else if (config.loop) {
        target = total - 1;
      } else {
        return;
      }

      directionRef.current = dir;
      animationRef.current =
        config.animation === 'random'
          ? ANIMATION_POOL[Math.floor(Math.random() * ANIMATION_POOL.length)]
          : config.animation;

      busyRef.current = true;
      resetControlHideTimer();

      const easing = EASING_MAP[config.easing] ?? Easing.linear;
      const duration = Math.max(80, config.transitionDuration);

      Animated.timing(anim, {
        toValue: 0,
        duration,
        easing,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) {
          busyRef.current = false;
          return;
        }

        indexRef.current = target;
        setIndex(target);
        anim.setValue(0);


        progress.stopAnimation();
        progress.setValue(0);


        if (playingRef.current) {
          startProgress();
          clearSlideTimer();
          slideTimer.current = setTimeout(() => advance(1), config.duration);
        }

        Animated.timing(anim, {
          toValue: 1,
          duration,
          easing,
          useNativeDriver: true,
        }).start(() => {
          busyRef.current = false;
        });
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      slides.length,
      config.loop,
      config.duration,
      config.animation,
      config.easing,
      config.transitionDuration,
      progress,
      startProgress,
      clearSlideTimer,
    ],
  );


  const showControlsNow = useCallback(() => {
    setControlsShown(true);
    Animated.timing(controlsAnim, {
      toValue: 1,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [controlsAnim]);

  const hideControls = useCallback(() => {
    setControlsShown(false);
    Animated.timing(controlsAnim, {
      toValue: 0,
      duration: 200,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [controlsAnim]);

  /**
   * 只重置「多久后隐藏」的计时器，**不强制把控件显示出来**。
   *
   * 照旧版 `resetControlHideTimer()` 的语义：自动切到下一张时也调它，
   * 但那时用户可能刚把控件收起来，不该被重新弹出来。
   */
  const resetControlHideTimer = useCallback(() => {
    clearHideTimer();
    hideTimer.current = setTimeout(hideControls, CONTROLS_HIDE_DELAY);
  }, [clearHideTimer, hideControls]);


  const play = useCallback(() => {
    playingRef.current = true;
    setPlaying(true);
    startProgress();
    clearSlideTimer();
    if (slides.length > 1) {
      slideTimer.current = setTimeout(() => advance(1), config.duration);
    }
  }, [advance, clearSlideTimer, config.duration, slides.length, startProgress]);

  const pause = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    clearSlideTimer();
    progress.stopAnimation();
  }, [clearSlideTimer, progress]);

  const togglePlay = useCallback(() => {
    if (playingRef.current) pause();
    else play();
    resetControlHideTimer();
  }, [pause, play, resetControlHideTimer]);


  const handleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      lastTap.current = 0;
      togglePlay();
      return;
    }
    lastTap.current = now;

    setTimeout(() => {
      if (!mountedRef.current) return;
      if (lastTap.current !== 0) {
        lastTap.current = 0;
        if (controlsShown) {
          hideControls();
        } else {
          showControlsNow();
          resetControlHideTimer();
        }
      }
    }, 300);
  }, [controlsShown, hideControls, resetControlHideTimer, showControlsNow, togglePlay]);


  const advanceRef = useRef(advance);
  advanceRef.current = advance;
  const tapRef = useRef(handleTap);
  tapRef.current = handleTap;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_evt, gesture) =>
        Math.abs(gesture.dx) > 8 || Math.abs(gesture.dy) > 8,
      onPanResponderRelease: (_evt, gesture) => {
        const { dx, dy } = gesture;
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
          tapRef.current();
          return;
        }
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
          advanceRef.current(dx > 0 ? -1 : 1);
        }
      },
    }),
  ).current;


  useEffect(() => {
    if (!configLoaded) return;

    const lock =
      ORIENTATION_LOCK[config.screenOrientation] ?? ScreenOrientation.OrientationLock.PORTRAIT_UP;
    ScreenOrientation.lockAsync(lock).catch(error => {
      console.warn('[slideshow] 锁定屏幕方向失败', error);
    });

    showControlsNow();
    resetControlHideTimer();
    if (config.autoPlay) play();

    return () => {
      mountedRef.current = false;
      clearSlideTimer();
      clearHideTimer();
      progress.stopAnimation();

      void restoreOrientation();
    };
    // 只在「配置就绪」这一个时机进/出一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configLoaded]);


  const leavingRef = useRef(false);
  usePreventRemove(true, ({ data }) => {
    if (leavingRef.current) {
      navigation.dispatch(data.action);
      return;
    }
    pause();
    void confirm({
      title: '退出放映',
      message: '确定要退出放映吗？',
      confirmText: '退出',
      cancelText: '取消',
    }).then(ok => {
      if (ok) {
        leavingRef.current = true;
        navigation.dispatch(data.action);
      } else if (config.autoPlay) {

        play();
      }
    });
  });


  const sourceSlide = slides[index];
  /**
   * 当前这一张的展示数据**每次 tick 重算** ——
   * `slides` 只在进入时算了一次（顺序固定），倒计时得跟着秒跳，
   * 所以从它的原始事件重新 build 一份。
   */
  const current: SlideItem | undefined = useMemo(
    () => (sourceSlide ? buildSlide(sourceSlide, Date.now()) : undefined),
    [sourceSlide, tick],
  );
  const isLandscape = width > height;

  const animStyle = useMemo(
    () => buildAnimationStyle(anim, animationRef.current, directionRef.current, width, height, config.enable3D),

    // eslint-disable-next-line react-hooks/exhaustive-deps
    [anim, index, width, height, config.enable3D],
  );

  const resolvedBg = current ? resolveEventBgColor(current) : null;

  if (!current) {
    return (
      <View style={[styles.root, styles.emptyRoot]}>
        <StatusBar hidden />
        <Text style={styles.emptyText}>没有可放映的事件</Text>
        <ControlButton icon="close" label="退出" onPress={() => navigation.goBack()} />
      </View>
    );
  }

  const category = categoryOf(current.category);
  const fallback = SLIDESHOW_CATEGORY_FALLBACK[current.category];
  const categoryName = category?.name ?? fallback?.name ?? '其他';
  const categoryIcon = category?.icon ?? fallback?.icon ?? '📌';

  const countdownBlocks = getCountdownBlocks(current, config.countdownFormat);
  const countdownLabel = getCountdownLabel(current);
  const hasCustomColor = current.textColor !== 'default' && current.textColor !== 'blue';
  const countdownColor = hasCustomColor
    ? resolveEventTextColor(current)
    : current.isPast
      ? palette.online
      : palette.peachDeep;

  return (
    <View style={styles.root}>
      <StatusBar hidden />

      {/* 背景层 */}
      {config.useCustomBg && config.customBgImage ? (
        <Image source={{ uri: config.customBgImage }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <LinearGradient
          colors={backgroundGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* 手势层：铺满全屏，控件在其上层单独接管点击 */}
      <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers}>
        <View style={styles.center}>
          <Animated.View
            style={[
              styles.card,
              isLandscape && styles.cardLandscape,
              { transform: animStyle.transform, opacity: animStyle.opacity },
            ]}
          >
            {resolvedBg ? (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: resolvedBg }]} />
            ) : (
              <LinearGradient
                colors={cardGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            )}

            {isLandscape ? (
              <View style={[styles.landscapeRow, { padding: spacing.xl }]}>
                <View style={styles.landscapeLeft}>
                  {config.display.showIcon ? (
                    <Text style={[styles.icon, { fontSize: SLIDESHOW_BASE_FONT.icon * fontSize }]}>
                      {current.icon}
                    </Text>
                  ) : null}
                  {config.display.showTitle ? (
                    <Text
                      style={[styles.title, { fontSize: SLIDESHOW_BASE_FONT.title * fontSize }]}
                      numberOfLines={2}
                    >
                      {current.title}
                    </Text>
                  ) : null}
                  {config.display.showCategory ? (
                    <CategoryTag
                      icon={categoryIcon}
                      name={categoryName}
                      fontSize={SLIDESHOW_BASE_FONT.category * fontSize}
                    />
                  ) : null}
                  {config.display.showNote && current.remark ? (
                    <Text
                      style={[styles.note, { fontSize: SLIDESHOW_BASE_FONT.note * fontSize }]}
                      numberOfLines={3}
                    >
                      {current.remark}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.landscapeRight}>
                  <CountdownArea
                    slide={current}
                    label={countdownLabel}
                    blocks={countdownBlocks}
                    color={countdownColor}
                    showUnit={config.display.showUnit}
                    showCountdown={config.display.showCountdown}
                    fontSize={fontSize}
                  />
                  <DateRow
                    slide={current}
                    showDate={config.display.showDate}
                    showWeekday={config.display.showWeekday}
                    fontSize={fontSize}
                  />
                </View>
              </View>
            ) : (
              <View style={[styles.portrait, { padding: spacing.xl }]}>
                <View style={styles.portraitHeader}>
                  {config.display.showIcon ? (
                    <Text style={[styles.icon, { fontSize: SLIDESHOW_BASE_FONT.icon * fontSize }]}>
                      {current.icon}
                    </Text>
                  ) : null}
                  {config.display.showCategory ? (
                    <CategoryTag
                      icon={categoryIcon}
                      name={categoryName}
                      fontSize={SLIDESHOW_BASE_FONT.category * fontSize}
                    />
                  ) : null}
                </View>

                {config.display.showTitle ? (
                  <Text
                    style={[styles.title, { fontSize: SLIDESHOW_BASE_FONT.title * fontSize }]}
                    numberOfLines={2}
                  >
                    {current.title}
                  </Text>
                ) : null}

                <CountdownArea
                  slide={current}
                  label={countdownLabel}
                  blocks={countdownBlocks}
                  color={countdownColor}
                  showUnit={config.display.showUnit}
                  showCountdown={config.display.showCountdown}
                  fontSize={fontSize}
                />

                <DateRow
                  slide={current}
                  showDate={config.display.showDate}
                  showWeekday={config.display.showWeekday}
                  fontSize={fontSize}
                />

                {config.display.showNote && current.remark ? (
                  <Text
                    style={[styles.note, { fontSize: SLIDESHOW_BASE_FONT.note * fontSize }]}
                    numberOfLines={3}
                  >
                    {current.remark}
                  </Text>
                ) : null}
              </View>
            )}
          </Animated.View>
        </View>
      </View>

      {/* 控件层 */}
      <Animated.View
        style={[styles.controls, { opacity: controlsAnim, paddingBottom: insets.bottom + spacing.lg }]}
        pointerEvents={controlsShown ? 'box-none' : 'none'}
      >
        {slides.length > 1 && slides.length <= 20 ? (
          <View style={styles.dots} pointerEvents="none">
            {slides.map((slide, i) => (
              <View key={`${slide.id}-${i}`} style={[styles.dot, i === index && styles.dotActive]} />
            ))}
          </View>
        ) : null}

        <View style={styles.controlRow} pointerEvents="box-none">
          <ControlButton icon="skip-previous" label="上一张" onPress={() => advance(-1)} />
          <ControlButton
            icon={playing ? 'pause' : 'play'}
            label={playing ? '暂停' : '播放'}
            size={56}
            onPress={togglePlay}
          />
          <ControlButton icon="skip-next" label="下一张" onPress={() => advance(1)} />
          <ControlButton icon="close" label="退出" onPress={() => navigation.goBack()} />
        </View>

        <View style={styles.progressRow} pointerEvents="none">
          <View style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  width: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {index + 1} / {slides.length}
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}



function CategoryTag({ icon, name, fontSize }: { icon: string; name: string; fontSize: number }) {
  return (
    <View style={styles.tag}>
      <Text style={{ fontSize }}>{icon}</Text>
      <Text style={[styles.tagText, { fontSize }]}>{name}</Text>
    </View>
  );
}

function CountdownArea({
  slide,
  label,
  blocks,
  color,
  showUnit,
  showCountdown,
  fontSize,
}: {
  slide: SlideItem;
  label: string;
  blocks: ReturnType<typeof getCountdownBlocks>;
  color: string;
  showUnit: boolean;
  showCountdown: boolean;
  fontSize: number;
}) {
  if (!showCountdown) return null;

  return (
    <View style={styles.countdownWrapper}>
      <Text style={[styles.countdownLabel, { color, fontSize: SLIDESHOW_BASE_FONT.countdownLabel * fontSize }]}>
        {label}
      </Text>
      <View style={styles.countdownNumbers}>
        {blocks.map(block => (
          <View key={block.unit} style={styles.timeBlock}>
            <Text
              style={[styles.timeNumber, { color, fontSize: SLIDESHOW_BASE_FONT.countdownNumber * fontSize }]}
            >
              {slide.isPast ? Math.abs(block.value) : block.value}
            </Text>
            {!block.unitOptional || showUnit ? (
              <Text
                style={[styles.timeUnit, { color, fontSize: SLIDESHOW_BASE_FONT.countdownUnit * fontSize }]}
              >
                {block.unit}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

function DateRow({
  slide,
  showDate,
  showWeekday,
  fontSize,
}: {
  slide: SlideItem;
  showDate: boolean;
  showWeekday: boolean;
  fontSize: number;
}) {
  if (!showDate && !showWeekday) return null;
  return (
    <View style={styles.dateRow}>
      {showDate ? (
        <Text style={[styles.date, { fontSize: SLIDESHOW_BASE_FONT.date * fontSize }]}>{slide.fullDate}</Text>
      ) : null}
      {showWeekday ? (
        <Text style={[styles.weekday, { fontSize: SLIDESHOW_BASE_FONT.weekday * fontSize }]}>
          {slide.weekday}
        </Text>
      ) : null}
    </View>
  );
}

function ControlButton({
  icon,
  label,
  onPress,
  size = 44,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  onPress(): void;
  size?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.controlButton,
        { width: size, height: size, borderRadius: size / 2 },
        pressed && styles.controlButtonPressed,
      ]}
    >
      <MaterialCommunityIcons name={icon} size={size * 0.5} color="#FFFFFF" />
    </Pressable>
  );
}



/**
 * 按动画类型生成 `anim`（0=还没进来，1=完全就位）对应的变换 / 透明度。
 *
 * 12 种里除 `blur`（RN 无原生模糊，用淡入 + 轻微缩放近似）外都是真实的
 * 位移 / 旋转 / 缩放，全部走 transform + opacity，可原生驱动。
 */
interface AnimatedCardStyle {
  opacity: Animated.AnimatedInterpolation<number>;
  transform: Animated.WithAnimatedValue<ViewStyle['transform']>;
}

function buildAnimationStyle(
  anim: Animated.Value,
  kind: Exclude<SlideshowAnimation, 'random'>,
  dir: number,
  width: number,
  height: number,
  enable3D: boolean,
): AnimatedCardStyle {
  const opacity = anim;
  const perspective = enable3D ? [{ perspective: 1000 }] : [];

  switch (kind) {
    case 'slide':
      return { opacity, transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [dir * width, 0] }) }] };
    case 'slide-v':
      return { opacity, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [dir * height, 0] }) }] };
    case 'flip':
      return {
        opacity,
        transform: [
          ...perspective,
          { rotateY: anim.interpolate({ inputRange: [0, 1], outputRange: [`${dir * 90}deg`, '0deg'] }) },
        ],
      };
    case 'cube':
      return {
        opacity,
        transform: [
          ...perspective,
          { rotateY: anim.interpolate({ inputRange: [0, 1], outputRange: [`${dir * 90}deg`, '0deg'] }) },
          { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [dir * width * 0.5, 0] }) },
        ],
      };
    case 'zoom':
      return {
        opacity,
        transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
      };
    case 'stack':
      return {
        opacity,
        transform: [
          { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [60, 0] }) },
          { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
        ],
      };
    case 'blinds':
      return {
        opacity,
        transform: [{ scaleY: anim.interpolate({ inputRange: [0, 1], outputRange: [0.15, 1] }) }],
      };
    case 'blur':

      return {
        opacity,
        transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1.06, 1] }) }],
      };
    case 'rotate':
      return {
        opacity,
        transform: [
          { rotate: anim.interpolate({ inputRange: [0, 1], outputRange: [`${dir * 10}deg`, '0deg'] }) },
          { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
        ],
      };
    case 'card':
      return {
        opacity,
        transform: [
          ...perspective,
          { rotateY: anim.interpolate({ inputRange: [0, 1], outputRange: [`${dir * 90}deg`, '0deg'] }) },
          { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [dir * width * 0.6, 0] }) },
        ],
      };
    case 'fade':
    default:
      return { opacity, transform: [] };
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.cream,
  },
  emptyRoot: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  emptyText: {
    color: palette.cocoa,
    textAlign: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },

  card: {
    width: '100%',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: palette.peachLine20,
    overflow: 'hidden',
    /*
     * ⚠️ 这里**不能加阴影 / elevation**。
     *
     * 卡片每切一张都在跑 transform 动画，安卓上 `elevation` 的阴影是原生
     * 单独绘制的图层，跟着 transform 重算时会抖动（用户说的"阴影抽搐"）。
     * 模糊阴影（shadowRadius）同理。全屏放映本来也不需要阴影，去掉更干净。
     */
  },
  cardLandscape: {
    maxWidth: 900,
  },

  portrait: {
    gap: spacing.lg,
    alignItems: 'center',
  },
  portraitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },

  landscapeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
  },
  landscapeLeft: {
    flex: 1,
    gap: spacing.md,
  },
  landscapeRight: {
    flex: 1,
    alignItems: 'flex-end',
    gap: spacing.lg,
  },

  icon: {},
  title: {
    color: palette.cocoa,
    fontWeight: '700',
    textAlign: 'center',
  },
  note: {
    color: palette.cocoaFaint,
    textAlign: 'center',
  },

  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: palette.peachLine15,
  },
  tagText: {
    color: palette.peachDeep,
  },

  countdownWrapper: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  countdownLabel: {
    fontWeight: '600',
  },
  countdownNumbers: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  timeBlock: {
    alignItems: 'center',
  },
  timeNumber: {
    fontWeight: '800',
  },
  timeUnit: {
    opacity: 0.75,
  },

  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  date: {
    color: palette.cocoaSoft,
    opacity: 0.85,
  },
  weekday: {
    color: palette.cocoaSoft,
    opacity: 0.65,
  },

  controls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  dots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(92,61,46,0.25)',
  },
  dotActive: {
    backgroundColor: palette.peachDeep,
    width: 18,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  controlButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(92,61,46,0.55)',
  },
  controlButtonPressed: {
    backgroundColor: 'rgba(92,61,46,0.8)',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(92,61,46,0.2)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: palette.peachDeep,
  },
  progressText: {
    color: palette.cocoaSoft,
    fontSize: 12,
  },
});

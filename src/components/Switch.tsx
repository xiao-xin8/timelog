import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { palette } from '../theme';

/**
 * 开关
 *
 * ## 为什么不用 Paper / RN 的原生 Switch
 *
 * 它就是个受控组件：显示状态完全由 `value` 决定。
 * 用户拨动后，原生控件开始动画，同时回调 JS；而 JS 要重渲染整个表单才把新 `value`
 * 传回去。**这中间的延迟会让原生控件被旧值拉回，动画就被打断了** ——
 * 表现就是「开关没有动画，直接跳过去」。
 *
 * 表单里越重的开关越明显（`显示精准时间` 会连带挂载折叠区，`置顶显示` 下面挂着尺寸选择器），
 * 而轻的那个（`显示秒数`）看起来正常，正是这个原因。
 *
 * ## 这里的做法
 *
 * 1. **内部维护显示状态**：点下去立即更新，动画马上开始，不等父组件。
 *    父组件慢也好、卡也好，只影响它自己，不影响开关的观感。
 * 2. **全程 native driver**：
 *    - 滑块位移用 `translateX` —— 支持原生驱动；
 *    - **颜色插值不支持原生驱动**，所以轨道用「两层叠放 + 上层透明度」来实现变色，
 *      `opacity` 同样支持原生驱动。
 *    这样动画完全不占 JS 线程，JS 再忙也不掉帧。
 */

interface Props {
  value: boolean;
  onValueChange(value: boolean): void;
  disabled?: boolean;
  /** 尺寸档位，默认 medium */
  size?: 'small' | 'medium';
}

/** 尺寸表：轨道宽高、滑块直径、内边距 */
const SIZES = {
  small: { trackW: 40, trackH: 24, thumb: 18, pad: 3 },
  medium: { trackW: 48, trackH: 28, thumb: 22, pad: 3 },
} as const;

const DURATION = 180;

export default function Switch({
  value,
  onValueChange,
  disabled = false,
  size = 'medium',
}: Props) {
  const { trackW, trackH, thumb, pad } = SIZES[size];
  const travel = trackW - thumb - pad * 2;


  const [internal, setInternal] = useState(value);
  const progress = useRef(new Animated.Value(value ? 1 : 0)).current;


  useEffect(() => {
    setInternal(value);
  }, [value]);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: internal ? 1 : 0,
      duration: DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [internal, progress]);

  const handlePress = () => {
    if (disabled) return;
    const next = !internal;
    setInternal(next); 
    onValueChange(next); 
  };



  const thumbTranslate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, travel],
  });


  const onLayerOpacity = progress;

  const offLayerOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });


  const thumbScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.06],
  });

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: internal, disabled }}
      hitSlop={8}
      style={disabled && styles.disabled}
    >
      <View style={[styles.track, { width: trackW, height: trackH, borderRadius: trackH / 2 }]}>
        {/* 关闭态底色 */}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            styles.layer,
            { backgroundColor: palette.mauveLight, opacity: offLayerOpacity },
          ]}
        />
        {/* 开启态底色（用透明度过渡，避开颜色不支持原生驱动的问题） */}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            styles.layer,
            { backgroundColor: palette.peach, opacity: onLayerOpacity },
          ]}
        />

        {/* 滑块 */}
        <Animated.View
          style={[
            styles.thumb,
            {
              width: thumb,
              height: thumb,
              borderRadius: thumb / 2,
              left: pad,
              top: (trackH - thumb) / 2,
              transform: [{ translateX: thumbTranslate }, { scale: thumbScale }],
            },
          ]}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    justifyContent: 'center',
    overflow: 'hidden',
  },
  layer: {
    borderRadius: 999,
  },
  thumb: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  disabled: {
    opacity: 0.5,
  },
});

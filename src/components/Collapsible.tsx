import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

/**
 * 折叠 / 展开动画容器
 *
 * 用 `Animated` 做高度 + 透明度过渡。
 *
 * ## 踩过的两个坑，这里都避开了
 *
 * 1. **不要加延迟。** 曾经为了"避开和开关动画抢 JS 线程"而加了 150ms 延迟，
 *    结果变成「开关动了、内容慢半拍才出来」，手感更差。宁可两边稍有竞争，
 *    也不要出现这种不同步。
 *
 * 2. **不要用 LayoutAnimation。** 它要求 `configureNext()` 必须紧贴状态变化之前调用，
 *    放在 `useEffect` 里就晚了，**会完全失效、一点动画都没有**。
 *    `Animated` 虽然跑在 JS 线程上，但胜在稳定、任何位置都能生效。
 *
 * 内容量不大时（表单里就两行），JS 驱动的开销可以接受。
 */

interface Props {
  open: boolean;
  children: React.ReactNode;
  /** 动画时长，默认 200ms */
  duration?: number;
}

export default function Collapsible({ open, children, duration = 200 }: Props) {

  const [contentHeight, setContentHeight] = useState(0);
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [open, duration, progress]);

  const maxHeight = progress.interpolate({
    inputRange: [0, 1],

    outputRange: [0, contentHeight || 1],
  });

  return (
    <Animated.View
      style={[styles.wrapper, { maxHeight, opacity: progress }]}
      pointerEvents={open ? 'auto' : 'none'}
    >
      <View
        onLayout={event => {
          const next = event.nativeEvent.layout.height;
          if (next !== contentHeight) setContentHeight(next);
        }}
      >
        {children}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    overflow: 'hidden',
  },
});

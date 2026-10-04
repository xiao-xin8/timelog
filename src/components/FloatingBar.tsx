import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons as MaterialDesignIcons } from '@expo/vector-icons';
import { IconButton } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FLOATING_BUTTON_SIZE, FLOATING_MARGIN } from '../navigation/layout';
import { palette } from '../theme';

/**
 * 顶部悬浮操作区
 *
 * 取代原来的 `CapsuleHeader`。**全 App 顶部不再有任何导航栏**：
 * 标题不显示了，返回 / 筛选 / 保存这类操作变成几枚**悬浮圆形按钮**，
 * 直接浮在内容之上，页面顶部因此空出来（一级页甚至什么都不放）。
 *
 * 用法：
 *
 * ```tsx
 * <FloatingBar
 *   left={<FloatingButton icon="arrow-left" onPress={goBack} accessibilityLabel="返回" />}
 *   right={<FloatingButton icon="content-save-outline" onPress={save} accessibilityLabel="保存" />}
 * />
 * ```
 *
 * 页面内容用 `FLOATING_CLEARANCE` 避开它（没按钮的页面用 `TOP_CONTENT_GAP`）。
 *
 * 外层 `pointerEvents="box-none"`：按钮之间的空白区域不会挡住下面内容的点击。
 */

type IconName = React.ComponentProps<typeof MaterialDesignIcons>['name'];

interface FloatingButtonProps {
  icon: IconName;
  onPress(): void;
  accessibilityLabel: string;
  disabled?: boolean;
}

/** 一枚悬浮圆形按钮：白底 + 蜜桃描边 + 阴影，和原来的胶囊同一套语言 */
export function FloatingButton({
  icon,
  onPress,
  accessibilityLabel,
  disabled,
}: FloatingButtonProps) {
  return (
    <IconButton
      icon={icon}
      size={22}
      mode="contained"
      containerColor="#FFFFFF"
      iconColor={palette.cocoa}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      style={styles.button}
    />
  );
}

interface FloatingBarProps {
  left?: React.ReactNode;
  right?: React.ReactNode;
}

export default function FloatingBar({ left, right }: FloatingBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.bar, { paddingTop: insets.top + FLOATING_MARGIN }]}
      pointerEvents="box-none"
    >
      {/* 左槽位永远渲染，保证只有右侧有按钮时它仍然靠右 */}
      <View style={styles.slot} pointerEvents="box-none">
        {left}
      </View>
      <View style={[styles.slot, styles.slotEnd]} pointerEvents="box-none">
        {right}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: FLOATING_MARGIN,
  },
  slot: {

    flexDirection: 'row',
    alignItems: 'center',
    gap: FLOATING_MARGIN / 2,
  },
  slotEnd: {
    justifyContent: 'flex-end',
  },
  button: {

    margin: 0,


    width: FLOATING_BUTTON_SIZE,
    height: FLOATING_BUTTON_SIZE,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    borderWidth: 1,
    borderColor: palette.peachLine20,
  },
});

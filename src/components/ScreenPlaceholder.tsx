import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons as MaterialDesignIcons } from '@expo/vector-icons';

import { CONTENT_CLEARANCE, TOP_CONTENT_GAP } from '../navigation/layout';

/** 合法图标名由图标库类型推导，写错会有类型提示 */
type IconName = React.ComponentProps<typeof MaterialDesignIcons>['name'];

type Props = {
  /** Material Design Icons 的图标名 */
  icon: IconName;
  title: string;
  description: string;
};

/**
 * 尚未实现的页面占位。骨架阶段先用它把导航跑通，
 * 后续每个页面按旧项目的功能逐个替换掉。
 */
export default function ScreenPlaceholder({ icon, title, description }: Props) {
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.iconWrap, { backgroundColor: theme.colors.primaryContainer }]}>
        <MaterialDesignIcons name={icon} size={40} color={theme.colors.onPrimaryContainer} />
      </View>
      <Text variant="titleLarge" style={styles.title}>
        {title}
      </Text>
      <Text
        variant="bodyMedium"
        style={[styles.description, { color: theme.colors.onSurfaceVariant }]}
      >
        {description}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,

    paddingTop: TOP_CONTENT_GAP,
    paddingBottom: CONTENT_CLEARANCE,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    textAlign: 'center',
  },
  description: {
    textAlign: 'center',
    lineHeight: 20,
  },
});

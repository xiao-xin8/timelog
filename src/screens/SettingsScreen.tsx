import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons as MaterialDesignIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from 'react-native-paper';

import FloatingBar, { FloatingButton } from '../components/FloatingBar';
import SettingRow from '../components/SettingRow';
import { useFeedback } from '../components/feedback';
import { CONTENT_CLEARANCE, FLOATING_CLEARANCE } from '../navigation/layout';
import type { RootStackParamList } from '../navigation/types';
import { palette, radius, spacing } from '../theme';
import {
  ORIENTATION_OPTIONS,
  loadOrientationPreference,
  setOrientationPreference,
  type OrientationPreference,
} from '../utils/orientation';

/**
 * 设置（Slice 09）
 *
 * 照旧版 `legacy/uniapp/pages/settings/settings.vue` 的卡片结构，但**只保留两项**：
 *
 *   | 旧版 | 新版 |
 *   |---|---|
 *   | 主题风格（极简/可爱/暗黑） | ❌ 砍掉 —— 视觉已定死「可爱萌系卡通风」 |
 *   | 首页背景（相册/拍照/恢复默认） | ❌ 砍掉 —— 依附主题系统，价值低 |
 *   | 屏幕方向（竖屏正向/反向） | ✅ 保留 |
 *   | 关于 | ✅ 保留 |
 */

type Navigation = NativeStackNavigationProp<RootStackParamList>;

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Navigation>();
  const { toast } = useFeedback();

  const [orientation, setOrientation] = useState<OrientationPreference>('portrait-primary');

  useEffect(() => {
    void loadOrientationPreference().then(setOrientation);
  }, []);

  const goBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('Tabs');
  }, [navigation]);

  const handleSelectOrientation = useCallback(
    async (next: OrientationPreference) => {
      if (next === orientation) return;

      const previous = orientation;
      setOrientation(next);

      try {
        await setOrientationPreference(next);

        toast('屏幕方向已切换');
      } catch (error) {

        console.warn('[settings] 切换屏幕方向失败', error);
        setOrientation(previous);
        toast('这台设备不支持这个方向');
      }
    },
    [orientation, toast],
  );

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
        <Text variant="bodySmall" style={styles.groupTitle}>
          屏幕方向
        </Text>
        <View style={styles.card}>
          {ORIENTATION_OPTIONS.map(option => (
            <SettingRow
              key={option.value}
              icon="screen-rotation"
              title={option.label}
              onPress={() => void handleSelectOrientation(option.value)}
              right={
                orientation === option.value ? (
                  <MaterialDesignIcons name="check" size={20} color={palette.peachDeep} />
                ) : null
              }
            />
          ))}
        </View>

        <Text variant="bodySmall" style={styles.groupTitle}>
          关于
        </Text>
        <View style={styles.card}>
          <SettingRow
            icon="information-outline"
            title="关于时光日志"
            description="版本信息、开发者、隐私政策"
            onPress={() => navigation.navigate('About')}
            right={
              <MaterialDesignIcons name="chevron-right" size={20} color={palette.mauveLight} />
            }
          />
        </View>
      </ScrollView>

      <FloatingBar
        left={<FloatingButton icon="arrow-left" onPress={goBack} accessibilityLabel="返回" />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  groupTitle: {
    color: palette.cocoaFaint,
    marginTop: spacing.md,
    marginLeft: spacing.sm,
  },
  card: {
    borderRadius: radius.lg,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: palette.peachLine20,
    overflow: 'hidden',
  },
});

import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons as MaterialDesignIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from 'react-native-paper';

import FloatingBar, { FloatingButton } from '../components/FloatingBar';
import LegalSheet from '../components/LegalSheet';
import SettingRow from '../components/SettingRow';
import { useFeedback } from '../components/feedback';
import { APP_INTRO, COPYRIGHT_TEXT } from '../constants';
import { AGREEMENT_BLOCKS, PRIVACY_BLOCKS } from '../constants/legal';
import { CONTENT_CLEARANCE, FLOATING_CLEARANCE } from '../navigation/layout';
import type { RootStackParamList } from '../navigation/types';
import { useUpdateStore } from '../store/useUpdateStore';
import { palette, radius, spacing } from '../theme';

/**
 * 关于（Slice 09 + 17）
 *
 * 应用图标 + 名称 + 版本号 + 一句话介绍 + 「检查更新」+ 两个协议入口 + 底部版权标识。
 *
 * 「检查更新」是 Slice 17 加的：自动检查发生在启动后几秒（见 `UpdateGate`），
 * 这里是**用户主动**触发的那一次 —— 主动触发会忽略"不再提示"的记录，
 * 而且没有新版本 / 检查失败时要给一句 toast（自动那次是**完全静默**的）。
 */

type Navigation = NativeStackNavigationProp<RootStackParamList>;

type SheetKind = 'agreement' | 'privacy' | null;

export default function AboutScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Navigation>();
  const [sheet, setSheet] = useState<SheetKind>(null);

  const { toast } = useFeedback();
  const checkUpdate = useUpdateStore(state => state.check);
  const [checking, setChecking] = useState(false);
  const [checkHint, setCheckHint] = useState('');

  const goBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('Tabs');
  }, [navigation]);

  /**
   * 手动检查更新（Slice 17）
   *
   * 和启动时那次自动检查的区别：**主动点了就必须有反馈**。
   * 自动检查拿不到数据是静默的（用户没点任何东西，不该看到错误），
   * 但这里如果不吭声，用户会以为按钮坏了。
   */
  const handleCheckUpdate = useCallback(async () => {
    if (checking) return;

    setChecking(true);
    setCheckHint('正在检查…');

    const result = await checkUpdate({ manual: true });
    setChecking(false);


    if (result.available) {
      setCheckHint('');
      return;
    }

    let message = '已是最新版本';
    if (result.reason === 'invalid') message = '检查失败，请稍后重试';
    else if (result.reason === 'no-apk') message = '暂时没有可用的更新包';
    else if (result.version) message = `已是最新版本 v${result.version}`;

    setCheckHint(message);
    toast(message);
  }, [checkUpdate, checking, toast]);


  const version = Constants.expoConfig?.version || Constants.nativeAppVersion || '';

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.content,

          styles.contentGrow,
          {

            paddingTop: insets.top + FLOATING_CLEARANCE,

            paddingBottom: insets.bottom + spacing.md,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          {/* 用真实的 APP 图标（和启动图标同一张图），不再画占位图标 */}
          <Image source={require('../../assets/icon.png')} style={styles.appIcon} />
          <Text variant="titleLarge" style={styles.appName}>
            时光日志
          </Text>
          <Text variant="bodySmall" style={styles.version}>
            版本 {version}
          </Text>
        </View>

        <View style={styles.introCard}>
          <Text variant="bodyMedium" style={styles.intro}>
            {APP_INTRO}
          </Text>
        </View>

        <View style={styles.card}>
          <SettingRow
            icon="cloud-download-outline"
            title="检查更新"
            description={checkHint || undefined}
            onPress={() => void handleCheckUpdate()}
            right={
              checking ? (
                <ActivityIndicator size="small" color={palette.peach} />
              ) : (
                <MaterialDesignIcons name="chevron-right" size={20} color={palette.mauveLight} />
              )
            }
          />
          <SettingRow
            icon="file-document-outline"
            title="用户协议"
            onPress={() => setSheet('agreement')}
            right={
              <MaterialDesignIcons name="chevron-right" size={20} color={palette.mauveLight} />
            }
          />
          <SettingRow
            icon="shield-lock-outline"
            title="隐私政策"
            onPress={() => setSheet('privacy')}
            right={
              <MaterialDesignIcons name="chevron-right" size={20} color={palette.mauveLight} />
            }
          />
        </View>

        {/* 收尾区：marginTop auto 把它顶到剩余空间的底部（即屏幕下方） */}
        <View style={styles.footerBlock}>
          <Text variant="bodySmall" style={styles.footer}>
            记录每一个重要时刻
          </Text>
          <Text variant="bodySmall" style={styles.copyright}>
            {COPYRIGHT_TEXT}
          </Text>
        </View>
      </ScrollView>

      <FloatingBar
        left={<FloatingButton icon="arrow-left" onPress={goBack} accessibilityLabel="返回" />}
      />

      <LegalSheet
        visible={sheet === 'agreement'}
        title="用户协议"
        blocks={AGREEMENT_BLOCKS}
        onDismiss={() => setSheet(null)}
      />
      <LegalSheet
        visible={sheet === 'privacy'}
        title="隐私政策"
        blocks={PRIVACY_BLOCKS}
        onDismiss={() => setSheet(null)}
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
    gap: spacing.md,
  },
  contentGrow: {
    flexGrow: 1,
  },
  footerBlock: {

    marginTop: 'auto',
    alignItems: 'center',
    gap: spacing.xs,

    paddingTop: spacing.xxl,
  },
  header: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xl,
  },
  appIcon: {
    width: 88,
    height: 88,

    borderRadius: 20,
    marginBottom: spacing.sm,
  },
  introCard: {
    borderRadius: radius.lg,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: palette.peachLine20,
    padding: spacing.lg,
  },
  intro: {
    color: palette.cocoaSoft,
    lineHeight: 22,
  },
  appName: {
    color: palette.cocoa,
    fontWeight: '700',
  },
  version: {
    color: palette.cocoaFaint,
  },
  card: {
    borderRadius: radius.lg,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: palette.peachLine20,
    overflow: 'hidden',
  },
  footer: {
    textAlign: 'center',
    color: palette.cocoaFaint,
  },
  copyright: {
    textAlign: 'center',
    color: palette.mauveLight,
  },
});

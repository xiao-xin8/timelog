import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Divider, IconButton, Text, TouchableRipple } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { captureRef } from 'react-native-view-shot';

import * as MediaLibrary from 'expo-media-library/legacy';
import * as Sharing from 'expo-sharing';
import { Linking } from 'react-native';

import BottomSheet from '../components/BottomSheet';
import FloatingBar, { FloatingButton } from '../components/FloatingBar';
import ExportPoster, {
  POSTER_PALETTES,
  POSTER_TEMPLATES,
  type PosterPalette,
  type PosterTemplate,
} from '../components/ExportPoster';
import SettingRow from '../components/SettingRow';
import { useFeedback } from '../components/feedback';
import { CONTENT_CLEARANCE, FLOATING_CLEARANCE } from '../navigation/layout';
import { useCategoryStore } from '../store/useCategoryStore';
import { useEventStore } from '../store/useEventStore';
import { palette, radius, spacing } from '../theme';
import type { RootStackParamList } from '../navigation/types';

/**
 * 导出图片（Slice 07）
 *
 * ## 和旧版的区别
 *
 * 旧版在 340×280 的 canvas 上按坐标手画（`drawCanvas`），位图，放大就糊，
 * emoji 之类也很难画。这里改成**把海报当普通视图渲染出来，再截这张视图**：
 *
 * ```
 * 详情页「导出」→ 本页（真图预览）→ 保存 → 截图 → 存相册
 *                                  → 分享 → 截图 → 系统分享
 * ```
 *
 * 预览里看到的就是存进相册的图，不存在"预览好看、存出来走样"。
 *
 * ## 模板与配色怎么切
 *
 * 都收进**底部面板**（本项目所有"从一组里挑一个"的交互统一走 BottomSheet）。
 *
 * ## 权限
 *
 * 先申请再截图。被永久拒绝时弹确认框，"去设置"用 `Linking.openSettings()`，
 * 对应旧版 `uni.openSetting()`。
 */

type Props = NativeStackScreenProps<RootStackParamList, 'Export'>;

/**
 * 导出分辨率说明
 *
 * `react-native-view-shot` 不传 `width/height` 时，导出的就是**视图的物理像素**
 * （即 dp × 屏幕像素密度）。所以在 2x/3x 屏上，预览宽 320dp 出来的图
 * 就有 640~960px 宽 —— 本来就比旧版那张 340px 的 canvas 清晰得多，
 * 不需要（也不能）再传 `scale`：v5 已经移除了该参数，而 `width/height`
 * 是对位图做缩放，放大反而会糊。
 */

export default function ExportScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { toast, loading, confirm } = useFeedback();

  const loaded = useEventStore(state => state.loaded);
  const event = useEventStore(state => state.events.find(item => item.id === id));
  const categories = useCategoryStore(state => state.all);

  const [template, setTemplate] = useState<PosterTemplate>('classic');
  const [paletteMode, setPaletteMode] = useState<PosterPalette>('event');
  const [templateOpen, setTemplateOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  /** 截图目标 */
  const posterRef = useRef<View>(null);


  useEffect(() => {
    if (loaded && !event) {
      toast('事件不存在');
      const timer = setTimeout(() => navigation.goBack(), 1200);
      return () => clearTimeout(timer);
    }
  }, [loaded, event, navigation, toast]);


  const previewWidth = useMemo(() => {
    const meta = POSTER_TEMPLATES.find(item => item.key === template);

    const ratio = meta?.ratio;
    if (!ratio) {
      return Math.floor(screenWidth - spacing.lg * 2 - spacing.xxl);
    }
    const maxWidth = screenWidth - spacing.lg * 2 - spacing.xxl;
    const maxHeight = 380;
    return Math.floor(Math.min(maxWidth, maxHeight / ratio));
  }, [screenWidth, template]);

  const templateName = POSTER_TEMPLATES.find(item => item.key === template)?.name ?? '经典卡片';
  const paletteName = POSTER_PALETTES.find(item => item.key === paletteMode)?.name ?? '跟随事件';


  /**
   * 两个权限方法都传 `writeOnly: true` —— 我们只把图**写**进相册，从不读用户的照片，
   * 所以没必要申请读相册权限。Android 13+ 上这能少要一个权限。
   */
  const ensurePermission = async (): Promise<boolean> => {
    const current = await MediaLibrary.getPermissionsAsync(true);
    if (current.granted) return true;

    if (current.canAskAgain) {
      const asked = await MediaLibrary.requestPermissionsAsync(true);
      return asked.granted;
    }


    const ok = await confirm({
      title: '需要权限',
      message: '需要授权保存图片到相册',
      confirmText: '去设置',
    });
    if (ok) {
      await Linking.openSettings();
    }
    return false;
  };


  const capture = async (): Promise<string | null> => {
    if (!posterRef.current) {
      toast('请稍等一下再试');
      return null;
    }
    return captureRef(posterRef, {
      format: 'png',
      quality: 1,
      result: 'tmpfile',
    });
  };


  const handleSave = async () => {
    if (!event) return;

    if (!(await ensurePermission())) {
      toast('没有相册权限');
      return;
    }

    loading(true, '正在生成…');
    try {
      const uri = await capture();
      if (!uri) return;
      await MediaLibrary.saveToLibraryAsync(uri);
      toast('图片已保存到相册');
    } catch {
      toast('保存失败');
    } finally {
      loading(false);
    }
  };


  const handleShare = async () => {
    if (!event) return;

    if (!(await Sharing.isAvailableAsync())) {
      toast('当前设备不支持分享');
      return;
    }

    loading(true, '正在生成…');
    try {
      const uri = await capture();
      if (!uri) return;
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: '分享倒数日卡片',
      });
    } catch {
      toast('分享失败');
    } finally {
      loading(false);
    }
  };

  if (!event) {
    return (
      <View style={styles.root}>
        <FloatingBar
          left={
            <FloatingButton
              icon="arrow-left"
              onPress={() => navigation.goBack()}
              accessibilityLabel="返回"
            />
          }
        />
        <View style={styles.missing}>
          <MaterialCommunityIcons name="image-off" size={56} color={palette.mauve} />
          <Text variant="bodyMedium" style={styles.missingText}>
            事件不存在
          </Text>
        </View>
      </View>
    );
  }

  const categoryName = categories.find(item => item.key === event.category)?.name ?? '其他';

  return (
    <View style={styles.root}>
      {/* 顶部悬浮按钮：返回 / 分享 / 保存到相册 */}
      <FloatingBar
        left={
          <FloatingButton
            icon="arrow-left"
            onPress={() => navigation.goBack()}
            accessibilityLabel="返回"
          />
        }
        right={
          <>
            <FloatingButton
              icon="share-variant-outline"
              onPress={() => void handleShare()}
              accessibilityLabel="分享"
            />
            <FloatingButton
              icon="content-save-outline"
              onPress={() => void handleSave()}
              accessibilityLabel="保存到相册"
            />
          </>
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {

            paddingTop: insets.top + FLOATING_CLEARANCE,
            paddingBottom: insets.bottom + spacing.xxl,
          },
        ]}
      >
        {/* 预览：就是将被截图的那块 */}
        <View style={styles.previewBox}>
          <ExportPoster
            innerRef={posterRef}
            event={event}
            template={template}
            paletteMode={paletteMode}
            width={previewWidth}
            categoryName={categoryName}
          />
        </View>

        {/* 提示条（照搬旧版文案） */}
        <View style={styles.tip}>
          <Text style={styles.tipIcon}>💡</Text>
          <Text variant="bodySmall" style={styles.tipText}>
            点右上角保存到相册，或分享出去
          </Text>
        </View>

        {/* 模板与配色 */}
        <View style={styles.section}>
          <SettingRow
            icon="view-carousel-outline"
            title="模板"
            right={
              <View style={styles.rowValue}>
                <Text variant="bodyMedium" style={styles.rowValueText}>
                  {templateName}
                </Text>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={20}
                  color={palette.mauveLight}
                />
              </View>
            }
            onPress={() => setTemplateOpen(true)}
          />
          <Divider />
          <SettingRow
            icon="palette-outline"
            title="配色"
            right={
              <View style={styles.rowValue}>
                <Text variant="bodyMedium" style={styles.rowValueText}>
                  {paletteName}
                </Text>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={20}
                  color={palette.mauveLight}
                />
              </View>
            }
            onPress={() => setPaletteOpen(true)}
          />
        </View>

        {/* 两个大按钮，底下也好点 */}
        <View style={styles.actions}>
          <TouchableRipple onPress={() => void handleSave()} style={styles.action} borderless>
            <View style={styles.actionInner}>
              <MaterialCommunityIcons name="content-save-outline" size={20} color="#FFFFFF" />
              <Text variant="bodyLarge" style={styles.actionText}>
                保存到相册
              </Text>
            </View>
          </TouchableRipple>

          <TouchableRipple onPress={() => void handleShare()} style={styles.action} borderless>
            <View style={[styles.actionInner, styles.actionGhost]}>
              <MaterialCommunityIcons
                name="share-variant-outline"
                size={20}
                color={palette.peachDeep}
              />
              <Text variant="bodyLarge" style={styles.actionGhostText}>
                分享
              </Text>
            </View>
          </TouchableRipple>
        </View>
      </ScrollView>

      {/* 模板选择 */}
      <BottomSheet
        visible={templateOpen}
        title="选择模板"
        onDismiss={() => setTemplateOpen(false)}
        heightRatio={0.32}
      >
        {POSTER_TEMPLATES.map(option => (
          <TouchableRipple
            key={option.key}
            onPress={() => {
              setTemplate(option.key);
              setTemplateOpen(false);
            }}
            style={styles.optionRow}
          >
            <View style={styles.optionInner}>
              <View style={styles.optionTexts}>
                <Text variant="bodyLarge" style={styles.optionName}>
                  {option.name}
                </Text>
                <Text variant="bodySmall" style={styles.optionDesc}>
                  {option.desc}
                </Text>
              </View>
              {option.key === template ? (
                <MaterialCommunityIcons name="check" size={20} color={palette.peach} />
              ) : null}
            </View>
          </TouchableRipple>
        ))}
      </BottomSheet>

      {/* 配色选择 */}
      <BottomSheet
        visible={paletteOpen}
        title="选择配色"
        onDismiss={() => setPaletteOpen(false)}
        heightRatio={0.36}
      >
        {POSTER_PALETTES.map(option => (
          <TouchableRipple
            key={option.key}
            onPress={() => {
              setPaletteMode(option.key);
              setPaletteOpen(false);
            }}
            style={styles.optionRow}
          >
            <View style={styles.optionInner}>
              <View style={styles.optionTexts}>
                <Text variant="bodyLarge" style={styles.optionName}>
                  {option.name}
                </Text>
                <Text variant="bodySmall" style={styles.optionDesc}>
                  {option.desc}
                </Text>
              </View>
              {option.key === paletteMode ? (
                <MaterialCommunityIcons name="check" size={20} color={palette.peach} />
              ) : null}
            </View>
          </TouchableRipple>
        ))}
      </BottomSheet>
    </View>
  );
}

/** 顶部胶囊右侧放「分享 + 保存」两个图标，槽位要加宽 */
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.cream,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
    // 顶/底避让在渲染处按安全区算，这里不重复叠加
  },
  headerButton: {
    margin: 0,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  missingText: {
    color: palette.cocoaFaint,
  },

  previewBox: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },

  tip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: palette.peachLine15,
  },
  tipIcon: {
    fontSize: 14,
  },
  tipText: {
    color: palette.peachDeep,
  },

  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  rowValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginRight: spacing.md,
  },
  rowValueText: {
    color: palette.cocoa,
  },

  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  action: {
    flex: 1,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  actionInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: palette.peach,
  },
  actionText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  actionGhost: {
    backgroundColor: palette.peachTint,
    borderWidth: 1,
    borderColor: palette.peachLine30,
  },
  actionGhostText: {
    color: palette.peachDeep,
    fontWeight: '700',
  },

  optionRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  optionInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  optionTexts: {
    flex: 1,
    gap: 2,
  },
  optionName: {
    color: palette.cocoa,
  },
  optionDesc: {
    color: palette.cocoaFaint,
  },
});

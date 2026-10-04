import React, { useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Checkbox, Dialog, ProgressBar, Text } from 'react-native-paper';

import { useUpdateStore } from '../store/useUpdateStore';
import { dialogButtonStyle, palette, radius, spacing } from '../theme';
import { formatBytes, formatProgressPercent } from '../utils/update';

/**
 * 更新提示 / 下载进度弹窗（Slice 17）
 *
 * 严格照旧版 `legacy/uniapp/utils/updateDialog.js` 的语义：
 *   - 非强制：`[稍后更新] [立即更新]`
 *   - 强制：`[退出应用] [立即更新]` —— **不能有任何"绕过更新继续用"的按钮**
 *   - 下载中：模态、禁止返回键
 *   - 失败：`[用浏览器下载]` 兜底
 *
 * ⚠️ 和旧版的一个**有意差异**：旧版强制更新时只给「立即更新」一个按钮，
 * 万一下载页打不开（断网 / 链接失效），用户就卡在一个关不掉的弹窗上、App 也用不了。
 * 这里改成必然留一个出口（「退出应用」），见 `docs/slices/17-原生更新.md` 第五节。
 *
 * 挂载位置见 `UpdateGate`：它必须待在 PaperProvider 里面（Paper 的 Dialog 走 Portal）。
 */

export default function UpdateDialog() {
  const phase = useUpdateStore(state => state.phase);
  const info = useUpdateStore(state => state.info);
  const force = useUpdateStore(state => state.force);
  const ratio = useUpdateStore(state => state.ratio);
  const bytesWritten = useUpdateStore(state => state.bytesWritten);
  const totalBytes = useUpdateStore(state => state.totalBytes);
  const errorText = useUpdateStore(state => state.errorText);
  const errorKind = useUpdateStore(state => state.errorKind);

  const dismiss = useUpdateStore(state => state.dismiss);
  const skipVersion = useUpdateStore(state => state.skipVersion);
  const startDownload = useUpdateStore(state => state.startDownload);
  const cancelDownload = useUpdateStore(state => state.cancelDownload);
  const useBrowser = useUpdateStore(state => state.useBrowser);
  const goUnknownSources = useUpdateStore(state => state.goUnknownSources);

  /**
   * 「不再提示此版本」的勾选状态
   *
   * 做成**勾选框**而不是按钮：这是不可逆操作（记下来就再也不弹了），
   * 之前做成紧挨着「立即更新」的按钮，用户手指一偏就点没了。
   * 现在要点两下才生效：先勾上，再点「稍后更新」。
   */
  const [skipChecked, setSkipChecked] = useState(false);


  const visible = Boolean(info) && phase !== 'idle' && phase !== 'checking';
  const busy = phase === 'downloading' || phase === 'installing';

  const sizeText = formatBytes(info?.sizeBytes ?? 0);
  const percentText = formatProgressPercent(ratio);

  const downloadedText =
    ratio === null
      ? formatBytes(bytesWritten)
      : `${formatBytes(bytesWritten)} / ${formatBytes(totalBytes)}`;

  /** 强制更新时"关掉"等于退出应用 —— 否则用户就被锁在一个不肯消失的弹窗上了 */
  const handleExit = () => {
    dismiss();
    BackHandler.exitApp();
  };

  /** 「稍后更新」：勾了"不再提示"才记下来，否则就是本次关掉 */
  const handleLater = () => {
    if (skipChecked) skipVersion();
    else dismiss();
  };

  return (
    <Dialog
      visible={visible}

      dismissable={false}
      style={styles.dialog}
    >
      <Dialog.Title>{force ? '版本更新' : '发现新版本'}</Dialog.Title>

      <Dialog.Content>
        {phase === 'available' || phase === 'error' ? (
          <>
            <Text variant="bodyMedium" style={styles.headline}>
              {info?.version ? `新版本 v${info.version}` : `新版本（版本号 ${info?.versionCode}）`}
            </Text>

            {sizeText ? (
              <Text variant="bodySmall" style={styles.meta}>
                安装包大小 {sizeText}
              </Text>
            ) : null}

            {info?.updateContent ? (
              <ScrollView style={styles.notes} nestedScrollEnabled>
                <Text variant="bodySmall" style={styles.notesText}>
                  {info.updateContent}
                </Text>
              </ScrollView>
            ) : null}

            {force ? (
              <Text variant="bodySmall" style={styles.forceHint}>
                本次为必须更新，更新完成后即可继续使用。
              </Text>
            ) : null}

            {phase === 'error' && errorText ? (
              <Text variant="bodySmall" style={styles.error}>
                {errorText}
              </Text>
            ) : null}

            {/* "不再提示"的勾选框挪到底部按钮那一行（见 Dialog.Actions） */}
          </>
        ) : null}

        {phase === 'downloading' ? (
          <>
            <Text variant="bodyMedium" style={styles.headline}>
              正在下载更新…
            </Text>
            <ProgressBar
              progress={ratio ?? 0}

              indeterminate={ratio === null}
              color={palette.peach}
              style={styles.progress}
            />
            <Text variant="bodySmall" style={styles.meta}>
              {percentText ? `${percentText}　` : ''}
              {downloadedText}
            </Text>
          </>
        ) : null}

        {phase === 'installing' ? (
          <>
            <Text variant="bodyMedium" style={styles.headline}>
              正在打开安装程序…
            </Text>
            <Text variant="bodySmall" style={styles.meta}>
              请在系统弹出的界面里完成安装。若提示"禁止安装"，请允许本应用安装未知应用。
            </Text>
          </>
        ) : null}
      </Dialog.Content>

      <Dialog.Actions style={styles.actions}>
        {phase === 'available' && !force ? (
          <>
            {/*
              "不再提示"的勾选框：放在这一行的最左边（marginRight:'auto' 把它顶到左侧，
              两个按钮继续靠右），和「稍后更新」挨着 —— 它是"稍后更新"的修饰，
              而不是一个独立的操作。点一下只是勾选，不会有任何后果。
            */}
            <View style={styles.skipRow}>
              {/*
                这版 Paper 的 Checkbox 没有 size 属性（尺寸写死在图标里），
                想小一点只能整体缩一下。缩 0.85 后差不多 20dp，
                和旁边 14 号字的标签配起来刚好。
              */}
              <Checkbox.Android
                status={skipChecked ? 'checked' : 'unchecked'}
                onPress={() => setSkipChecked(value => !value)}
                color={palette.peachDeep}
                style={styles.skipCheckbox}
              />
              <Text
                variant="bodySmall"
                style={styles.skipLabel}
                onPress={() => setSkipChecked(value => !value)}
              >
                不再提示
              </Text>
            </View>
            <Button
              onPress={handleLater}
              textColor={palette.cocoaSoft}
              style={dialogButtonStyle.button}
              contentStyle={dialogButtonStyle.content}
              labelStyle={dialogButtonStyle.label}
            >
              稍后更新
            </Button>
            <Button
              mode="contained"
              onPress={() => void startDownload()}
              style={dialogButtonStyle.button}
              contentStyle={dialogButtonStyle.content}
              labelStyle={dialogButtonStyle.label}
            >
              立即更新
            </Button>
          </>
        ) : null}

        {phase === 'available' && force ? (
          <>
            <Button
              onPress={handleExit}
              textColor={palette.cocoaSoft}
              style={dialogButtonStyle.button}
              contentStyle={dialogButtonStyle.content}
              labelStyle={dialogButtonStyle.label}
            >
              退出应用
            </Button>
            <Button
              mode="contained"
              onPress={() => void startDownload()}
              style={dialogButtonStyle.button}
              contentStyle={dialogButtonStyle.content}
              labelStyle={dialogButtonStyle.label}
            >
              立即更新
            </Button>
          </>
        ) : null}

        {phase === 'downloading' ? (
          <Button
            onPress={cancelDownload}
            textColor={palette.cocoaSoft}
            style={dialogButtonStyle.button}
            contentStyle={dialogButtonStyle.content}
            labelStyle={dialogButtonStyle.label}
          >
            取消
          </Button>
        ) : null}

        {phase === 'error' ? (
          <>
            <Button
              onPress={dismiss}
              textColor={palette.cocoaFaint}
              style={dialogButtonStyle.button}
              contentStyle={dialogButtonStyle.content}
              labelStyle={dialogButtonStyle.label}
            >
              关闭
            </Button>
            {errorKind === 'install' ? (
              <Button
                onPress={() => void goUnknownSources()}
                textColor={palette.cocoaSoft}
                style={dialogButtonStyle.button}
                contentStyle={dialogButtonStyle.content}
                labelStyle={dialogButtonStyle.label}
              >
                去设置
              </Button>
            ) : (
              <Button
                onPress={() => void startDownload()}
                textColor={palette.cocoaSoft}
                style={dialogButtonStyle.button}
                contentStyle={dialogButtonStyle.content}
                labelStyle={dialogButtonStyle.label}
              >
                重试
              </Button>
            )}
            {/* 兜底：交给系统浏览器下载 + 安装，这条路径基本不会失败 */}
            <Button
              mode="contained"
              onPress={() => void useBrowser()}
              style={dialogButtonStyle.button}
              contentStyle={dialogButtonStyle.content}
              labelStyle={dialogButtonStyle.label}
            >
              浏览器下载
            </Button>
          </>
        ) : null}
      </Dialog.Actions>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  dialog: {
    borderRadius: radius.xl,
    backgroundColor: '#FFFFFF',
  },
  headline: {
    color: palette.cocoa,
    fontWeight: '600',
  },
  meta: {
    color: palette.cocoaFaint,
    marginTop: spacing.xs,
  },
  notes: {

    maxHeight: 160,
    marginTop: spacing.md,
    borderRadius: radius.md,
    backgroundColor: palette.peachTint,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  notesText: {
    color: palette.cocoaSoft,
    lineHeight: 20,
  },
  forceHint: {
    marginTop: spacing.md,
    color: palette.peachDeep,
  },
  error: {
    marginTop: spacing.md,
    color: palette.danger,
    lineHeight: 20,
  },
  progress: {
    marginTop: spacing.md,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: palette.peachTint,
  },
  actions: {

    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  skipRow: {
    flexDirection: 'row',
    alignItems: 'center',

    marginRight: 'auto',
  },
  skipCheckbox: {
    transform: [{ scale: 0.85 }],

    marginVertical: -3,
    marginLeft: -4,
  },
  skipLabel: {
    color: palette.cocoaSoft,
  },
});

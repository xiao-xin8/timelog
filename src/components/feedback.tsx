import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ActivityIndicator, Modal, StyleSheet } from 'react-native';
import { Button, Dialog, Snackbar, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { dialogButtonStyle, palette, radius, spacing } from '../theme';

/**
 * 通用反馈：Toast / Loading / 确认弹窗
 *
 * 对应旧项目自研的 custom-toast、custom-loading、option-dialog 三个组件。
 * 新版直接用 React Native Paper，不自己造轮子。
 *
 * 用法（在任意组件里）：
 *   const { toast, loading, confirm } = useFeedback();
 *   toast('保存成功');
 *   loading(true, '同步中…');
 *   const ok = await confirm({ title: '删除事件', message: '删除后不可恢复' });
 */

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
}

interface FeedbackApi {
  /** 弹一条短暂提示 */
  toast(message: string, duration?: number): void;
  /** 显示/隐藏加载遮罩 */
  loading(visible: boolean, message?: string): void;
  /** 弹确认框，返回用户是否点了确认 */
  confirm(options: ConfirmOptions): Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackApi | null>(null);

export function useFeedback(): FeedbackApi {
  const api = useContext(FeedbackContext);
  if (!api) {
    throw new Error('useFeedback 必须在 FeedbackProvider 内部使用');
  }
  return api;
}

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [snackVisible, setSnackVisible] = useState(false);
  const [snackText, setSnackText] = useState('');
  const [snackDuration, setSnackDuration] = useState(2000);

  const [loadingVisible, setLoadingVisible] = useState(false);
  const [loadingText, setLoadingText] = useState<string | undefined>();

  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmOptions, setConfirmOptions] = useState<ConfirmOptions | null>(null);
  const confirmResolver = useRef<((ok: boolean) => void) | null>(null);

  /** 弹窗所在的 RN 原生窗口是否挂载（见下方注释） */
  const [layerMounted, setLayerMounted] = useState(false);
  /** 窗口就绪后再翻 true，用来触发 Dialog 的入场动画（见下方注释） */
  const [shown, setShown] = useState(false);

  const toast = useCallback((message: string, duration = 2000) => {
    setSnackText(message);
    setSnackDuration(duration);
    setSnackVisible(true);
  }, []);

  const loading = useCallback((visible: boolean, message?: string) => {
    setLoadingText(message);
    setLoadingVisible(visible);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    setConfirmOptions(options);
    setConfirmVisible(true);
    return new Promise<boolean>(resolve => {
      confirmResolver.current = resolve;
    });
  }, []);

  const settleConfirm = useCallback((ok: boolean) => {
    setConfirmVisible(false);
    const resolve = confirmResolver.current;
    confirmResolver.current = null;

    setTimeout(() => resolve?.(ok), 150);
  }, []);

  const api = useMemo<FeedbackApi>(
    () => ({ toast, loading, confirm }),
    [toast, loading, confirm],
  );


  useEffect(() => {
    if (confirmVisible || loadingVisible) {
      setLayerMounted(true);
      return;
    }
    if (!layerMounted) return;
    const timer = setTimeout(() => setLayerMounted(false), 240);
    return () => clearTimeout(timer);
  }, [confirmVisible, loadingVisible, layerMounted]);


  useEffect(() => {
    if (!layerMounted) {
      setShown(false);
      return;
    }
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, [layerMounted]);

  /** 真正喂给 Dialog 的 visible：窗口就绪之前一律 false */
  const dialogVisible = shown && confirmVisible;
  const loadingDialogVisible = shown && loadingVisible;

  return (
    <FeedbackContext.Provider value={api}>
      {children}

      {/* Toast —— 默认位置贴在屏幕底部，会压住底部 tab 栏和 FAB，这里移到顶部 */}
      <Snackbar
        visible={snackVisible}
        onDismiss={() => setSnackVisible(false)}
        duration={snackDuration}
        wrapperStyle={[styles.snackbarWrapper, { top: insets.top + spacing.sm }]}
        style={styles.snackbar}
        contentStyle={styles.snackbarContent}
      >
        <Text style={styles.snackbarText}>{snackText}</Text>
      </Snackbar>

      {/* 弹窗层：套 RN Modal，保证压得住抽屉 / BottomSheet 这些原生窗口 */}
      <Modal
        visible={layerMounted}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => {
          if (confirmVisible) settleConfirm(false);
        }}
      >
        {/*
          这里**直接渲染 Dialog，外面不能再套 `<Portal>`**。

          RN 的 `Modal` 会开一个**独立的原生视图树**，而 `Portal` 是靠 context
          找根视图里的 `PortalHost`、把内容挂到那边去的。两棵原生树对不上，
          Portal 找不到 host 就渲染出空内容 —— 但那个全屏透明的原生窗口照样
          建立起来并吞掉所有触摸，表现就是「点哪儿都没反应」，整个界面卡死。

          `Dialog` 本身是自足的：它内部就是 Paper 的 `Modal`（一个
          `StyleSheet.absoluteFill` 的 Animated.View），自带遮罩、点外部关闭、
          居中，不需要 `Portal`。`Portal` 在这里唯一的作用就是把 Dialog 提到
          根节点，而我们本来就已经在一个全屏的最上层窗口里了。

          两个 Dialog 叠在一起没问题：不可见的那个 `pointerEvents: 'none'`，
          不会挡触摸（两者不会同时为 true）。
        */}
        <Dialog
          visible={dialogVisible}
          onDismiss={() => settleConfirm(false)}
          style={styles.dialog}
        >
          <Dialog.Title>{confirmOptions?.title ?? ''}</Dialog.Title>
          {confirmOptions?.message ? (
            <Dialog.Content>
              <Text variant="bodyMedium">{confirmOptions.message}</Text>
            </Dialog.Content>
          ) : null}
          <Dialog.Actions>
            <Button
              onPress={() => settleConfirm(false)}
              textColor={palette.cocoaSoft}
              style={dialogButtonStyle.button}
              contentStyle={dialogButtonStyle.content}
              labelStyle={dialogButtonStyle.label}
            >
              {confirmOptions?.cancelText ?? '取消'}
            </Button>
            <Button
              mode="contained"
              onPress={() => settleConfirm(true)}
              style={dialogButtonStyle.button}
              contentStyle={dialogButtonStyle.content}
              labelStyle={dialogButtonStyle.label}
            >
              {confirmOptions?.confirmText ?? '确定'}
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* 加载遮罩 */}
        <Dialog
          visible={loadingDialogVisible}
          dismissable={false}
          style={styles.loadingDialog}
        >
          <Dialog.Content style={styles.loadingContent}>
            <ActivityIndicator size="large" color={palette.peach} />
            {loadingText ? (
              <Text variant="bodyMedium" style={styles.loadingText}>
                {loadingText}
              </Text>
            ) : null}
          </Dialog.Content>
        </Dialog>
      </Modal>
    </FeedbackContext.Provider>
  );
}

const styles = StyleSheet.create({
  snackbarWrapper: {

    bottom: 'auto',
    paddingHorizontal: spacing.lg,

    alignItems: 'center',
  },
  snackbar: {
    backgroundColor: palette.cocoa,
    borderRadius: radius.pill,

    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
  },
  snackbarContent: {

    flex: 0,

    marginHorizontal: 0,
  },
  snackbarText: {
    color: palette.cream,
  },
  dialog: {
    borderRadius: radius.xl,
    backgroundColor: '#FFFFFF',
  },
  loadingDialog: {
    borderRadius: radius.xl,
    backgroundColor: 'rgba(255,255,255,0.96)',
    alignSelf: 'center',
    width: 140,
  },
  loadingContent: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  loadingText: {
    color: palette.cocoaSoft,
  },
});

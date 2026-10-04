/**
 * 时光日志 App
 *
 * @format
 */

import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import RootNavigator from './src/navigation/RootNavigator';
import { FeedbackProvider } from './src/components/feedback';
import UpdateGate from './src/components/UpdateGate';
import { lightTheme } from './src/theme';
import { useEventStore } from './src/store/useEventStore';
import { useCategoryStore } from './src/store/useCategoryStore';
import { useAuthStore } from './src/store/useAuthStore';
import { useSyncStore } from './src/store/useSyncStore';
import { restoreOrientation } from './src/utils/orientation';

/**
 * 启动顺序**必须串行，不能并行**。
 *
 * 三件事之间有先后依赖：
 *
 *   1. 同步引擎先就绪（读水位和待推队列）—— 否则登录态一恢复就同步，
 *      队列还没读进来，那批本地改动会被漏掉
 *   2. 本地数据（事件、分类）读进 store —— 云端合并是「以本地列表为底」，
 *      本地还是空的时候合并就等于拿云端覆盖本地，会把数据洗掉
 *   3. 最后才是登录态
 *
 * 说明：改成「只有用户主动登录才同步」之后（见 `useSyncStore` 的订阅），
 * 第 3 步和前两步其实已经没有硬依赖了 —— 冷启动恢复登录态不再触发同步。
 * 这个顺序仍然保留，是**防御性**的：一旦以后又把某个自动同步的时机加回来，
 * 并行启动就会踩到「本地还是空数组就合并云端数据」这个会静默洗掉用户数据的坑。
 */
async function bootstrap(): Promise<void> {
  await useSyncStore.getState().bootstrap();

  await Promise.all([
    useEventStore.getState().load(),
    useCategoryStore.getState().load(),
  ]);

  await useAuthStore.getState().load();


  await restoreOrientation();
}

export default function App() {

  useEffect(() => {
    void bootstrap();
  }, []);



  return (
    <SafeAreaProvider>
      <PaperProvider theme={lightTheme}>
        <FeedbackProvider>
          <NavigationContainer>
            {/* 顶栏是奶油浅色，状态栏文字用深色 */}
            <StatusBar style="dark" />
            <RootNavigator />

            {/*
              更新检查（Slice 17）：启动后延迟几秒查一次 + 承载更新弹窗。
              放在这里是因为它要用 Paper 的 Dialog（走 Portal，必须在 PaperProvider 里），
              而且要在登录态/数据加载之外 —— 它跟用户数据没关系，未登录也要能更新。
            */}
            <UpdateGate />
          </NavigationContainer>
        </FeedbackProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}

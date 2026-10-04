import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from 'react-native-paper';

import AboutScreen from '../screens/AboutScreen';
import AddEventScreen from '../screens/AddEventScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import EventDetailScreen from '../screens/EventDetailScreen';
import ExportScreen from '../screens/ExportScreen';
import LoginScreen from '../screens/LoginScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ChatListScreen from '../screens/ChatListScreen';
import ChatRoomScreen from '../screens/ChatRoomScreen';
import StoryDetailScreen from '../screens/StoryDetailScreen';
import StoryListScreen from '../screens/StoryListScreen';
import StoryPublishScreen from '../screens/StoryPublishScreen';
import UserProfileScreen from '../screens/UserProfileScreen';
import SlideshowSettingsScreen from '../screens/SlideshowSettingsScreen';
import SlideshowPlayerScreen from '../screens/SlideshowPlayerScreen';
import TabNavigator from './TabNavigator';
import type { RootStackParamList } from './types';

/**
 * 外层栈
 *
 * ## 全 App 没有导航栏：顶部只有悬浮按钮，底部一根 tab 胶囊
 *
 * 所有页面都 `headerShown: false`：
 * - **顶部**：`components/FloatingBar.tsx` 的几枚悬浮圆钮；没有操作入口的页面顶部就是空的
 * - **底部**：`TabNavigator` 的胶囊 tab 条，四个 tab
 *
 * 顶部**不再有任何横条和标题**（用户明确要求「把所有导航栏都去了」）。
 * 页面内容自己避让：有悬浮按钮用 `FLOATING_CLEARANCE`，
 * 没有按钮用 `TOP_CONTENT_GAP`，底部在 tab 里的页面用 `CONTENT_CLEARANCE`。
 *
 * 曾经试过把系统标题栏压低到和底栏同高 —— native-stack 的标题栏是原生组件，
 * `headerStyle` 只吃 `backgroundColor`，改不了高度，所以那套已经推翻。
 */

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const theme = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },

        animation: 'slide_from_bottom',
        animationDuration: 200,

        gestureDirection: 'vertical',
        gestureEnabled: true,
      }}
    >
      {/*
        Tabs 是栈底，退回它时用**快速横向滑动**。
        原来这里写的是 `fade`，从二级页返回会整体淡入一下，两个页面内容差别大时
        明显能看出闪烁，像 bug。
      */}
      <Stack.Screen
        name="Tabs"
        component={TabNavigator}
        options={{
          animation: 'slide_from_right',
          gestureDirection: 'horizontal',
          animationDuration: 160,
        }}
      />
      <Stack.Screen name="AddEvent" component={AddEventScreen} />
      {/*
        详情是「下钻」页面，用从右侧滑入；全局默认的 slide_from_bottom 是给
        新增/编辑这类「创建」语义的页面用的。
      */}
      <Stack.Screen
        name="EventDetail"
        component={EventDetailScreen}
        options={{ animation: 'slide_from_right', gestureDirection: 'horizontal' }}
      />
      {/*
        导出页是从详情页"再往下一层"的工具页，同样用横向滑动，
        手势方向跟着改成横向，返回时右滑关闭。
      */}
      <Stack.Screen
        name="Export"
        component={ExportScreen}
        options={{ animation: 'slide_from_right', gestureDirection: 'horizontal' }}
      />
      {/*
        登录页沿用全局默认的「从底部升起」：它是一张盖在「我的」上面的接管页，
        不是下钻层级，弹出感更合适，和 App 里其他表单页也一致。
      */}
      <Stack.Screen name="Login" component={LoginScreen} />

      {/*
        下面三个都是「从『我的』往下钻」的页面，统一横向滑入 + 右滑返回。
      */}
      <Stack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{ animation: 'slide_from_right', gestureDirection: 'horizontal' }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ animation: 'slide_from_right', gestureDirection: 'horizontal' }}
      />
      <Stack.Screen
        name="About"
        component={AboutScreen}
        options={{ animation: 'slide_from_right', gestureDirection: 'horizontal' }}
      />

      {/*
        故事列表是从「时光社区」tab 往下钻的页面，同样横向滑入 + 右滑返回。
      */}
      <Stack.Screen
        name="StoryList"
        component={StoryListScreen}
        options={{ animation: 'slide_from_right', gestureDirection: 'horizontal' }}
      />
      {/* 详情是从列表再往下钻一层，转场一致 */}
      <Stack.Screen
        name="StoryDetail"
        component={StoryDetailScreen}
        options={{ animation: 'slide_from_right', gestureDirection: 'horizontal' }}
      />
      {/* 发布是从下往上推的模态感（和「新增事件」一致） */}
      <Stack.Screen
        name="StoryPublish"
        component={StoryPublishScreen}
        options={{ animation: 'slide_from_bottom', gestureDirection: 'vertical' }}
      />

      {/* 聊天：会话列表 → 聊天室 → 看他人资料，都是右进右出 */}
      <Stack.Screen
        name="ChatList"
        component={ChatListScreen}
        options={{ animation: 'slide_from_right', gestureDirection: 'horizontal' }}
      />
      <Stack.Screen
        name="ChatRoom"
        component={ChatRoomScreen}
        options={{ animation: 'slide_from_right', gestureDirection: 'horizontal' }}
      />
      <Stack.Screen
        name="UserProfile"
        component={UserProfileScreen}
        options={{ animation: 'slide_from_right', gestureDirection: 'horizontal' }}
      />

      {/*
        轮播放映：设置页是「下钻」的配置页（右进右出），
        播放器是整块盖住屏幕的全屏页，用淡入淡出更贴合"切换模式"的语义。
      */}
      <Stack.Screen
        name="SlideshowSettings"
        component={SlideshowSettingsScreen}
        options={{ animation: 'slide_from_right', gestureDirection: 'horizontal' }}
      />
      <Stack.Screen
        name="SlideshowPlayer"
        component={SlideshowPlayerScreen}
        options={{ animation: 'fade', gestureEnabled: false }}
      />
    </Stack.Navigator>
  );
}

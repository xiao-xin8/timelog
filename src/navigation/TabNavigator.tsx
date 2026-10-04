import React from 'react';
import { useWindowDimensions } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons as MaterialDesignIcons } from '@expo/vector-icons';
import { useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette } from '../theme';
import {
  CAPSULE_EDGE_GAP,
  CAPSULE_HEIGHT,
  CAPSULE_MARGIN,
  TAB_ICON_SIZE,
  TRANSITION_DURATION,
} from './layout';
import HomeScreen from '../screens/HomeScreen';
import CalendarScreen from '../screens/CalendarScreen';
import CommunityScreen from '../screens/CommunityScreen';
import ProfileScreen from '../screens/ProfileScreen';

/**
 * 底部四个 tab
 *
 * 旧项目 pages.json 里的 tabBar 有 5 个（含「设备中心」），
 * 但那个页面零功能纯占位，官方迁移方案里已砍掉，所以新版是 4 个。
 */

export type RootTabParamList = {
  Home: undefined;
  Calendar: undefined;
  Community: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

type IconName = React.ComponentProps<typeof MaterialDesignIcons>['name'];

const TABS = [
  {
    name: 'Home',
    title: '时光日志',
    icon: 'home-variant-outline',
    iconActive: 'home-variant',
    component: HomeScreen,
  },
  {
    name: 'Calendar',
    title: '时光日历',
    icon: 'calendar-month-outline',
    iconActive: 'calendar-month',
    component: CalendarScreen,
  },
  {
    name: 'Community',
    title: '时光社区',
    icon: 'account-group-outline',
    iconActive: 'account-group',
    component: CommunityScreen,
  },
  {
    name: 'Profile',
    title: '我的',
    icon: 'account-circle-outline',
    iconActive: 'account-circle',
    component: ProfileScreen,
  },
] as const satisfies ReadonlyArray<{
  name: keyof RootTabParamList;
  title: string;
  icon: IconName;
  iconActive: IconName;
  component: React.ComponentType;
}>;

/**
 * 底部导航：一根悬浮胶囊
 *
 * ⚠️ 现在**全 App 只有这一根胶囊**：顶部那根已经删掉了（用户原话「不想看到导航栏，
 * 搞得跟浏览器一样」，改成悬浮按钮，见 `components/FloatingBar.tsx`）。
 * 只放图标不放文字，浮在内容之上，页面用 `CONTENT_CLEARANCE` 避开。
 */

export default function TabNavigator() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  /** 整屏平移的基准宽度，缺了它两屏会错位 */
  const { width: sceneWidth } = useWindowDimensions();

  return (
    <Tab.Navigator
      screenOptions={{

        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: palette.mauve,

        tabBarShowLabel: false,
        tabBarStyle: {
          position: 'absolute',

          start: CAPSULE_MARGIN,
          end: CAPSULE_MARGIN,
          bottom: insets.bottom + CAPSULE_EDGE_GAP,
          height: CAPSULE_HEIGHT,
          borderRadius: CAPSULE_HEIGHT / 2,
          backgroundColor: '#FFFFFF',
          borderTopWidth: 0,

          borderWidth: 1,
          borderColor: palette.peachLine20,
          paddingBottom: 0,
          paddingTop: 0,
          elevation: 8,
          shadowColor: '#000',
          shadowOpacity: 0.12,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
        },

        tabBarIconStyle: {

          flex: 1,
          justifyContent: 'center',
        },

        animation: 'shift',
        sceneStyleInterpolator: ({ current }) => ({
          sceneStyle: {
            transform: [
              {
                translateX: current.progress.interpolate({
                  inputRange: [-1, 0, 1],
                  outputRange: [-sceneWidth, 0, sceneWidth],
                }),
              },
            ],
          },
        }),
        transitionSpec: {
          animation: 'timing',
          config: { duration: TRANSITION_DURATION },
        },
      }}
    >
      {TABS.map(tab => (
        <Tab.Screen
          key={tab.name}
          name={tab.name}
          component={tab.component}
          options={{
            title: tab.title,
            tabBarIcon: ({ focused, color }) => (
              <MaterialDesignIcons
                name={focused ? tab.iconActive : tab.icon}
                color={color}
                size={TAB_ICON_SIZE}
              />
            ),
          }}
        />
      ))}
    </Tab.Navigator>
  );
}

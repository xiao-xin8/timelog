import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { FAB, IconButton, List, Text, TouchableRipple, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import BottomSheet from '../components/BottomSheet';
import CategoryDrawer, { type DrawerEntry } from '../components/CategoryDrawer';
import EventCard from '../components/EventCard';
import { FloatingButton } from '../components/FloatingBar';
import { useFeedback } from '../components/feedback';
import { useTick } from '../hooks/useTick';
import {
  CONTENT_CLEARANCE,
  FAB_SIZE,
  FLOATING_BUTTON_SIZE,
  FLOATING_MARGIN,
  TOP_CONTENT_GAP,
} from '../navigation/layout';
import { useCategoryStore } from '../store/useCategoryStore';
import { useEventStore } from '../store/useEventStore';
import { palette, radius, spacing } from '../theme';
import type { EventItem } from '../types/event';
import type { RootStackParamList } from '../navigation/types';
import { sortByClosest, splitTopEvents } from '../utils/countdown';



/**
 * 右下角操作簇的总高度
 *
 * = 两枚小圆钮 + 两段间距 + 主按钮。列表底部要照这个值留白，
 * 否则滚到底时最后一张卡片会被按钮盖住。
 */
const ACTION_COLUMN_HEIGHT = FLOATING_BUTTON_SIZE * 2 + FAB_SIZE + spacing.sm * 2;

export default function HomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { toast, confirm } = useFeedback();


  const tick = useTick();

  const events = useEventStore(state => state.events);
  const removeEvent = useEventStore(state => state.remove);
  const categories = useCategoryStore(state => state.all);

  const [drawerOpen, setDrawerOpen] = useState(false);
  /** null = 全部 */
  const [filter, setFilter] = useState<string | null>(null);
  const [menuTarget, setMenuTarget] = useState<EventItem | null>(null);

  /** 列表是否正在滚动，用于挡掉滚动误触的长按 */
  const isScrolling = useRef(false);
  const scrollEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const beginScroll = () => {
    isScrolling.current = true;
    if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
  };

  /** 松手后再等一小会儿才允许长按，避免刚停手就误触 */
  const endScroll = () => {
    if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
    scrollEndTimer.current = setTimeout(() => {
      isScrolling.current = false;
    }, 250);
  };

  /** 分类 key → 显示名 / 图标，给筛选标签和卡片上的分类标签用 */
  const categoryNameOf = useMemo(() => {
    const map = new Map(categories.map(item => [item.key, item.name]));
    return (key: string) => map.get(key);
  }, [categories]);

  const categoryIconOf = useMemo(() => {
    const map = new Map(categories.map(item => [item.key, item.icon]));
    return (key: string) => map.get(key);
  }, [categories]);


  const { top, normal } = useMemo(() => {

    void tick;

    const sorted = sortByClosest(events);
    const split = splitTopEvents(sorted);


    return {
      top: split.top,
      normal: filter
        ? split.normal.filter(event => event.category === filter)
        : split.normal,
    };
  }, [events, filter, tick]);

  const total = top.length + normal.length;
  const isEmpty = events.length === 0;


  const drawerEntries: DrawerEntry[] = useMemo(
    () =>
      categories.map(item => ({
        ...item,
        count: events.filter(event => event.category === item.key).length,
      })),
    [categories, events],
  );




  const handleDelete = async (event: EventItem) => {
    setMenuTarget(null);
    const ok = await confirm({
      title: '删除事件',
      message: `确定删除「${event.title}」？删除后不可恢复。`,
      confirmText: '删除',
    });
    if (!ok) return;

    await removeEvent(event.id);
    // TODO(Slice 10)：这里接云端删除同步
    toast('已删除');
  };

  /** 点卡片 → 进详情（照搬旧版首页 goToDetail） */
  const handleOpenDetail = useCallback(
    (event: EventItem) => {
      navigation.navigate('EventDetail', { id: event.id });
    },
    [navigation],
  );

  const handleEdit = (event: EventItem) => {
    setMenuTarget(null);
    navigation.navigate('AddEvent', { id: event.id });
  };

  /**
   * 长按打开菜单
   *
   * 滚动过程中手指会长时间压在某张卡片上，容易误判成长按。
   * 这里靠 `isScrolling` 把滚动期间的按压挡掉，松手滚完再恢复。
   */
  const handleLongPress = useCallback(
    (event: EventItem) => {
      if (isScrolling.current) return;
      setMenuTarget(event);
    },
    [],
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      {isEmpty ? (
        <EmptyState onPress={() => navigation.navigate('AddEvent')} />
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.list,

            {

              paddingTop: insets.top + TOP_CONTENT_GAP,

              paddingBottom:
                insets.bottom + CONTENT_CLEARANCE + ACTION_COLUMN_HEIGHT + spacing.sm,
            },
          ]}
          onScrollBeginDrag={beginScroll}
          onScrollEndDrag={endScroll}
          onMomentumScrollBegin={beginScroll}
          onMomentumScrollEnd={endScroll}
        >
          {/* 筛选生效时给个可关闭的标签（图标 + 名称 + ✕，照搬旧版 .filter-tag） */}
          {filter ? (
            <View style={styles.filterChip}>
              {categoryIconOf(filter) ? (
                <Text variant="bodyMedium" style={styles.filterIcon}>
                  {categoryIconOf(filter)}
                </Text>
              ) : null}
              <Text style={styles.filterText} numberOfLines={1}>
                {categoryNameOf(filter) ?? '未知分类'}
              </Text>
              <TouchableRipple onPress={() => setFilter(null)} borderless>
                <MaterialCommunityIcons name="close" size={18} color={palette.peachDeep} />
              </TouchableRipple>
            </View>
          ) : null}

          {/*
            置顶区：始终显示，不受筛选影响。

            「置顶」「全部」两个分隔标签已经去掉 —— 置顶只体现在排序上，
            界面上不再有任何说明文字（静默置顶）。
          */}
          {top.map(event => (
            <EventCard
              key={event.id}
              event={event}
              categoryLabel={categoryNameOf(event.category)}
              categoryIcon={categoryIconOf(event.category)}
              onPress={handleOpenDetail}
              onLongPress={handleLongPress}
            />
          ))}

          {normal.map(event => (
            <EventCard
              key={event.id}
              event={event}
              categoryLabel={categoryNameOf(event.category)}
              categoryIcon={categoryIconOf(event.category)}
              onPress={handleOpenDetail}
              onLongPress={handleLongPress}
            />
          ))}

          {/* 筛完没结果 */}
          {!isEmpty && total === 0 ? (
            <Text style={styles.emptyFilter}>该分类下还没有事件</Text>
          ) : null}
        </ScrollView>
      )}

      {/*
        右下角操作簇：筛选 / 轮播 / 新增

        前两枚原本浮在顶部，但那样内容必须为它们让出 52dp ——
        首页状态栏底下永远是空的。全部挪到右下角之后，
        内容可以直接顶到状态栏下面（只留 TOP_CONTENT_GAP）。
      */}
      <View
        style={[styles.actionColumn, { bottom: insets.bottom + CONTENT_CLEARANCE }]}
        pointerEvents="box-none"
      >
        <FloatingButton
          icon="menu"
          onPress={() => setDrawerOpen(true)}
          accessibilityLabel="按分类筛选"
        />
        <FloatingButton
          icon="play-circle-outline"
          onPress={() => navigation.navigate('SlideshowSettings')}
          accessibilityLabel="轮播播放"
        />
        <FAB
          icon="plus"
          color="#FFFFFF"
          accessibilityLabel="新增事件"
          style={styles.fabPrimary}
          onPress={() => navigation.navigate('AddEvent')}
        />
      </View>

      {/* 分类筛选抽屉 */}
      <CategoryDrawer
        visible={drawerOpen}
        onDismiss={() => setDrawerOpen(false)}
        selected={filter}
        onSelect={setFilter}
        entries={drawerEntries}
        total={events.length}
      />

      {/* 长按菜单 */}
      <BottomSheet
        visible={menuTarget !== null}
        title={menuTarget?.title ?? ''}
        onDismiss={() => setMenuTarget(null)}
        heightRatio={0.32}
      >
        <List.Item
          title="编辑事件"
          left={props => <List.Icon {...props} icon="pencil-outline" />}
          onPress={() => menuTarget && handleEdit(menuTarget)}
        />
        <List.Item
          title="删除事件"
          titleStyle={styles.dangerText}
          left={props => (
            <List.Icon {...props} icon="trash-can-outline" color={palette.danger} />
          )}
          onPress={() => menuTarget && handleDelete(menuTarget)}
        />
      </BottomSheet>
    </View>
  );
}

/** 没有任何事件时的引导卡 */
function EmptyState({ onPress }: { onPress(): void }) {
  return (
    <View style={styles.empty}>
      <MaterialCommunityIcons name="calendar-heart" size={64} color={palette.mauve} />
      <Text style={styles.emptyTitle}>还没有记录</Text>
      <Text style={styles.emptyHint}>把重要的日子记下来，让每一天都有期待</Text>

      <TouchableRipple onPress={onPress} style={styles.emptyButton} borderless>
        <View style={styles.emptyButtonInner}>
          <MaterialCommunityIcons name="plus" size={20} color="#FFFFFF" />
          <Text style={styles.emptyButtonText}>添加第一个时光日志</Text>
        </View>
      </TouchableRipple>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  list: {
    padding: spacing.lg,
    gap: spacing.md,
    // 顶/底避让由调用处的 CONTENT_CLEARANCE 统一给，这里不再重复叠加
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: palette.peachTint,
  },
  filterText: {
    color: palette.peachDeep,
    fontWeight: '600',
  },
  filterIcon: {
    marginRight: 2,
  },

  emptyFilter: {
    marginTop: spacing.xxl,
    textAlign: 'center',
    color: palette.cocoaFaint,
  },


  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: CONTENT_CLEARANCE,
    paddingBottom: CONTENT_CLEARANCE,
  },
  emptyTitle: {
    marginTop: spacing.sm,
    color: palette.cocoa,
    fontWeight: '700',
  },
  emptyHint: {
    textAlign: 'center',
    color: palette.cocoaFaint,
  },
  emptyButton: {
    marginTop: spacing.lg,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  emptyButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: palette.peach,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  dangerText: {
    color: palette.danger,
  },

  actionColumn: {
    position: 'absolute',

    right: FLOATING_MARGIN,

    alignItems: 'center',
    gap: spacing.sm,
    // bottom 在渲染处按安全区计算（见 CONTENT_CLEARANCE），这里只定位右侧
  },
  fabPrimary: {
    backgroundColor: palette.peach,


    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
  },
});

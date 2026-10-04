import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons as MaterialDesignIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, IconButton, List, Text, TextInput } from 'react-native-paper';

import BottomSheet from '../components/BottomSheet';
import EmojiPanel from '../components/EmojiPanel';
import FloatingBar, { FloatingButton } from '../components/FloatingBar';
import UserAvatar from '../components/UserAvatar';
import { useFeedback } from '../components/feedback';
import { useChatSocket, type ChatPush } from '../hooks/useChatSocket';
import { TOP_CONTENT_GAP } from '../navigation/layout';
import type { RootStackParamList } from '../navigation/types';
import type { AuthUser } from '../services/api';
import { ApiError } from '../services/api';
import {
  clearMessages,
  fetchChatRoom,
  fetchMessages,
  sendMessage,
} from '../services/chat';
import { useAuthStore } from '../store/useAuthStore';
import { inputTheme, palette, radius, spacing } from '../theme';
import { CHAT_MESSAGE_MAX, type ChatMessage } from '../types/chat';
import { formatMessageTime, parseStoryMessage, shouldShowTime } from '../utils/chat';

/**
 * 聊天室（Slice 13c）
 *
 * ## 收发是两条路
 *
 * - **发**走 HTTP（`POST /api/chat/messages`）—— 写路径只有一处，能被服务端
 *   完整校验和落库
 * - **收**走 WebSocket（`useChatSocket`）—— 服务端推给在线的双方
 *
 * 所以自己发的消息也会**被服务端推回来**。这不是多余的：回来那条带的是
 * 真 id 和服务端时间戳，正好用来替换本地那条乐观插入的临时消息。
 *
 * ## 乐观更新
 *
 * 点发送立刻把消息插进列表（`temp_` 开头的临时 id），不等接口。
 * 失败时**把临时消息摘掉、内容还给输入框**，让用户能直接重试 ——
 * 不这么做的话他得重新打一遍字。
 *
 * ## 列表「老的在前」，从上往下排
 *
 * 服务端给的历史是「**最新在前**」（为了翻页方便），进这个页面时统一翻成
 * 「老的在前」再渲染 —— 从上往下按时间顺序读。
 *
 * 因为新消息追加在**下面**，每次消息数变化都要 `scrollToEnd()`：
 * 不滚的话它就落在可视区外面，用户会以为没收到。
 *
 * （试过 `inverted`：那样消息从**底部**往上堆，内容少的时候全贴在屏幕下沿、
 * 上面空一大片，看着像没加载出来。不如从上往下排自然。）
 */

type Navigation = NativeStackNavigationProp<RootStackParamList>;
type ChatRoomRoute = RouteProp<RootStackParamList, 'ChatRoom'>;

/** 列表里的一行：一条消息 + 它上面要不要插时间分隔 */
interface ChatRow {
  message: ChatMessage;
  showTime: boolean;
}

/** 底部输入条的高度（列表按它留白） */
const INPUT_BAR_HEIGHT = 76;

/** 乐观更新的临时 id 前缀。服务端生成的 id 不会是 `temp_` 开头 */
const TEMP_PREFIX = 'temp_';

/**
 * 服务端给的历史是「**最新在前**」（为了翻页方便），而界面要「**老的在前**」——
 * 从上往下按时间顺序读。
 *
 * 所有从服务端来的消息都过这个函数翻一遍，别在几个地方各 `reverse()` 一次。
 */
function toDisplayOrder(history: ChatMessage[]): ChatMessage[] {
  return [...history].reverse();
}

export default function ChatRoomScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Navigation>();
  const { params } = useRoute<ChatRoomRoute>();
  const { toast, confirm } = useFeedback();

  const targetId = params.userId;
  const me = useAuthStore(state => state.user);
  const signedIn = useAuthStore(state => state.status === 'signedIn');

  const [peer, setPeer] = useState<AuthUser | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  /**
   * **对方**在不在线。
   *
   * 和「我连没连上」（`connected`）是两件事，界面上要分开表达：
   *   - 我没连上           → 「连接中…」
   *   - 连上了、对方也在   → 「● 在线」
   *   - 连上了、对方不在   → 「已连接」
   */
  const [peerOnline, setPeerOnline] = useState(false);

  /** 表情面板开着没有 */
  const [emojiOpen, setEmojiOpen] = useState(false);
  /** 右上角「更多」菜单开着没有 */
  const [menuOpen, setMenuOpen] = useState(false);

  /** 列表 ref —— 新消息进来时要滚到底，否则它在可视区外面 */
  const listRef = useRef<FlatList<ChatRow>>(null);



  const load = useCallback(async () => {
    setLoading(true);
    try {

      const room = await fetchChatRoom(targetId);

      setPeer(room.user);
      setMessages(toDisplayOrder(room.messages));
      setPeerOnline(room.online);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [targetId]);

  useEffect(() => {
    void load();
  }, [load]);


  useEffect(() => {
    if (messages.length === 0) return;

    const timer = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(timer);
  }, [messages.length]);





  const handlePush = useCallback(
    (push: ChatPush) => {
      if (push.type === 'message') {
        const { message } = push;


        const related =
          (message.senderId === me?.id && message.receiverId === targetId) ||
          (message.senderId === targetId && message.receiverId === me?.id);
        if (!related) return;

        setMessages(prev => {

          if (prev.some(item => item.id === message.id)) return prev;

          return [...prev, message];
        });


        if (message.senderId === targetId) {
          void fetchMessages(targetId)
            .then(list => setMessages(toDisplayOrder(list)))
            .catch(() => undefined);
        }
        return;
      }

      if (push.type === 'presence') {

        if (push.userId === targetId) setPeerOnline(push.online);
        return;
      }

      if (push.type === 'read') {

        setMessages(prev => prev.map(item => (item.senderId === me?.id ? { ...item, isRead: true } : item)));
        return;
      }


      setMessages([]);
      toast('对方清空了你们的聊天记录');
    },
    [me?.id, targetId, toast],
  );

  const { connected } = useChatSocket({ enabled: signedIn, onPush: handlePush });



  const handleSend = useCallback(async () => {
    const content = draft.trim();
    if (!content || sending || !me) return;

    const tempId = `${TEMP_PREFIX}${Date.now()}`;
    const optimistic: ChatMessage = {
      id: tempId,
      senderId: me.id,
      receiverId: targetId,
      content,
      type: 'text',
      isRead: false,
      createTime: Date.now(),
    };


    setMessages(prev => [...prev, optimistic]);
    setDraft('');
    setSending(true);

    try {
      const real = await sendMessage({ targetUserId: targetId, content });

      setMessages(prev => prev.map(item => (item.id === tempId ? real : item)));
    } catch (err) {

      setMessages(prev => prev.filter(item => item.id !== tempId));
      setDraft(content);
      toast(err instanceof ApiError ? err.message : '发送失败，请稍后重试');
    } finally {
      setSending(false);
    }
  }, [draft, sending, me, targetId, toast]);



  /** 选中一个表情就追加到草稿末尾（长度由输入框的 maxLength 兜着） */
  const handlePickEmoji = useCallback((char: string) => {
    setDraft(prev => prev + char);
  }, []);

  const handleClear = useCallback(async () => {
    setMenuOpen(false);

    const ok = await confirm({
      title: '清空聊天记录',

      message: '会同时删掉你们两个人的记录，删除后无法恢复。',
      confirmText: '清空',
    });
    if (!ok) return;

    try {
      await clearMessages(targetId);
      setMessages([]);
      toast('已清空');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '清空失败，请稍后重试');
    }
  }, [targetId, confirm, toast]);



  const goBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('Tabs');
  }, [navigation]);

  const openProfile = useCallback(() => {
    navigation.navigate('UserProfile', { id: targetId });
  }, [navigation, targetId]);

  const openStory = useCallback(
    (storyId: string) => {
      navigation.navigate('StoryDetail', { id: storyId });
    },
    [navigation],
  );

  /** 预先算好每条消息要不要显示时间分隔（`shouldShowTime` 是纯函数，见 utils/chat） */
  const rows = useMemo<ChatRow[]>(
    () =>
      messages.map((message, index) => ({
        message,

        showTime: shouldShowTime(message.createTime, messages[index - 1]?.createTime ?? null),
      })),
    [messages],
  );

  const backBar = (
    <FloatingBar left={<FloatingButton icon="arrow-left" onPress={goBack} accessibilityLabel="返回" />} />
  );

  if (loading) {
    return (
      <View style={styles.root}>
        <View style={styles.center}>
          <ActivityIndicator color={palette.peach} />
        </View>
        {backBar}
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.root}>
        <View style={styles.center}>
          <MaterialDesignIcons name="cloud-off-outline" size={56} color={palette.mauve} />
          <Text variant="titleMedium" style={styles.noticeTitle}>
            没能加载出来
          </Text>
          <Text variant="bodySmall" style={styles.noticeDesc}>
            {error}
          </Text>
          <Button
            mode="contained"
            onPress={() => void load()}
            style={styles.noticeButton}
            contentStyle={styles.noticeButtonInner}
          >
            重试
          </Button>
        </View>
        {backBar}
      </View>
    );
  }

  const peerName = peer ? peer.nickname?.trim() || peer.username : '';

  return (
    <View style={styles.root}>
      {/* 头部：返回 + 对方（点一下看资料） */}
      <View style={[styles.header, { paddingTop: insets.top + TOP_CONTENT_GAP }]}>
        <FloatingButton icon="arrow-left" onPress={goBack} accessibilityLabel="返回" />

        <Pressable onPress={openProfile} style={styles.headerBody}>
          {peer ? <UserAvatar user={peer} size={36} /> : null}
          <View style={styles.headerText}>
            <Text variant="bodyLarge" style={styles.headerName} numberOfLines={1}>
              {peerName}
            </Text>
            {/*
              三种状态要分清 —— 「我连没连上」和「对方在不在线」是**两件事**：

                没连上            → 连接中…
                连上了、对方也在  → ● 在线（绿）
                连上了、对方不在  → 已连接

              ⚠️ 光是自己连上了**绝不能**显示「在线」：那会让人以为**对方**在线。
              反过来也不能只显示「已连接」，否则对方明明挂着你也看不出来。
            */}
            {!connected ? (
              <Text variant="bodySmall" style={styles.connectionText}>
                连接中…
              </Text>
            ) : peerOnline ? (
              <View style={styles.onlineRow}>
                <View style={styles.onlineDot} />
                <Text variant="bodySmall" style={styles.onlineText}>
                  在线
                </Text>
              </View>
            ) : (
              <Text variant="bodySmall" style={styles.connectionText}>
                已连接
              </Text>
            )}
          </View>
        </Pressable>

        <FloatingButton
          icon="dots-horizontal"
          onPress={() => setMenuOpen(true)}
          accessibilityLabel="更多操作"
        />
      </View>

      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={item => item.message.id}
        contentContainerStyle={[
          styles.list,
          {
            paddingTop: spacing.md,

            paddingBottom: insets.bottom + INPUT_BAR_HEIGHT,
          },
        ]}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <MessageRow
            message={item.message}
            showTime={item.showTime}
            mine={item.message.senderId === me?.id}
            peer={peer}
            me={me}
            onPressStory={openStory}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text variant="bodySmall" style={styles.emptyText}>
              还没有聊过，打个招呼吧
            </Text>
          </View>
        }
      />

      {/* 底部输入条 */}
      <View style={[styles.inputBar, { paddingBottom: insets.bottom + spacing.sm }]}>
        {/*
          表情开关。开面板前先把键盘收掉 —— 不收的话键盘和面板会叠在一起，
          输入框被顶到屏幕中间，很难看。
        */}
        <IconButton
          icon={emojiOpen ? 'keyboard-outline' : 'emoticon-outline'}
          size={22}
          onPress={() => {
            Keyboard.dismiss();
            setEmojiOpen(open => !open);
          }}
          accessibilityLabel={emojiOpen ? '收起表情' : '表情'}
          style={styles.emojiButton}
          iconColor={palette.cocoaSoft}
        />

        <TextInput
          mode="outlined"
          dense
          label="发消息"
          value={draft}
          onChangeText={setDraft}
          maxLength={CHAT_MESSAGE_MAX}
          disabled={sending || !signedIn}
          style={styles.input}
          theme={inputTheme}
          onSubmitEditing={() => void handleSend()}
          blurOnSubmit={false}
        />
        {/*
          发送用**图标按钮**，不用文字按钮：输入条本来就窄，
          「发送」两个字占宽度还压低了输入框；纸飞机这个图标所有人都认识。
        */}
        <IconButton
          icon="send"
          mode="contained"
          size={20}
          onPress={handleSend}
          disabled={sending || !draft.trim()}
          accessibilityLabel="发送"
          style={styles.sendButton}
          containerColor={palette.peach}
          iconColor="#FFFFFF"
        />
      </View>

      {/* 表情面板 */}
      <EmojiPanel visible={emojiOpen} onDismiss={() => setEmojiOpen(false)} onPick={handlePickEmoji} />

      {/* 右上角「更多」 */}
      <BottomSheet
        visible={menuOpen}
        title="更多操作"
        onDismiss={() => setMenuOpen(false)}
        heightRatio={0.3}
      >
        <List.Item
          title="查看 TA 的资料"
          onPress={() => {
            setMenuOpen(false);
            openProfile();
          }}
          left={props => <List.Icon {...props} icon="account-outline" />}
        />
        <List.Item
          title="清空聊天记录"
          titleStyle={styles.dangerText}
          onPress={() => void handleClear()}
          left={props => <List.Icon {...props} icon="trash-can-outline" color={palette.danger} />}
        />
      </BottomSheet>
    </View>
  );
}



interface MessageRowProps {
  message: ChatMessage;
  showTime: boolean;
  mine: boolean;
  peer: AuthUser | null;
  me: AuthUser | null;
  onPressStory(storyId: string): void;
}

function MessageRow({ message, showTime, mine, peer, me, onPressStory }: MessageRowProps) {

  const story = parseStoryMessage(message);

  return (
    <View>
      {showTime ? (
        <Text variant="bodySmall" style={styles.timeDivider}>
          {formatMessageTime(message.createTime)}
        </Text>
      ) : null}

      <View style={[styles.messageLine, mine && styles.messageLineMine]}>
        {!mine && peer ? <UserAvatar user={peer} size={32} /> : null}

        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
          {story ? (
            <Pressable onPress={() => onPressStory(story.storyId)} style={styles.storyCard}>
              <Text style={styles.storyIcon}>{story.icon}</Text>
              <View style={styles.storyBody}>
                <Text variant="bodyMedium" style={styles.storyTitle} numberOfLines={1}>
                  {story.title}
                </Text>
                <Text variant="bodySmall" style={styles.storyHint}>
                  分享了一个故事 · 点击查看
                </Text>
              </View>
            </Pressable>
          ) : (
            <Text variant="bodyMedium" style={mine ? styles.textMine : styles.textTheirs}>
              {message.content}
            </Text>
          )}
        </View>

        {mine ? <UserAvatar user={me} size={32} /> : null}
      </View>

      {/* 自己发的显示送达状态。只在最后一条下面显示更清爽，但那样要传更多上下文，
          这里每条都标 —— 简单且不会误读 */}
      {mine ? (
        <Text variant="bodySmall" style={[styles.status, message.isRead && styles.statusRead]}>
          {message.isRead ? '已读' : '已发送'}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  list: {
    paddingHorizontal: spacing.lg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  noticeTitle: {
    color: palette.cocoa,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  noticeDesc: {
    color: palette.cocoaFaint,
    textAlign: 'center',
  },
  noticeButton: {
    marginTop: spacing.md,
    borderRadius: radius.md,
  },
  noticeButtonInner: {
    height: 44,
    paddingHorizontal: spacing.lg,
  },


  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerText: {
    flex: 1,
    gap: 1,
  },
  headerName: {
    color: palette.cocoa,
    fontWeight: '700',
  },
  onlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: palette.online,
  },
  onlineText: {
    color: palette.online,
  },
  connectionText: {
    color: palette.cocoaFaint,
  },


  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyText: {
    color: palette.cocoaFaint,
  },
  timeDivider: {
    alignSelf: 'center',
    color: palette.cocoaFaint,
    marginVertical: spacing.md,
  },
  messageLine: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    marginVertical: spacing.xs,
  },
  messageLineMine: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '76%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
  },
  bubbleTheirs: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: palette.peachLine20,
  },
  bubbleMine: {
    backgroundColor: palette.peach,
  },
  textTheirs: {
    color: palette.cocoaSoft,
  },
  textMine: {
    color: '#FFFFFF',
  },
  status: {
    alignSelf: 'flex-end',
    color: palette.mauveLight,
    marginRight: 4,
    marginTop: 1,
  },
  statusRead: {
    color: palette.peachDeep,
  },


  storyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 180,
  },
  storyIcon: {
    fontSize: 28,
  },
  storyBody: {
    flex: 1,
    gap: 2,
  },
  storyTitle: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  storyHint: {
    color: 'rgba(255,255,255,0.85)',
  },


  inputBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.peachLine20,
  },
  input: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  sendButton: {

    margin: 0,
    borderRadius: 20,
  },
  emojiButton: {

    margin: 0,
  },
  dangerText: {
    color: palette.danger,
  },
});

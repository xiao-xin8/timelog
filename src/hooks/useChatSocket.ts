import { useEffect, useRef, useState } from 'react';

import { getAccessToken } from '../services/api';
import { chatSocketUrl } from '../services/chat';
import type { ChatMessage } from '../types/chat';



/** 多久发一次心跳 */
const PING_INTERVAL = 20_000;
/** 发完 ping 等多久没等到 pong 就认为断了 */
const PONG_TIMEOUT = 10_000;
/** 重连退避的起点与上限 */
const RECONNECT_BASE = 2_000;
const RECONNECT_MAX = 30_000;

/** 服务端推过来的消息 */
export type ChatPush =
  | { type: 'message'; message: ChatMessage }
  | { type: 'read'; by: string }
  | { type: 'cleared'; by: string }
  /**
   * 某人上下线了。
   *
   * 服务端**推给所有在线的人**（它不维护"谁关心谁"的关系），
   * 客户端收到不是自己会话对象的那条直接忽略。
   */
  | { type: 'presence'; userId: string; online: boolean }
  | { type: 'pong' };

interface Options {
  /** 登录了才连（没登录连上去也是 401，纯浪费） */
  enabled: boolean;
  onPush(push: ChatPush): void;
}

export function useChatSocket({ enabled, onPush }: Options): { connected: boolean } {
  const [connected, setConnected] = useState(false);

  const pushRef = useRef(onPush);

  pushRef.current = onPush;

  useEffect(() => {
    if (!enabled) return;

    let socket: WebSocket | null = null;
    /** 页面卸载了，别再重连 */
    let disposed = false;
    let attempt = 0;

    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let pongTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const clearTimers = () => {
      if (pingTimer) clearInterval(pingTimer);
      if (pongTimer) clearTimeout(pongTimer);
      if (retryTimer) clearTimeout(retryTimer);
      pingTimer = null;
      pongTimer = null;
      retryTimer = null;
    };

    const startHeartbeat = () => {
      pingTimer = setInterval(() => {
        if (!socket) return;

        try {
          socket.send('ping');
        } catch {
          // 发不出去说明连接已经坏了，下面的 pongTimer 会兜住
        }


        if (pongTimer) clearTimeout(pongTimer);
        pongTimer = setTimeout(() => {
          try {
            socket?.close();
          } catch {
            // 已经关了就算了
          }
        }, PONG_TIMEOUT);
      }, PING_INTERVAL);
    };

    const handlePush = (raw: unknown) => {
      if (typeof raw !== 'string') return;

      let parsed: ChatPush;
      try {
        parsed = JSON.parse(raw) as ChatPush;
      } catch {

        return;
      }

      if (parsed.type === 'pong') {
        if (pongTimer) clearTimeout(pongTimer);
        pongTimer = null;
        return;
      }

      pushRef.current(parsed);
    };

    const scheduleReconnect = () => {
      if (disposed) return;

      const delay = Math.min(RECONNECT_BASE * 2 ** attempt, RECONNECT_MAX);
      attempt += 1;
      retryTimer = setTimeout(connect, delay);
    };

    const connect = () => {
      if (disposed) return;

      const token = getAccessToken();


      if (!token) return;

      socket = new WebSocket(chatSocketUrl(token));

      socket.onopen = () => {
        attempt = 0;
        setConnected(true);
        startHeartbeat();
      };

      socket.onmessage = event => handlePush(event.data);

      socket.onclose = () => {
        setConnected(false);
        clearTimers();
        scheduleReconnect();
      };


      socket.onerror = () => undefined;
    };

    connect();

    return () => {
      disposed = true;
      clearTimers();

      try {
        socket?.close();
      } catch {
        // 已经关了
      }
      socket = null;
      setConnected(false);
    };
  }, [enabled]);

  return { connected };
}

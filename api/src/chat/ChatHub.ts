/**
 * 聊天实时通道（Durable Object）
 *
 * ## 它做什么
 *
 * 维护一张「userId → 该用户的所有连接」的在线表，然后：
 *   - 客户端连上来 → 登记
 *   - 收到内部广播请求 → 把消息推给相关的那几个在线用户
 *   - 连接断开 → 注销
 *
 * ## 它**不**做什么
 *
 * **不存任何消息**。消息由 `routes/chat.ts` 写进 D1，写成功之后才让这里广播。
 * 所以这里挂掉最多是「这条消息没实时推出去」，对方下次进聊天室照样能从 D1 拉到，
 * **不会丢消息**。
 *
 * 参考实现来自 `xin--blog-chat-worker`（房间制 + 消息存 DO 的 SQLite）。
 * 我们没照搬那部分：会话列表要「每个会话的最后一条 + 未读数」，
 * 那是 SQL 聚合的活，消息存在 DO 里就得跨 N 个 DO 去取。
 *
 * ## 为什么用 Hibernation
 *
 * 用 `state.acceptWebSocket()` 而不是自己 `addEventListener` —— 空闲时 DO 会被
 * 回收（不占内存、不计费），有消息再唤醒。代价是**不能用实例字段持久保存状态**：
 * 唤醒走的是「重新 new 一个实例」，字段全归初始值，而连接其实还在。
 * 所以身份必须序列化进 attachment，构造函数里再从 `getWebSockets()` 重建在线表。
 */

/** 握手时写进 attachment 的身份，DO 被回收再唤醒时靠它恢复 */
interface SessionMeta {
  userId: string;
}

/** 内部广播请求体（只有我们自己的 Worker 会发） */
interface BroadcastPayload {
  /** 推给这几个用户（不在线的会被跳过） */
  userIds: string[];
  /** 推过去的内容，会被序列化成 JSON */
  message: unknown;
}

/** 心跳：客户端定期发，服务端回。用来判断连接是不是还活着 */
const PING = 'ping';
const PONG = JSON.stringify({ type: 'pong' });

export class ChatHub {
  private readonly state: DurableObjectState;

  /** userId → 该用户的所有连接（同一个人可能多端登录） */
  private readonly peers = new Map<string, Set<WebSocket>>();

  constructor(state: DurableObjectState) {
    this.state = state;


    for (const socket of this.state.getWebSockets()) {
      const meta = socket.deserializeAttachment() as SessionMeta | null;

      if (meta?.userId) this.add(meta.userId, socket, true);
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);


    if (url.pathname === '/broadcast') {
      return await this.handleBroadcast(request);
    }


    if (url.pathname === '/online') {
      return await this.handleOnline(request);
    }


    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }


    const userId = request.headers.get('x-user-id');
    if (!userId) return new Response('missing identity', { status: 401 });

    const pair = new WebSocketPair();
    const socket = pair[1];

    this.state.acceptWebSocket(socket);

    socket.serializeAttachment({ userId } satisfies SessionMeta);
    this.add(userId, socket);

    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  private async handleBroadcast(request: Request): Promise<Response> {
    let payload: BroadcastPayload;
    try {
      payload = (await request.json()) as BroadcastPayload;
    } catch {
      return Response.json({ error: '广播内容不是合法 JSON' }, { status: 400 });
    }

    const text = JSON.stringify(payload.message);
    let delivered = 0;

    for (const userId of payload.userIds) {
      const sockets = this.peers.get(userId);
      if (!sockets) continue;

      for (const socket of sockets) {
        try {
          socket.send(text);
          delivered += 1;
        } catch {
          // 连接已经坏了。这里不处理，交给 webSocketClose 收拾
        }
      }
    }


    return Response.json({ delivered });
  }

  /**
   * 查这几个人在不在线。
   *
   * 客户端**进聊天室时问一次** —— 因为 `presence` 推送只在状态**变化**时才发，
   * 对方可能在你打开之前就一直在线上，不会有"变化"推给你。
   */
  private async handleOnline(request: Request): Promise<Response> {
    let payload: { userIds?: string[] };
    try {
      payload = (await request.json()) as { userIds?: string[] };
    } catch {
      return Response.json({ online: [] });
    }

    const online = (payload.userIds ?? []).filter(id => this.peers.has(id));
    return Response.json({ online });
  }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string') return;


    if (raw === PING) {
      try {
        socket.send(PONG);
      } catch {
        // 真断了会在 webSocketClose 里清理，这里不用管
      }
    }
  }

  async webSocketClose(socket: WebSocket): Promise<void> {
    this.forget(socket);
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    this.forget(socket);
  }



  /**
   * @param silent 唤醒重建时为 `true` —— 那些人本来就一直挂着，别再广播一次"上线"
   */
  private add(userId: string, socket: WebSocket, silent = false): void {
    let sockets = this.peers.get(userId);
    if (!sockets) {
      sockets = new Set();
      this.peers.set(userId, sockets);

      if (!silent) this.announcePresence(userId, true);
    }
    sockets.add(socket);
  }

  private forget(socket: WebSocket): void {
    const meta = socket.deserializeAttachment() as SessionMeta | null;
    if (!meta?.userId) return;

    const sockets = this.peers.get(meta.userId);
    if (!sockets) return;

    sockets.delete(socket);

    if (sockets.size === 0) {
      this.peers.delete(meta.userId);
      this.announcePresence(meta.userId, false);
    }
  }

  /**
   * 广播某人的上下线。
   *
   * 推给**所有**在线的人，不做"谁关心谁"的过滤 —— 个人 App 的在线数很少，
   * 客户端收到不是自己会话对象的那条直接忽略就行。要在服务端过滤，就得
   * 维护一张「谁正在和谁聊天」的关系表，代价大得多，收益几乎为零。
   */
  private announcePresence(userId: string, online: boolean): void {
    const text = JSON.stringify({ type: 'presence', userId, online });

    for (const [id, sockets] of this.peers) {

      if (id === userId) continue;

      for (const socket of sockets) {
        try {
          socket.send(text);
        } catch {
          // 坏连接交给 webSocketClose 收拾
        }
      }
    }
  }
}

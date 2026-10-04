import { useEffect, useState } from 'react';

/**
 * 全局共享的「每秒一跳」
 *
 * 首页每张卡片都要刷新倒计时，但**不能每张卡片各开一个 `setInterval`**——
 * 那样 20 个事件就是 20 个定时器，各自独立触发重渲染，非常浪费。
 *
 * 这里用模块级单例：所有订阅者共用同一个定时器，没人订阅时自动停掉。
 * 旧版是在页面的 `onHide` / `onUnload` 里手动清理，新版把它藏进 hook，用的人不用管。
 */

let intervalId: ReturnType<typeof setInterval> | null = null;
let currentTick = 0;
const listeners = new Set<(tick: number) => void>();

/** 启动定时器（若已在运行则复用） */
function startTimer(intervalMs: number) {
  if (intervalId !== null) return;
  intervalId = setInterval(() => {
    currentTick += 1;
    listeners.forEach(listener => listener(currentTick));
  }, intervalMs);
}

/** 没有订阅者了就停掉，别让它在后台空转 */
function stopTimerIfIdle() {
  if (listeners.size === 0 && intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

/**
 * 返回一个每秒 +1 的计数，用它驱动倒计时重算。
 *
 * 用法：
 *   const tick = useTick();          // 每秒变一次
 *   const countdown = useMemo(() => calcCountdown(...), [tick, ...]);
 */
export function useTick(intervalMs = 1000): number {
  const [tick, setTick] = useState(currentTick);

  useEffect(() => {
    const listener = (next: number) => setTick(next);
    listeners.add(listener);
    startTimer(intervalMs);

    return () => {
      listeners.delete(listener);
      stopTimerIfIdle();
    };
  }, [intervalMs]);

  return tick;
}

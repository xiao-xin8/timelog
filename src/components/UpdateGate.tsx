import React, { useEffect } from 'react';

import { UPDATE_CHECK_DELAY_MS } from '../constants/update';
import { useUpdateStore } from '../store/useUpdateStore';
import UpdateDialog from './UpdateDialog';

/**
 * 更新检查的挂载点（Slice 17）
 *
 * 放在 App 最外层（PaperProvider 里面）挂一次，干两件事：
 *   1. 启动后**延迟几秒**检查一次更新 —— 不要挡启动、不要和首屏请求抢带宽
 *   2. 把更新弹窗渲染出来
 *
 * ⚠️ 顺序不能反：**先读"不再提示"的记录再检查**。否则用户上次刚点了
 * 「不再提示」，这次启动又会弹一遍 —— 而存储读起来只要几毫秒，
 * 那几秒的延迟足够覆盖它。
 *
 * 也**不做轮询、不做切前后台检查**（和项目"数据上下行只由用户操作驱动"的原则一致）。
 */
export default function UpdateGate() {
  const load = useUpdateStore(state => state.load);
  const check = useUpdateStore(state => state.check);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      await load();
      await new Promise(resolve => setTimeout(resolve, UPDATE_CHECK_DELAY_MS));

      if (!cancelled) await check();
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [load, check]);

  return <UpdateDialog />;
}

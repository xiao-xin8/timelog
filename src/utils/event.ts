import { REMARK_MAX_LENGTH } from '../constants';



/**
 * 拼装目标时间字符串。
 *
 * 规则照搬旧项目：**关闭「精准时间」时，时分固定为 00:00**，
 * 即使表单里还留着一个时间值也不采用。
 *
 * 注意这里**不带时区后缀**，交给 `new Date()` 按本机时区解析，
 * 与旧项目写入本地存储的格式一致（否则读旧数据会偏几个小时）。
 */
export function buildTargetDateTime(
  date: string,
  time: string,
  showPreciseTime: boolean,
): string {
  const finalTime = showPreciseTime ? time : '00:00';
  return `${date}T${finalTime}:00`;
}

/** 表单校验结果：通过返回 null，不通过返回要给用户看的原因 */
export function validateEventDraft(draft: {
  title: string;
  date: string;
}): string | null {
  if (!draft.title.trim()) return '请填写事件名称';
  if (!draft.date) return '请选择目标日期';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) return '日期格式不正确';
  return null;
}

/** 备注按上限截断（输入时就用它，避免用户敲到 201 个字才发现） */
export function clampRemark(text: string): string {
  return text.slice(0, REMARK_MAX_LENGTH);
}

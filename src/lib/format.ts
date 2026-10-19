export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtTimeFull(t: number): string {
  return new Date(t).toLocaleString('zh-CN', { hour12: false });
}

export function progressPercent(doneUnits: number, totalUnits: number): number {
  if (totalUnits <= 0) return 0;
  return Math.min(100, Math.round((doneUnits / totalUnits) * 100));
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** 列表用时间戳：同一天只显示 HH:MM，跨天补 M-D 前缀。today 便于测试注入。 */
export function fmtLogTime(t: number, now: number = Date.now()): string {
  const d = new Date(t);
  const n = new Date(now);
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const sameDay = d.getFullYear() === n.getFullYear()
    && d.getMonth() === n.getMonth()
    && d.getDate() === n.getDate();
  return sameDay ? hm : `${d.getMonth() + 1}-${d.getDate()} ${hm}`;
}

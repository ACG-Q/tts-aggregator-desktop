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

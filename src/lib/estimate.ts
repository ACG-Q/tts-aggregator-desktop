export const CHARS_PER_SECOND = 4.2;
export const LONG_TEXT_HINT = 8000;

export function estimateReadingSeconds(chars: number): number {
  if (!Number.isFinite(chars) || chars <= 0) return 0;
  return Math.ceil(chars / CHARS_PER_SECOND);
}

export function fmtReadingDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest > 0 ? `${m} 分 ${rest} 秒` : `${m} 分钟`;
}

import { describe, expect, it } from 'vitest';
import { fmtClock, fmtLogTime, fmtTimeFull, progressPercent } from './format';

describe('fmtClock', () => {
  it('补零分秒', () => {
    expect(fmtClock(0)).toBe('00:00');
    expect(fmtClock(9)).toBe('00:09');
    expect(fmtClock(65)).toBe('01:05');
    expect(fmtClock(600)).toBe('10:00');
    expect(fmtClock(-3)).toBe('00:00');
  });
});

describe('progressPercent', () => {
  it('已播完单元数 / 总单元数 四舍五入', () => {
    expect(progressPercent(0, 10)).toBe(0);
    expect(progressPercent(5, 10)).toBe(50);
    expect(progressPercent(9, 10)).toBe(90);
    expect(progressPercent(10, 10)).toBe(100);
    expect(progressPercent(3, 0)).toBe(0);
    expect(progressPercent(99, 10)).toBe(100);
  });
});

describe('fmtTimeFull', () => {
  it('跨天完整时间（含日期与时间）', () => {
    const s = fmtTimeFull(Date.UTC(2026, 0, 2, 3, 4, 5));
    expect(s).toMatch(/\d{4}/);
    expect(s).toContain(':');
  });
});

describe('fmtLogTime', () => {
  const now = new Date(2026, 9, 16, 15, 0, 0).getTime();

  it('同一天只显示时分', () => {
    const t = new Date(2026, 9, 16, 9, 5, 0).getTime();
    expect(fmtLogTime(t, now)).toBe('09:05');
  });

  it('跨天补「月-日 时:分」', () => {
    const t = new Date(2026, 8, 30, 23, 59, 0).getTime();
    expect(fmtLogTime(t, now)).toBe('9-30 23:59');
  });

  it('跨年也能区分', () => {
    const t = new Date(2025, 11, 31, 1, 2, 0).getTime();
    expect(fmtLogTime(t, now)).toBe('12-31 01:02');
  });
});

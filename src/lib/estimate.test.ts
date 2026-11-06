import { describe, expect, it } from 'vitest';
import { estimateReadingSeconds, fmtReadingDuration, LONG_TEXT_HINT } from './estimate';

describe('estimateReadingSeconds', () => {
  it('按 4.2 字/秒向上取整', () => {
    expect(estimateReadingSeconds(0)).toBe(0);
    expect(estimateReadingSeconds(42)).toBe(10);
    expect(estimateReadingSeconds(43)).toBe(11);
  });
});

describe('fmtReadingDuration', () => {
  it('分秒格式', () => {
    expect(fmtReadingDuration(0)).toBe('0 秒');
    expect(fmtReadingDuration(59)).toBe('59 秒');
    expect(fmtReadingDuration(60)).toBe('1 分钟');
    expect(fmtReadingDuration(294)).toBe('4 分 54 秒');
  });
});

it('长文阈值与 Android 一致', () => {
  expect(LONG_TEXT_HINT).toBe(8000);
});

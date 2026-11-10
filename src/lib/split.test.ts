import { describe, expect, it } from 'vitest';
import { splitForReading } from './split';

describe('splitForReading', () => {
  it('按空行/换行分段，保序去空', () => {
    expect(splitForReading('第一段。\n\n第二段。\n第三段。'))
      .toEqual(['第一段。', '第二段。', '第三段。']);
  });

  it('超长无标点段硬切，段长不超过 800', () => {
    const text = 'あ'.repeat(1850);
    const segs = splitForReading(text, 800);
    expect(segs.length).toBe(3);
    for (const s of segs) expect(s.length).toBeLessThanOrEqual(800);
    expect(segs.join('')).toBe(text);
  });

  it('超长段在句号处切分', () => {
    const sentence = '这是一句话。';
    const text = sentence.repeat(200); // 2400 字
    const segs = splitForReading(text, 800);
    expect(segs.length).toBeGreaterThanOrEqual(3);
    for (const s of segs) expect(s.endsWith('。') || s.length <= 800).toBe(true);
    expect(segs.join('')).toBe(text);
  });

  it('CRLF 归一化与空输入', () => {
    expect(splitForReading('a\r\nb')).toEqual(['a', 'b']);
    expect(splitForReading('   ')).toEqual([]);
  });

  it('默认段长不超过 150', () => {
    const text = 'あ'.repeat(400);
    const segs = splitForReading(text);
    expect(segs.length).toBeGreaterThan(1);
    for (const s of segs) expect(s.length).toBeLessThanOrEqual(150);
    expect(segs.join('')).toBe(text);
  });

  it('默认按句号切分且不超长', () => {
    const text = '这是一句测试文本。'.repeat(40);
    const segs = splitForReading(text);
    for (const s of segs) expect(s.length).toBeLessThanOrEqual(150);
    expect(segs.join('')).toBe(text);
  });
});

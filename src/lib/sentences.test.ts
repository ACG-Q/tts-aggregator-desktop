import { describe, expect, it } from 'vitest';
import { sentenceIndexAt, splitSentences } from './sentences';

describe('splitSentences', () => {
  it('按中英文标点与换行切分并保留区间', () => {
    const text = '第一句。第二句！第三句?\n第四句;';
    expect(splitSentences(text).map((s) => s.text))
      .toEqual(['第一句。', '第二句！', '第三句?\n', '第四句;']);
    expect(splitSentences(text)[0]).toEqual({ text: '第一句。', start: 0, end: 4 });
    expect(splitSentences(text)[3]).toEqual({ text: '第四句;', start: 13, end: 17 });
  });

  it('无标点文本返回单句', () => {
    expect(splitSentences('没有标点')).toEqual([{ text: '没有标点', start: 0, end: 4 }]);
  });

  it('空白文本返回空数组', () => {
    expect(splitSentences('   \n\n')).toEqual([]);
  });
});

describe('sentenceIndexAt', () => {
  const sentences = splitSentences('一。二。三。');

  it('边界与中间比例', () => {
    expect(sentenceIndexAt(0, sentences)).toBe(0);
    expect(sentenceIndexAt(0.34, sentences)).toBe(1);
    expect(sentenceIndexAt(0.67, sentences)).toBe(2);
    expect(sentenceIndexAt(1, sentences)).toBe(2);
  });

  it('空数组返回 -1，越界比例钳制', () => {
    expect(sentenceIndexAt(0.5, [])).toBe(-1);
    expect(sentenceIndexAt(-1, sentences)).toBe(0);
    expect(sentenceIndexAt(2, sentences)).toBe(2);
  });
});

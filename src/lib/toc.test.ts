import { describe, expect, it } from 'vitest';
import { parseCnNum, parseToc } from './toc';

describe('parseCnNum', () => {
  it('阿拉伯数字与常用中文数字', () => {
    expect(parseCnNum('12')).toBe(12);
    expect(parseCnNum('三')).toBe(3);
    expect(parseCnNum('十')).toBe(10);
    expect(parseCnNum('十二')).toBe(12);
    expect(parseCnNum('二十五')).toBe(25);
    expect(parseCnNum('一百零八')).toBe(108);
    expect(parseCnNum('二千零二十四')).toBe(2024);
    expect(parseCnNum('三万五千')).toBe(35000);
  });
});

describe('parseToc', () => {
  const book = [
    '第一章 初见',
    '林凡走出车站。',
    '第二章 重逢',
    '老友相视一笑。',
    '第二卷 风云',
    '第三章 风起',
    '山雨欲来。',
    '第X章 尾声',
    '终。',
  ].join('\n');

  it('章节切分与内容归属', () => {
    const units = parseToc(book);
    expect(units.map((u) => u.title)).toEqual(['第一章 初见', '第二章 重逢', '第三章 风起', '第X章 尾声']);
    expect(units[0].content).toContain('林凡');
    expect(units[0].content).not.toContain('重逢');
  });

  it('卷标题只影响其后章节的 volume 归属', () => {
    const units = parseToc(book);
    expect(units.map((u) => u.volume)).toEqual(['', '', '第二卷 风云', '第二卷 风云']);
  });

  it('无足够章节标题时整体作为全文单章', () => {
    const units = parseToc('你好。\n世界。');
    expect(units).toEqual([{ volume: '', title: '全文', content: '你好。\n世界。' }]);
  });

  it('支持 1、 与 1. 编号行', () => {
    const units = parseToc('1、开始\n甲\n2. 继续\n乙');
    expect(units.map((u) => u.title)).toEqual(['1、开始', '2. 继续']);
  });

  it('空文本返回空数组', () => {
    expect(parseToc('   \n\n  ')).toEqual([]);
  });
});

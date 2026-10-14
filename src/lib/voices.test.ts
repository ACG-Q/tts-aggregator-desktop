import { describe, expect, it } from 'vitest';
import { parseVoices, voiceDisplayName } from './voices';

describe('voiceDisplayName（安卓 Voice.displayName 移植）', () => {
  it('英文名+系列词 → 全中文', () => {
    expect(voiceDisplayName({ id: 'x', name: 'Xiaoxiao Dragon HD Flash Latest', localName: '' }))
      .toBe('晓晓 龙 高清 闪速 最新版');
  });

  it('local_name 优先直接显示', () => {
    expect(voiceDisplayName({ id: 'x', name: 'Xiaoxiao', localName: '晓晓' })).toBe('晓晓');
  });

  it('非中文音色保留原文', () => {
    expect(voiceDisplayName({ id: 'x', name: 'Jenny', localName: '' })).toBe('Jenny');
  });

  it('空名回退 id', () => {
    expect(voiceDisplayName({ id: 'zh-CN-XiaoxiaoNeural', name: '', localName: '' }))
      .toBe('zh-CN-XiaoxiaoNeural');
  });
});

describe('parseVoices', () => {
  it('容错解析：缺字段跳过、字段缺省补齐', () => {
    const list = parseVoices([
      { short_name: 'a', display_name: 'A' },
      { display_name: 'no-id' },
      'not-an-object',
      { short_name: 'b', style_list: ['calm'] },
    ]);
    expect(list.length).toBe(2);
    expect(list[0]).toMatchObject({ id: 'a', name: 'A', localName: '', styles: null });
    expect(list[1]).toMatchObject({ id: 'b', styles: ['calm'] });
  });

  it('非数组输入返回空', () => {
    expect(parseVoices({ error: true })).toEqual([]);
  });
});

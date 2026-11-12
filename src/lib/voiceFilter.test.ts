import { describe, expect, it } from 'vitest';
import type { Voice } from '../types/models';
import {
  filterVoices, groupByLanguage, languageBucket, pushRecentVoice, readRecentVoices,
  sortVoicesByLanguage,
} from './voiceFilter';

function voice(
  id: string, name: string, locale: string, gender = 'Female',
  styles: string[] | null = null, extra: Partial<Voice> = {},
): Voice {
  return { id, name, localName: '', gender, locale, styles, ...extra };
}

const VOICES: Voice[] = [
  voice('zh-CN-XiaoxiaoNeural', 'Xiaoxiao', 'zh-CN', 'Female', ['cheerful', 'sad']),
  voice('zh-CN-YunxiNeural', 'Yunxi', 'zh-CN', 'Male'),
  voice('en-US-AriaNeural', 'Aria', 'en-US'),
  voice('ja-JP-NanamiNeural', 'Nanami', 'ja-JP'),
  voice('de-DE-KatjaNeural', 'Katja', 'de-DE'),
];

describe('languageBucket', () => {
  it('按 locale 前缀归类', () => {
    expect(languageBucket('zh-CN')).toBe('zh');
    expect(languageBucket('en-US')).toBe('en');
    expect(languageBucket('ja-JP')).toBe('ja');
    expect(languageBucket('ko-KR')).toBe('ko');
    expect(languageBucket('de-DE')).toBe('other');
  });
});

describe('filterVoices', () => {
  it('按名称或 ID 搜索，忽略大小写', () => {
    expect(filterVoices(VOICES, { query: 'aria', language: 'all', gender: '' })).toHaveLength(1);
    expect(filterVoices(VOICES, { query: 'YUNXI', language: 'all', gender: '' })).toHaveLength(1);
  });

  it('语言与性别组合筛选', () => {
    expect(filterVoices(VOICES, { query: '', language: 'zh', gender: 'Female' })[0].id)
      .toBe('zh-CN-XiaoxiaoNeural');
    expect(filterVoices(VOICES, { query: '', language: 'other', gender: '' })[0].id)
      .toBe('de-DE-KatjaNeural');
  });

  it('搜索命中中文名与简介', () => {
    const list = [
      voice('zh-CN-XiaoxiaoNeural', 'Xiaoxiao', 'zh-CN', 'Female', null, { nameZh: '晓晓', introZh: '普通话女声' }),
      voice('zh-CN-YunxiNeural', 'Yunxi', 'zh-CN', 'Male'),
    ];
    expect(filterVoices(list, { query: '晓晓', language: 'all', gender: '' })).toHaveLength(1);
    expect(filterVoices(list, { query: '普通话', language: 'all', gender: '' })).toHaveLength(1);
  });
});

describe('sortVoicesByLanguage', () => {
  it('中文排在最前，其余按语言优先级', () => {
    const sorted = sortVoicesByLanguage([...VOICES].reverse());
    expect(sorted[0].locale.startsWith('zh')).toBe(true);
    expect(sorted.map((v) => languageBucket(v.locale))).toEqual(['zh', 'zh', 'en', 'ja', 'other']);
  });
});

describe('groupByLanguage', () => {  it('中文优先，其余按数量降序', () => {
    const groups = groupByLanguage(VOICES);
    expect(groups[0].bucket).toBe('zh');
    expect(groups[0].voices).toHaveLength(2);
    expect(groups.map((g) => g.bucket)).toEqual(['zh', 'en', 'ja', 'other']);
  });
});

describe('recent voices', () => {
  function fakeStorage(initial: string | null = null) {
    let value = initial;
    return {
      getItem: () => value,
      setItem: (_k: string, v: string) => { value = v; },
    };
  }

  it('读取时过滤非法值并去重', () => {
    const s = fakeStorage(JSON.stringify(['a', 'a', 3, 'b']));
    expect(readRecentVoices(s)).toEqual(['a', 'b']);
  });

  it('写入后最近在前且最多 8 个', () => {
    const s = fakeStorage(JSON.stringify(['a', 'b']));
    expect(pushRecentVoice(s, 'c')).toEqual(['c', 'a', 'b']);
    const many = Array.from({ length: 10 }, (_, i) => `v${i}`);
    const s2 = fakeStorage(JSON.stringify(many));
    expect(pushRecentVoice(s2, 'x')).toHaveLength(8);
    expect(pushRecentVoice(s2, 'x')[0]).toBe('x');
  });

  it('重复写入不产生重复项', () => {
    const s = fakeStorage(JSON.stringify(['a', 'b']));
    expect(pushRecentVoice(s, 'b')).toEqual(['b', 'a']);
  });
});

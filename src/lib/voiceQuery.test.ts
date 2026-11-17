import { describe, expect, it } from 'vitest';
import type { Voice } from '../types/models';
import { loadBuiltinVoices } from './builtinVoices';
import {
  ALL_FILTER, CHINESE_FILTER, FREQUENT_FILTER,
  chipEntries, defaultFilter, filterVoices, groupVoicesByLanguage, languageOptions,
  localeLang, localeRegion, recentVoiceIds, searchVoices, variantTag, voiceLabel, voiceMeta,
  withRecent,
} from './voiceQuery';

const voice = (id: string, extra: Partial<Voice> = {}): Voice => ({
  id,
  name: id,
  localName: id,
  gender: 'Female',
  locale: id.split('-').slice(0, 2).join('-'),
  styles: null,
  ...extra,
});

describe('locale 解析', () => {
  it('拆出语言与地区', () => {
    expect(localeLang(voice('zh-CN-XiaoxiaoNeural'))).toBe('zh');
    expect(localeRegion(voice('zh-CN-XiaoxiaoNeural'))).toBe('CN');
  });

  it('跳过四字母脚本子标签', () => {
    const v = voice('iu-Cans-CA', { locale: 'iu-Cans-CA' });
    expect(localeLang(v)).toBe('iu');
    expect(localeRegion(v)).toBe('CA');
  });

  it('无地区时返回 null', () => {
    const v = voice('zh', { locale: 'zh' });
    expect(localeRegion(v)).toBeNull();
  });
});

describe('variantTag', () => {
  it('识别龙系列与多语种变体', () => {
    expect(variantTag('zh-CN-Xiaoxiao:DragonHDFlashLatestNeural')).toBe('高清闪速');
    expect(variantTag('zh-CN-Xiaoxiao:DragonHDLatestNeural')).toBe('高清');
    expect(variantTag('zh-CN-Xiaoxiao:DragonLatestNeural')).toBe('龙系列');
    expect(variantTag('zh-CN-XiaoxiaoMultilingualNeural')).toBe('多语种');
    expect(variantTag('zh-CN-XiaoxiaoDialectsNeural')).toBe('方言');
  });

  it('区分 MAI 版本', () => {
    expect(variantTag('vi-VN-Grant:MAI-Voice-2.1-Flash')).toBe('2.1 闪速');
    expect(variantTag('vi-VN-Grant:MAI-Voice-2.1')).toBe('2.1');
    expect(variantTag('vi-VN-Grant:MAI-Voice-2-Flash')).toBe('2.0 闪速');
    expect(variantTag('vi-VN-Grant:MAI-Voice-2')).toBe('2.0');
    expect(variantTag('zh-CN-XiaoxiaoNeural')).toBe('标准');
  });
});

describe('voiceLabel', () => {
  it('无重名时直接显示名字', () => {
    const a = voice('a', { nameZh: '晓晓' });
    expect(voiceLabel([a], a)).toBe('晓晓');
  });

  it('重名版本追加版本标记', () => {
    const plain = voice('zh-CN-XiaoxiaoNeural', { nameZh: '晓晓' });
    const hd = voice('zh-CN-Xiaoxiao:DragonHDFlashLatestNeural', { nameZh: '晓晓' });
    const list = [plain, hd];
    expect(voiceLabel(list, plain)).toBe('晓晓（标准）');
    expect(voiceLabel(list, hd)).toBe('晓晓（高清闪速）');
  });

  it('跨语言同名不追加语言', () => {
    const a = voice('zh-CN-Xiaoxiao:MAI-Voice-2.1', { nameZh: '晓晓', locale: 'zh-CN' });
    const b = voice('en-US-Xiaoxiao:MAI-Voice-2.1', { nameZh: '晓晓', locale: 'en-US' });
    const list = [a, b];
    expect(voiceLabel(list, a)).toBe('晓晓');
    expect(voiceLabel(list, b)).toBe('晓晓');
  });

  it('同语言、同标记仍冲突时追加地区', () => {
    const a = voice('zh-CN-Xiaoxiao:MAI-Voice-2.1', { nameZh: '晓晓', locale: 'zh-CN' });
    const b = voice('zh-TW-Xiaoxiao:MAI-Voice-2.1', { nameZh: '晓晓', locale: 'zh-TW' });
    const list = [a, b];
    expect(voiceLabel(list, a)).toBe('晓晓（2.1 · 中文 · 中国 · 简体）');
    expect(voiceLabel(list, b)).toBe('晓晓（2.1 · 中文 · 中国台湾 · 繁体）');
  });

  it('同一语言内 958 条内置音色的标签互不重复', async () => {
    const list = await loadBuiltinVoices();
    const labels = list.map((v) => `${localeLang(v)}::${voiceLabel(list, v)}`);
    expect(new Set(labels).size).toBe(list.length);
  });
});

describe('筛选与分组', () => {
  const zh = voice('zh-CN-XiaoxiaoNeural', { nameZh: '晓晓', locale: 'zh-CN' });
  const en = voice('en-US-JennyNeural', { nameZh: '珍妮', locale: 'en-US' });
  const ja = voice('ja-JP-NanamiNeural', { nameZh: '七海', locale: 'ja-JP' });

  it('有最近记录时默认常用，否则中文', () => {
    expect(defaultFilter([])).toEqual(CHINESE_FILTER);
    expect(defaultFilter([zh.id])).toEqual(FREQUENT_FILTER);
  });

  it('常用按最近顺序返回，并过滤失效 ID', () => {
    const out = filterVoices([zh, en, ja], FREQUENT_FILTER, ['missing', en.id, zh.id]);
    expect(out.map((v) => v.id)).toEqual([en.id, zh.id]);
  });

  it('中文筛选只保留中文', () => {
    expect(filterVoices([zh, en, ja], CHINESE_FILTER).map((v) => v.id)).toEqual([zh.id]);
  });

  it('语言选项中文置顶，其余按数量降序', () => {
    const out = languageOptions([zh, en, ja, voice('en-GB-RyanNeural', { locale: 'en-GB' })]);
    expect(out).toEqual([['zh', 1], ['en', 2], ['ja', 1]]);
  });

  it('chips 顺序固定：常用、全部、中文、英语', () => {
    const chips = chipEntries([['ja', 3], ['en', 2], ['zh', 1]]);
    expect(chips.map((c) => c.label)).toEqual(['常用', '全部', '中文', '英语', '日语']);
  });

  it('按语言分组中文置顶', () => {
    const groups = groupVoicesByLanguage([ja, en, zh]);
    expect(groups.map((g) => g.code)).toEqual(['zh', 'en', 'ja']);
    expect(groups[0].label).toBe('中文');
  });

  it('全部筛选返回所有音色', () => {
    expect(filterVoices([zh, en, ja], ALL_FILTER)).toHaveLength(3);
  });
});

describe('搜索', () => {
  const zh = voice('zh-CN-XiaoxiaoNeural', { nameZh: '晓晓', locale: 'zh-CN' });
  const en = voice('en-US-JennyNeural', { nameZh: '珍妮', locale: 'en-US' });

  it('支持中文名、ID 与地区', () => {
    expect(searchVoices([zh, en], '晓晓')).toEqual([zh]);
    expect(searchVoices([zh, en], 'Jenny')).toEqual([en]);
    expect(searchVoices([zh, en], '美国')).toEqual([en]);
  });

  it('空搜索原样返回', () => {
    expect(searchVoices([zh, en], '  ')).toEqual([zh, en]);
  });

  it('中文结果排在最前', () => {
    const a = voice('en-US-ZhNeural', { nameZh: 'zh 音色', locale: 'en-US' });
    expect(searchVoices([a, zh], 'zh')).toEqual([zh, a]);
  });
});

describe('最近使用', () => {
  it('过滤失效 ID、去重并限制 6 条', () => {
    const ids = Array.from({ length: 8 }, (_, i) => `v${i}`);
    const out = recentVoiceIds('v0', ['v1', 'v2', 'v0', 'missing', 'v3', 'v4', 'v5', 'v6'], new Set(ids));
    expect(out).toEqual(['v0', 'v1', 'v2', 'v3', 'v4', 'v5']);
  });

  it('没有历史记录时返回空列表', () => {
    expect(recentVoiceIds('v0', [], new Set(['v0']))).toEqual([]);
  });

  it('withRecent 最新在前并截断', () => {
    expect(withRecent(['a', 'b'], 'b')).toEqual(['b', 'a']);
    expect(withRecent(Array.from({ length: 6 }, (_, i) => `v${i}`), 'new')).toHaveLength(6);
  });
});

describe('voiceMeta', () => {
  it('拼出语言、地区、性别与风格数', () => {
    const v = voice('zh-CN-XiaoxiaoNeural', {
      locale: 'zh-CN', gender: 'Female', styles: ['calm', 'gentle'],
    });
    expect(voiceMeta(v)).toBe('中文 · 中国 · 简体 · 女声 · 2 种风格');
  });
});

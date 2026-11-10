import { describe, expect, it } from 'vitest';
import { DEFAULT_APP_PREFS, DEFAULT_SYNTH, normalizeAppPrefs, normalizeSynth } from './models';

describe('normalizeAppPrefs', () => {
  it('合法 palette 保留', () => {
    expect(normalizeAppPrefs({ palette: 'celadon' }).palette).toBe('celadon');
    expect(normalizeAppPrefs({ palette: 'walnut' }).palette).toBe('walnut');
  });

  it('缺失或非法 palette 回退墨绿', () => {
    expect(normalizeAppPrefs({}).palette).toBe('ink');
    expect(normalizeAppPrefs({ palette: 'blue' }).palette).toBe('ink');
    expect(normalizeAppPrefs(null).palette).toBe(DEFAULT_APP_PREFS.palette);
  });
});

describe('normalizeSynth', () => {
  it('style 合法字符串保留', () => {
    expect(normalizeSynth({ style: 'cheerful' }).style).toBe('cheerful');
  });

  it('style 缺失或非法回退空串', () => {
    expect(normalizeSynth({}).style).toBe('');
    expect(normalizeSynth({ style: 42 }).style).toBe('');
    expect(normalizeSynth(null)).toEqual(DEFAULT_SYNTH);
  });
});

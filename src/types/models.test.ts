import { describe, expect, it } from 'vitest';
import { DEFAULT_APP_PREFS, normalizeAppPrefs } from './models';

describe('normalizeAppPrefs', () => {
  it('空值与非法输入回落默认', () => {
    expect(normalizeAppPrefs(null)).toEqual(DEFAULT_APP_PREFS);
    expect(normalizeAppPrefs('nope')).toEqual(DEFAULT_APP_PREFS);
    expect(normalizeAppPrefs({ probeConcurrency: 99, theme: 'neon', playbackRate: 10, volume: -5 }))
      .toEqual(DEFAULT_APP_PREFS);
  });

  it('旧版仅 probeConcurrency 的配置补齐新字段', () => {
    expect(normalizeAppPrefs({ probeConcurrency: 2 })).toEqual({
      probeConcurrency: 2, theme: 'system', playbackRate: 1, volume: 100,
    });
  });

  it('合法值原样保留', () => {
    expect(normalizeAppPrefs({ probeConcurrency: 8, theme: 'dark', playbackRate: 1.5, volume: 30 }))
      .toEqual({ probeConcurrency: 8, theme: 'dark', playbackRate: 1.5, volume: 30 });
  });
});

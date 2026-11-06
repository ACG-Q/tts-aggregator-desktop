import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APP_PREFS, normalizeAppPrefs, normalizeSynth,
} from './models';

describe('normalizeAppPrefs', () => {
  it('空值与非法输入回落默认', () => {
    expect(normalizeAppPrefs(null)).toEqual(DEFAULT_APP_PREFS);
    expect(normalizeAppPrefs('nope')).toEqual(DEFAULT_APP_PREFS);
    expect(normalizeAppPrefs({
      probeConcurrency: 99, theme: 'neon', playbackRate: 10, volume: -5,
      failThreshold: 4, cooldownMinutes: 7, autoTestOnLaunch: 'yes',
      sleepMinutes: 45, resumeLast: 'no',
    })).toEqual(DEFAULT_APP_PREFS);
  });

  it('旧版配置补齐新字段', () => {
    expect(normalizeAppPrefs({ probeConcurrency: 2 })).toEqual({
      ...DEFAULT_APP_PREFS,
      probeConcurrency: 2,
    });
  });

  it('合法值原样保留', () => {
    expect(normalizeAppPrefs({
      probeConcurrency: 8, theme: 'dark', playbackRate: 1.5, volume: 30,
      failThreshold: 5, cooldownMinutes: 30, autoTestOnLaunch: true,
      sleepMinutes: 15, resumeLast: false,
    })).toEqual({
      probeConcurrency: 8, theme: 'dark', playbackRate: 1.5, volume: 30,
      failThreshold: 5, cooldownMinutes: 30, autoTestOnLaunch: true,
      sleepMinutes: 15, resumeLast: false,
    });
  });
});

describe('normalizeSynth', () => {
  it('非法值回落并夹取范围', () => {
    expect(normalizeSynth(null)).toEqual({ voice: '', rate: 0, pitch: 0 });
    expect(normalizeSynth({ voice: 3, rate: 999, pitch: -999 }))
      .toEqual({ voice: '', rate: 100, pitch: -100 });
  });

  it('合法值四舍五入保留', () => {
    expect(normalizeSynth({ voice: 'zh-CN-XiaoxiaoNeural', rate: 12.6, pitch: -3.2 }))
      .toEqual({ voice: 'zh-CN-XiaoxiaoNeural', rate: 13, pitch: -3 });
  });
});

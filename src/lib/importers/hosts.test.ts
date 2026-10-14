import { describe, expect, it } from 'vitest';
import { buildBaseUrl, dedupeByBaseUrl, rankRelevance, recordsToNodes } from './hosts';
import type { HostRecord } from './hosts';

const rec = (p: Partial<HostRecord>): HostRecord => ({
  ip: '1.2.3.4', port: 443, protocol: 'https', title: '', ...p,
});

describe('buildBaseUrl', () => {
  it('https 默认 443 不带端口', () => {
    expect(buildBaseUrl(rec({ port: 443, protocol: 'https' }))).toBe('https://1.2.3.4');
  });

  it('http 80 不带端口，其他端口保留', () => {
    expect(buildBaseUrl(rec({ protocol: 'http', port: 80 }))).toBe('http://1.2.3.4');
    expect(buildBaseUrl(rec({ protocol: 'http', port: 8080 }))).toBe('http://1.2.3.4:8080');
  });

  it('protocol 空按 https 启发式', () => {
    expect(buildBaseUrl(rec({ protocol: '', port: 443 }))).toBe('https://1.2.3.4');
    expect(buildBaseUrl(rec({ protocol: '', port: 9999 }))).toBe('https://1.2.3.4:9999');
  });
});

describe('dedupeByBaseUrl', () => {
  it('按 baseUrl 去重保序', () => {
    const out = dedupeByBaseUrl([rec({}), rec({}), rec({ ip: '5.6.7.8' })]);
    expect(out).toHaveLength(2);
  });
});

describe('rankRelevance', () => {
  it('title 含 tts/speech/voice 得分更高，排前', () => {
    const hot = rec({ ip: '9.9.9.9', title: 'My TTS Server' });
    const cold = rec({ ip: '8.8.8.8', title: 'Nginx' });
    expect(rankRelevance(hot)).toBeGreaterThan(rankRelevance(cold));
  });
});

describe('recordsToNodes', () => {
  it('产出带 source 的节点记录骨架', () => {
    const out = recordsToNodes([rec({ ip: '7.7.7.7', title: 'tts' })], 'fofa');
    expect(out).toHaveLength(1);
    expect(out[0].baseUrl).toBe('https://7.7.7.7');
    expect(out[0].source).toBe('fofa');
    expect(out[0].label).toContain('tts');
  });
});

import { describe, expect, it } from 'vitest';
import { buildExportPayload } from './share';
import { DEFAULT_POOL, type TtsNode } from '../types/models';

const node = (id: string, url: string): TtsNode => ({
  id, baseUrl: url, label: '', keyless: false, apiKey: 'SECRET',
  health: 'OK', lastChecked: 1, defaultVoice: '', voiceCount: 3,
  failCount: 0, cooldownUntil: 0, disabled: false, apiVersion: 'V1', source: 'manual',
});

describe('buildExportPayload', () => {
  it('含节点与调度配置', () => {
    const p = buildExportPayload([node('a', 'https://x')], DEFAULT_POOL, 1000);
    expect(p.nodes).toHaveLength(1);
    expect(p.pool.mode).toBe('AUTO');
    expect(p.exportedAt).toBe(1000);
  });

  it('剔除 apiKey 等敏感字段', () => {
    const p = buildExportPayload([node('a', 'https://x')], DEFAULT_POOL, 0);
    expect(JSON.stringify(p)).not.toContain('SECRET');
    expect(JSON.stringify(p)).not.toContain('apiKey');
  });
});

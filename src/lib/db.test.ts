import { describe, expect, it } from 'vitest';
import { logRow, nodeRow, rowToLog, rowToNode } from './db';
import type { CallLog, TtsNode } from '../types/models';

const node: TtsNode = {
  id: 'n1', baseUrl: 'https://a.example.com', label: 'A', keyless: true,
  apiKey: null, health: 'OK', lastChecked: 1700000000000,
  defaultVoice: 'zh-CN-XiaoxiaoNeural', voiceCount: 12, failCount: 0,
  cooldownUntil: 0, disabled: false, apiVersion: 'V1', source: 'fofa',
};

const log: CallLog = {
  id: 7, time: 1700000000001, nodeUrl: 'https://a.example.com', mode: 'AUTO',
  textLen: 42, attempt: 1, success: false, latencyMs: 321,
  fromNode: 'https://b.example.com', error: 'boom', triggeredCooldown: true,
  textPreview: '你好', voice: 'zh-CN-XiaoxiaoNeural', rate: 10, pitch: -5,
};

describe('db 行映射', () => {
  it('nodeRow ↔ rowToNode 往返一致（枚举按序号落库）', () => {
    const params = nodeRow(node);
    const row = {
      id: params[0], base_url: params[1], label: params[2], keyless: params[3],
      api_key: params[4], health: params[5], last_checked: params[6],
      default_voice: params[7], voice_count: params[8], fail_count: params[9],
      cooldown_until: params[10], disabled: params[11], api_version: params[12],
      source: params[13],
    };
    expect(rowToNode(row as never)).toEqual(node);
  });

  it('logRow ↔ rowToLog 往返一致', () => {
    const p = logRow(log);
    const row = {
      id: p[0], time: p[1], node_url: p[2], mode: p[3], text_len: p[4],
      attempt: p[5], success: p[6], latency_ms: p[7], from_node: p[8],
      error: p[9], cooldown: p[10], text_preview: p[11], voice: p[12],
      rate: p[13], pitch: p[14],
    };
    expect(rowToLog(row as never)).toEqual(log);
  });

  it('健康度序号与安卓一致：OK=0 FAIL=1 UNKNOWN=2', () => {
    expect(nodeRow({ ...node, health: 'UNKNOWN' })[5]).toBe(2);
    expect(nodeRow({ ...node, apiVersion: 'LEGACY' })[12]).toBe(1);
  });
});

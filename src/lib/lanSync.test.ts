import { describe, expect, it } from 'vitest';
import {
  buildPairingString, mergeNodes, normalizeUrl, parsePairingString, toSyncedNodes,
} from './lanSync';
import type { TtsNode } from '../types/models';

function node(overrides: Partial<TtsNode>): TtsNode {
  return {
    id: 'n1', baseUrl: 'https://a.example.com', label: 'A', keyless: false, apiKey: 'secret',
    health: 'OK', lastChecked: 1, defaultVoice: 'v', voiceCount: 3, failCount: 2,
    cooldownUntil: 0, disabled: true, apiVersion: 'V1', source: 'manual', ...overrides,
  };
}

describe('normalizeUrl', () => {
  it('去默认端口与末尾斜杠', () => {
    expect(normalizeUrl('https://A.example.com:443/')).toBe('https://a.example.com');
    expect(normalizeUrl('http://a.example.com:80/tts/')).toBe('http://a.example.com/tts');
    expect(normalizeUrl('http://a.example.com:8080/')).toBe('http://a.example.com:8080');
  });
  it('拒绝非 http 协议', () => {
    expect(normalizeUrl('ftp://a.example.com')).toBeNull();
    expect(normalizeUrl('a.example.com')).toBeNull();
  });
});

describe('mergeNodes', () => {
  it('新增节点不携带 apiKey，且默认未禁用', () => {
    const { nodes, result } = mergeNodes([], [
      { url: 'https://new.example.com/', label: '新', health: 'FAIL', apiVersion: 'LEGACY', defaultVoice: 'x', voiceCount: 8 },
    ]);
    expect(result).toEqual({ added: 1, updated: 0, skipped: 0, total: 1 });
    expect(nodes[0].apiKey).toBeNull();
    expect(nodes[0].disabled).toBe(false);
    expect(nodes[0].baseUrl).toBe('https://new.example.com');
  });

  it('已有节点只更新元数据，保留密钥与禁用状态', () => {
    const local = [node({})];
    const { nodes, result } = mergeNodes(local, [
      { url: 'https://a.example.com', label: '改名', health: 'FAIL', apiVersion: 'V1', defaultVoice: 'z', voiceCount: 9 },
    ]);
    expect(result.updated).toBe(1);
    expect(nodes[0].label).toBe('改名');
    expect(nodes[0].apiKey).toBe('secret');
    expect(nodes[0].disabled).toBe(true);
    expect(nodes[0].failCount).toBe(2);
  });

  it('不删除本地独有节点，非法 URL 计入 skipped', () => {
    const local = [node({ id: 'keep' })];
    const { nodes, result } = mergeNodes(local, [
      { url: 'ftp://bad', label: '', health: 'OK', apiVersion: 'V1', defaultVoice: '', voiceCount: 0 },
    ]);
    expect(result.skipped).toBe(1);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('keep');
  });
});

describe('toSyncedNodes', () => {
  it('裁剪掉 apiKey 等本地字段', () => {
    const out = toSyncedNodes([node({})]);
    expect(Object.keys(out[0]).sort()).toEqual(
      ['apiVersion', 'defaultVoice', 'health', 'label', 'url', 'voiceCount'],
    );
  });
});

describe('配对串', () => {
  it('生成后可原样解析', () => {
    const peer = { host: '192.168.1.20', port: 53421, sid: 'ab12', name: '书房的电脑', platform: 'desktop' as const };
    expect(parsePairingString(buildPairingString(peer))).toEqual(peer);
  });
  it('拒绝非法输入', () => {
    expect(parsePairingString('https://x')).toBeNull();
    expect(parsePairingString('pulsetts://sync?host=a&port=0&sid=x')).toBeNull();
  });
});

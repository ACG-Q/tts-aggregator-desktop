import { describe, expect, it } from 'vitest';
import {
  buildConfigFile, mergeImportedNode, parseConfigFile,
} from './configTransfer';
import { DEFAULT_APP_PREFS, DEFAULT_SYNTH, type TtsNode } from '../types/models';

const node: TtsNode = {
  id: 'n1', baseUrl: 'https://a.example', label: 'A', keyless: true, apiKey: 'SECRET',
  health: 'OK', lastChecked: 100, defaultVoice: 'v', voiceCount: 2, failCount: 1,
  cooldownUntil: 5, disabled: false, apiVersion: 'V1', source: 'manual',
};

describe('buildConfigFile', () => {
  it('导出不含 apiKey 与 pool', () => {
    const file = buildConfigFile([node], DEFAULT_SYNTH, DEFAULT_APP_PREFS, 1700000000000);
    expect(file.version).toBe(1);
    expect(file.count).toBe(1);
    expect(JSON.stringify(file)).not.toContain('SECRET');
    expect(file.nodes[0]).toEqual({
      name: 'A', url: 'https://a.example', source: 'manual', health: 'OK',
      keyless: true, apiVersion: 'V1', defaultVoice: 'v', voiceCount: 2,
    });
  });
});

describe('parseConfigFile', () => {
  it('解析合法文件', () => {
    const raw = JSON.stringify(buildConfigFile([node], DEFAULT_SYNTH, DEFAULT_APP_PREFS, 1));
    expect(parseConfigFile(raw).nodes.length).toBe(1);
  });

  it('版本或结构非法抛错', () => {
    expect(() => parseConfigFile('{oops')).toThrow('JSON');
    expect(() => parseConfigFile(JSON.stringify({ version: 2, nodes: [] }))).toThrow('版本');
    expect(() => parseConfigFile(JSON.stringify({ version: 1, nodes: 'x' }))).toThrow('nodes');
  });
});

describe('mergeImportedNode', () => {
  const imported = {
    name: '新名字', url: 'https://a.example', source: 'fofa' as const, health: 'FAIL' as const,
    keyless: false, apiVersion: 'LEGACY' as const, defaultVoice: 'v2', voiceCount: 9,
  };

  it('已有节点保留 apiKey 与 disabled，更新其余字段并清零失败', () => {
    const merged = mergeImportedNode(node, imported);
    expect(merged.id).toBe('n1');
    expect(merged.apiKey).toBe('SECRET');
    expect(merged.disabled).toBe(false);
    expect(merged.label).toBe('新名字');
    expect(merged.health).toBe('FAIL');
    expect(merged.failCount).toBe(0);
    expect(merged.cooldownUntil).toBe(0);
  });

  it('新节点没有密钥且健康度使用导入值', () => {
    const merged = mergeImportedNode(undefined, imported);
    expect(merged.apiKey).toBeNull();
    expect(merged.health).toBe('FAIL');
    expect(merged.source).toBe('fofa');
  });
});

import { describe, expect, it } from 'vitest';
import { synthesize, type PoolDeps } from './pool';
import { DEFAULT_POOL, type CallLog, type PoolConfig, type TtsNode } from '../types/models';

function mkNode(id: string, over: Partial<TtsNode> = {}): TtsNode {
  return {
    id, baseUrl: `https://${id}.example.com`, label: id, keyless: true, apiKey: null,
    health: 'OK', lastChecked: 1000, defaultVoice: '', voiceCount: 1, failCount: 0,
    cooldownUntil: 0, disabled: false, apiVersion: 'V1', source: 'manual', ...over,
  };
}

interface Harness {
  deps: PoolDeps;
  logs: CallLog[];
  upserts: TtsNode[];
  config: PoolConfig;
}

function harness(
  nodes: TtsNode[],
  failUrls: string[] = [],
  config: Partial<PoolConfig> = {},
): Harness {
  const logs: CallLog[] = [];
  const upserts: TtsNode[] = [];
  const cfg: PoolConfig = { ...DEFAULT_POOL, ...config };
  let clock = 100000;
  const deps: PoolDeps = {
    getNodes: () => nodes.map((n) => upserts.filter((u) => u.id === n.id).pop() ?? n),
    getConfig: () => cfg,
    updateConfig: async (fn) => { Object.assign(cfg, fn(cfg)); },
    upsertNode: async (n) => { upserts.push(n); },
    insertLog: async (l) => { logs.push(l); },
    synth: async (n) => {
      if (failUrls.includes(n.baseUrl)) throw new Error('v1/兼容端点均不可用');
      return new ArrayBuffer(4);
    },
    now: () => (clock += 10),
  };
  return { deps, logs, upserts, config: cfg };
}

describe('AUTO', () => {
  it('首个失败自动切到下一个，日志记录失败链与 attempt 序号', async () => {
    const a = mkNode('a');
    const b = mkNode('b', { lastChecked: 999 });
    const h = harness([a, b], [a.baseUrl]);
    const r = await synthesize(h.deps, '你好', { voice: '', rate: 0, pitch: 0, style: '' });
    expect(r.node.id).toBe('b');
    expect(h.logs.length).toBe(2);
    expect(h.logs[0].success).toBe(false);
    expect(h.logs[0].attempt).toBe(1);
    expect(h.logs[1].success).toBe(true);
    expect(h.logs[1].attempt).toBe(2);
    expect(h.logs[1].fromNode).toBe(a.baseUrl);
    expect(h.upserts.some((n) => n.id === 'a' && n.failCount === 1)).toBe(true);
  });

  it('连续失败 3 次进入 10 分钟冷却，随后被排除出候选', async () => {
    const a = mkNode('a');
    const h = harness([a], [a.baseUrl]);
    const prefs = { voice: '', rate: 0, pitch: 0, style: '' };
    await expect(synthesize(h.deps, 'x', prefs)).rejects.toThrow('全部 1 个节点调用失败');
    await expect(synthesize(h.deps, 'x', prefs)).rejects.toThrow('全部 1 个节点调用失败');
    await expect(synthesize(h.deps, 'x', prefs)).rejects.toThrow('全部 1 个节点调用失败');
    const cooled = h.upserts.filter((n) => n.cooldownUntil > 0);
    expect(cooled.length).toBeGreaterThan(0);
    await expect(synthesize(h.deps, 'x', prefs)).rejects.toThrow('冷却中');
  });

  it('全部禁用/失败时报“没有可用节点”', async () => {
    const a = mkNode('a', { health: 'FAIL' });
    const h = harness([a]);
    await expect(synthesize(h.deps, 'x', { voice: '', rate: 0, pitch: 0, style: '' }))
      .rejects.toThrow('没有可用节点');
  });
});

describe('GROUP', () => {
  it('成功后游标轮换到下一个节点', async () => {
    const a = mkNode('a');
    const b = mkNode('b');
    const h = harness([a, b], [], { mode: 'GROUP', groupIds: ['a', 'b'], groupCursor: 0 });
    const r1 = await synthesize(h.deps, 'x', { voice: '', rate: 0, pitch: 0, style: '' });
    expect(r1.node.id).toBe('a');
    expect(h.config.groupCursor).toBe(1);
    const r2 = await synthesize(h.deps, 'x', { voice: '', rate: 0, pitch: 0, style: '' });
    expect(r2.node.id).toBe('b');
    expect(h.config.groupCursor).toBe(0);
  });

  it('组内全部失败则整体失败', async () => {
    const a = mkNode('a');
    const b = mkNode('b');
    const h = harness([a, b], [a.baseUrl, b.baseUrl], { mode: 'GROUP', groupIds: ['a', 'b'] });
    await expect(synthesize(h.deps, 'x', { voice: '', rate: 0, pitch: 0, style: '' }))
      .rejects.toThrow('组内 2 个节点全部失败');
  });
});

describe('MANUAL', () => {
  it('连败 3 次停止调用，成功则清零计数', async () => {
    const a = mkNode('a');
    const h = harness([a], [a.baseUrl], { mode: 'MANUAL', manualId: 'a' });
    const prefs = { voice: '', rate: 0, pitch: 0, style: '' };
    await expect(synthesize(h.deps, 'x', prefs)).rejects.toThrow('第 1 次失败');
    await expect(synthesize(h.deps, 'x', prefs)).rejects.toThrow('第 2 次失败');
    await expect(synthesize(h.deps, 'x', prefs)).rejects.toThrow('已停止调用');
    await expect(synthesize(h.deps, 'x', prefs)).rejects.toThrow('已连续失败 3 次');
    expect(h.config.manualFailCount).toBe(3);
  });

  it('未选手选节点时报明确错误', async () => {
    const h = harness([mkNode('a')], [], { mode: 'MANUAL', manualId: null });
    await expect(synthesize(h.deps, 'x', { voice: '', rate: 0, pitch: 0, style: '' }))
      .rejects.toThrow('尚未选择手选节点');
  });
});

describe('空节点表', () => {
  it('提示先添加节点', async () => {
    const h = harness([]);
    await expect(synthesize(h.deps, 'x', { voice: '', rate: 0, pitch: 0, style: '' }))
      .rejects.toThrow('还没有节点');
  });
});

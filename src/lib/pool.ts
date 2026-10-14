import {
  HEALTH_ORDINAL, isCoolingDown, type CallLog, type CallMode, type PoolConfig,
  type SynthPrefs, type TtsNode,
} from '../types/models';

export const FAIL_LIMIT = 3;
export const COOLDOWN_AFTER = 3;
export const COOLDOWN_MS = 10 * 60 * 1000;
export const TEXT_PREVIEW_LEN = 80;
export const SYNTH_RETRIES_PER_NODE = 1;

export interface PoolDeps {
  getNodes(): TtsNode[];
  getConfig(): PoolConfig;
  updateConfig(fn: (c: PoolConfig) => PoolConfig): Promise<void>;
  upsertNode(node: TtsNode): Promise<void>;
  insertLog(log: CallLog): Promise<void>;
  synth(node: TtsNode, text: string, prefs: SynthPrefs): Promise<ArrayBuffer>;
  now(): number;
}

export interface PoolResult { bytes: ArrayBuffer; node: TtsNode }

export async function synthesize(deps: PoolDeps, text: string, prefs: SynthPrefs): Promise<PoolResult> {
  const nodes = deps.getNodes();
  if (nodes.length === 0) throw new Error('还没有节点：请先到“节点”页添加');
  const mode = deps.getConfig().mode;
  if (mode === 'AUTO') return auto(deps, nodes, text, prefs);
  if (mode === 'GROUP') return group(deps, nodes, text, prefs);
  return manual(deps, nodes, text, prefs);
}

async function attempt(
  deps: PoolDeps, node: TtsNode, text: string, prefs: SynthPrefs,
  mode: CallMode, attemptNo: number, fromNode: string | null,
): Promise<ArrayBuffer> {
  const t0 = deps.now();
  try {
    const bytes = await deps.synth(node, text, prefs);
    const ms = deps.now() - t0;
    if (node.failCount > 0 || node.cooldownUntil > 0) {
      await deps.upsertNode({ ...node, failCount: 0, cooldownUntil: 0 });
    }
    await deps.insertLog({
      time: deps.now(), nodeUrl: node.baseUrl, mode, textLen: text.length,
      attempt: attemptNo, success: true, latencyMs: ms, fromNode,
      error: null, triggeredCooldown: false,
      textPreview: text.slice(0, TEXT_PREVIEW_LEN),
      voice: prefs.voice || node.defaultVoice, rate: prefs.rate, pitch: prefs.pitch,
    });
    return bytes;
  } catch (e) {
    const ms = deps.now() - t0;
    const err = e instanceof Error ? e.message : String(e);
    const failCount = node.failCount + 1;
    const triggered = failCount >= COOLDOWN_AFTER && mode !== 'MANUAL';
    const cooldownUntil = triggered ? deps.now() + COOLDOWN_MS : node.cooldownUntil;
    await deps.upsertNode({ ...node, failCount, cooldownUntil });
    await deps.insertLog({
      time: deps.now(), nodeUrl: node.baseUrl, mode, textLen: text.length,
      attempt: attemptNo, success: false, latencyMs: ms, fromNode,
      error: err, triggeredCooldown: triggered,
      textPreview: text.slice(0, TEXT_PREVIEW_LEN),
      voice: prefs.voice || node.defaultVoice, rate: prefs.rate, pitch: prefs.pitch,
    });
    throw new Error(`合成失败：${node.baseUrl}（${err}）`);
  }
}

async function auto(deps: PoolDeps, nodes: TtsNode[], text: string, prefs: SynthPrefs): Promise<PoolResult> {
  const now = deps.now();
  const candidates = nodes
    .filter((n) => n.health !== 'FAIL' && !n.disabled && !isCoolingDown(n, now))
    .sort((a, b) => HEALTH_ORDINAL[a.health] - HEALTH_ORDINAL[b.health] || b.lastChecked - a.lastChecked);
  if (candidates.length === 0) {
    const cooling = nodes.filter((n) => isCoolingDown(n, now)).length;
    throw new Error(cooling > 0
      ? `所有节点均不可用（${cooling} 个冷却中），请到节点管理重新测试`
      : '没有可用节点，请到节点管理重新测试');
  }
  let prevFailed: string | null = null;
  for (let i = 0; i < candidates.length; i++) {
    const node = candidates[i];
    try {
      const bytes = await attempt(deps, node, text, prefs, 'AUTO', i + 1, prevFailed);
      return { bytes, node };
    } catch {
      prevFailed = node.baseUrl;
    }
  }
  throw new Error(`全部 ${candidates.length} 个节点调用失败，详见调用日志`);
}

async function group(deps: PoolDeps, nodes: TtsNode[], text: string, prefs: SynthPrefs): Promise<PoolResult> {
  const cfg = deps.getConfig();
  const now = deps.now();
  const members = nodes.filter((n) => cfg.groupIds.includes(n.id) && !isCoolingDown(n, now));
  if (members.length === 0) {
    throw new Error(cfg.groupIds.length === 0
      ? '组内没有节点，请在节点列表勾选组成员'
      : '组内节点全部冷却/不可用');
  }
  let prevFailed: string | null = null;
  for (let i = 0; i < members.length; i++) {
    const idx = (cfg.groupCursor + i) % members.length;
    try {
      const bytes = await attempt(deps, members[idx], text, prefs, 'GROUP', i + 1, prevFailed);
      await deps.updateConfig((c) => ({ ...c, groupCursor: (idx + 1) % members.length }));
      return { bytes, node: members[idx] };
    } catch {
      prevFailed = members[idx].baseUrl;
    }
  }
  throw new Error(`组内 ${members.length} 个节点全部失败，详见调用日志`);
}

async function manual(deps: PoolDeps, nodes: TtsNode[], text: string, prefs: SynthPrefs): Promise<PoolResult> {
  const cfg = deps.getConfig();
  if (cfg.manualFailCount >= FAIL_LIMIT) {
    throw new Error(`手选节点已连续失败 ${FAIL_LIMIT} 次，调用已停止。请重新测试或更换手选节点。`);
  }
  const node = nodes.find((n) => n.id === cfg.manualId);
  if (!node) throw new Error('尚未选择手选节点，请在节点列表选择');
  try {
    const bytes = await attempt(deps, node, text, prefs, 'MANUAL', cfg.manualFailCount + 1, null);
    if (cfg.manualFailCount !== 0) await deps.updateConfig((c) => ({ ...c, manualFailCount: 0 }));
    return { bytes, node };
  } catch (e) {
    const fails = cfg.manualFailCount + 1;
    await deps.updateConfig((c) => ({ ...c, manualFailCount: fails }));
    const cause = e instanceof Error ? e.message : String(e);
    throw new Error(fails >= FAIL_LIMIT
      ? `手选节点连续失败 ${FAIL_LIMIT} 次，已停止调用：${cause}`
      : `手选节点第 ${fails} 次失败（剩余 ${FAIL_LIMIT - fails} 次机会）：${cause}`);
  }
}

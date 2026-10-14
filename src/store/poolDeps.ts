import { SYNTH_RETRIES_PER_NODE, synthesize, type PoolDeps, type PoolResult } from '../lib/pool';
import type { CallLog, PoolConfig, SynthPrefs, TtsNode } from '../types/models';
import { deps } from './deps';
import { useLogsStore } from './logsStore';
import { useNodesStore } from './nodesStore';
import { useSettingsStore } from './settingsStore';

export function makePoolDeps(nodes: TtsNode[], pool: PoolConfig): PoolDeps {
  return {
    getNodes: () => nodes,
    getConfig: () => pool,
    updateConfig: async (fn) => {
      await useSettingsStore.getState().updatePool(fn);
    },
    upsertNode: async (n) => {
      await deps().nodes.upsert(n);
      await useNodesStore.getState().load();
    },
    insertLog: async (l: CallLog) => {
      await deps().logs.insert(l);
      await useLogsStore.getState().load();
    },
    synth: async (n, t, p) => {
      const bytes = await deps().api.synthesize(n, t, p, SYNTH_RETRIES_PER_NODE);
      if (!bytes) throw new Error('v1/兼容端点均不可用');
      return bytes;
    },
    now: () => Date.now(),
  };
}

export function currentPrefs(): SynthPrefs {
  const s = useSettingsStore.getState().synth;
  return { voice: s.voice, rate: s.rate, pitch: s.pitch, style: '' };
}

export async function synthesizeText(
  text: string,
  prefs: SynthPrefs = currentPrefs(),
): Promise<PoolResult> {
  const nodes = useNodesStore.getState().nodes;
  const pool = useSettingsStore.getState().pool;
  return synthesize(makePoolDeps(nodes, pool), text, prefs);
}

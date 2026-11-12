import { create } from 'zustand';
import { mapLimit } from '../lib/async';
import { newId, normalizeBaseUrl, type NodeSource, type TtsNode } from '../types/models';
import { deps } from './deps';
import { mergeNodes, type SyncedNode, type SyncStats } from '../lib/lanSync';
import { useSettingsStore } from './settingsStore';

interface NodesState {
  nodes: TtsNode[];
  loading: boolean;
  probing: boolean;
  probeProgress: string | null;
  load(): Promise<void>;
  add(input: { baseUrl: string; label: string; apiKey: string | null; source?: NodeSource }): Promise<void>;
  importRecords(records: { baseUrl: string; label: string; apiKey?: string | null }[], source: NodeSource): Promise<void>;
  reprobe(node: TtsNode): Promise<void>;
  probeAll(): Promise<void>;
  update(node: TtsNode, origBaseUrl?: string): Promise<void>;
  remove(ids: string[]): Promise<void>;
  setDisabled(ids: string[], disabled: boolean): Promise<void>;
  mergeSynced(remote: SyncedNode[]): Promise<SyncStats>;
}

export const useNodesStore = create<NodesState>((set, get) => ({
  nodes: [],
  loading: false,
  probing: false,
  probeProgress: null,

  async load() {
    set({ loading: true });
    try {
      const nodes = await deps().nodes.getAll();
      set({ nodes });
    } finally {
      set({ loading: false });
    }
  },

  async add({ baseUrl, label, apiKey, source = 'manual' }) {
    const probed = await deps().api.probe(baseUrl, label, apiKey);
    await deps().nodes.upsert({ ...probed, source });
    await get().load();
  },

  async importRecords(records, source) {
    for (const r of records) {
      await deps().nodes.upsert({
        id: newId(), baseUrl: normalizeBaseUrl(r.baseUrl), label: r.label,
        keyless: false, apiKey: r.apiKey ?? null, health: 'UNKNOWN', lastChecked: 0,
        defaultVoice: '', voiceCount: 0, failCount: 0, cooldownUntil: 0,
        disabled: false, apiVersion: 'UNKNOWN', source,
      });
    }
    await get().load();
    await get().probeAll();
  },

  async reprobe(node) {
    const probed = await deps().api.probe(node.baseUrl, node.label, node.apiKey);
    await deps().nodes.upsert({
      ...node,
      health: probed.health,
      lastChecked: probed.lastChecked,
      voiceCount: probed.voiceCount,
      apiVersion: probed.apiVersion,
      defaultVoice: probed.defaultVoice || node.defaultVoice,
      keyless: probed.keyless,
      failCount: 0,
      cooldownUntil: 0,
    });
  },

  async probeAll() {
    if (get().probing) return;
    set({ probing: true, probeProgress: null });
    try {
      const snapshot = [...get().nodes];
      const total = snapshot.length;
      let done = 0;
      const concurrency = useSettingsStore.getState().appPrefs.probeConcurrency;
      await mapLimit(snapshot, concurrency, async (n) => {
        try {
          await get().reprobe(n);
        } finally {
          done++;
          set({ probeProgress: `已探测 ${done}/${total}` });
        }
      });
      await get().load();
    } finally {
      set({ probing: false, probeProgress: null });
    }
  },

  async update(node, origBaseUrl) {
    if (origBaseUrl && origBaseUrl !== node.baseUrl) {
      await deps().nodes.delete([node.id]);
    }
    await deps().nodes.upsert(node);
    await get().load();
  },

  async remove(ids) {
    await deps().nodes.delete(ids);
    await get().load();
  },

  async setDisabled(ids, disabled) {
    await deps().nodes.setDisabled(ids, disabled);
    await get().load();
  },

  async mergeSynced(remote) {
    if (remote.length === 0) return { added: 0, updated: 0, skipped: 0, total: 0 };
    const before = get().nodes;
    const { nodes, result } = mergeNodes(before, remote);
    const known = new Map(before.map((n) => [n.id, n]));
    for (const node of nodes) {
      if (known.get(node.id) !== node) await deps().nodes.upsert(node);
    }
    await get().load();
    return result;
  },
}));

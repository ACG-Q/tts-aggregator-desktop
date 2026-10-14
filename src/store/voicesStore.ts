import { create } from 'zustand';
import { parseVoices, voiceDisplayName } from '../lib/voices';
import type { TtsNode, Voice } from '../types/models';
import { deps } from './deps';

interface VoicesState {
  voices: Voice[];
  loading: boolean;
  error: string | null;
  initCache(): Promise<void>;
  load(force?: boolean, source?: TtsNode): Promise<void>;
}

export const useVoicesStore = create<VoicesState>((set, get) => ({
  voices: [],
  loading: false,
  error: null,
  async initCache() {
    const cached = await deps().settings.getJson<Voice[]>('voices_cache', []);
    if (cached.length && get().voices.length === 0) set({ voices: cached });
  },
  async load(force = false, source) {
    if (get().loading) return;
    if (!force && get().voices.length > 0) return;
    set({ loading: true, error: null });
    try {
      const nodes = (await deps().nodes.getAll());
      const node = source ?? nodes.find((n) => n.health === 'OK') ?? nodes[0];
      if (!node) {
        set({ error: '没有可用节点，请先在“节点”页添加并探测' });
        return;
      }
      const list = await deps().api.fetchVoices(node.baseUrl);
      if (!list || list.length === 0) {
        set({ error: `拉取音色失败：${node.baseUrl}` });
        return;
      }
      set({ voices: list });
      await deps().settings.setJson('voices_cache', list);
    } finally {
      set({ loading: false });
    }
  },
}));

export { voiceDisplayName, parseVoices };

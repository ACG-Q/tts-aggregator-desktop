import { create } from 'zustand';
import { loadBuiltinVoices, mergeVoiceTranslations } from '../lib/builtinVoices';
import { parseVoices, voiceDisplayName } from '../lib/voices';
import type { TtsNode, Voice } from '../types/models';
import { deps } from './deps';

export type VoicesSource = 'builtin' | 'cache' | 'remote';

const BUILTIN_HINT = '当前显示内置音色库，添加节点后可获取节点实际列表';

interface VoicesState {
  voices: Voice[];
  loading: boolean;
  error: string | null;
  source: VoicesSource | null;
  initCache(): Promise<void>;
  load(force?: boolean, source?: TtsNode): Promise<void>;
}

export const useVoicesStore = create<VoicesState>((set, get) => ({
  voices: [],
  loading: false,
  error: null,
  source: null,
  async initCache() {
    const cached = await deps().settings.getJson<Voice[]>('voices_cache', []);
    if (cached.length) {
      if (get().voices.length === 0) set({ voices: cached, source: 'cache' });
      return;
    }
    if (get().voices.length > 0) return;
    const builtin = await loadBuiltinVoices();
    if (builtin.length) set({ voices: builtin, source: 'builtin' });
  },
  async load(force = false, source) {
    if (get().loading) return;
    const { voices, source: current } = get();
    // 内置库只是兜底，进入页面时仍要尝试拉取节点真实列表
    if (!force && voices.length > 0 && current !== 'builtin') return;
    set({ loading: true, error: null });
    try {
      const nodes = await deps().nodes.getAll();
      const node = source ?? nodes.find((n) => n.health === 'OK') ?? nodes[0];
      if (!node) {
        const builtin = await loadBuiltinVoices();
        if (builtin.length) {
          set({ voices: builtin, source: 'builtin', error: BUILTIN_HINT });
        } else {
          set({ error: '没有可用节点，请先在“节点”页添加并探测' });
        }
        return;
      }
      const list = await deps().api.fetchVoices(node.baseUrl);
      if (!list || list.length === 0) {
        set({ error: `拉取音色失败：${node.baseUrl}` });
        return;
      }
      const merged = mergeVoiceTranslations(list, await loadBuiltinVoices());
      set({ voices: merged, source: 'remote' });
      await deps().settings.setJson('voices_cache', merged);
    } finally {
      set({ loading: false });
    }
  },
}));

export { voiceDisplayName, parseVoices };

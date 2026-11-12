import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Voice } from '../types/models';

const state = vi.hoisted(() => ({
  builtin: [] as Voice[],
  cache: [] as Voice[],
  nodes: [] as { id: string; baseUrl: string; health: string }[],
  fetched: null as Voice[] | null,
  saved: [] as Voice[],
}));

vi.mock('../lib/builtinVoices', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/builtinVoices')>();
  return { ...actual, loadBuiltinVoices: async () => state.builtin };
});

vi.mock('./deps', () => ({
  deps: () => ({
    nodes: { getAll: async () => state.nodes },
    api: { fetchVoices: async () => state.fetched },
    settings: {
      getJson: async () => state.cache,
      setJson: async (_key: string, value: Voice[]) => { state.saved = value; },
    },
  }),
}));

import { useVoicesStore } from './voicesStore';

const voice = (id: string, extra: Partial<Voice> = {}): Voice => ({
  id, name: id, localName: '', gender: '', locale: 'zh-CN', styles: null, ...extra,
});

describe('voicesStore 内置音色', () => {
  beforeEach(() => {
    state.builtin = [voice('builtin-1', { nameZh: '内置一', introZh: '简介' })];
    state.cache = [];
    state.nodes = [];
    state.fetched = null;
    state.saved = [];
    useVoicesStore.setState({ voices: [], loading: false, error: null, source: null });
  });

  it('缓存为空时载入内置库', async () => {
    await useVoicesStore.getState().initCache();
    expect(useVoicesStore.getState().voices).toHaveLength(1);
    expect(useVoicesStore.getState().source).toBe('builtin');
  });

  it('无节点时保留内置库并提示', async () => {
    await useVoicesStore.getState().initCache();
    await useVoicesStore.getState().load();
    expect(useVoicesStore.getState().voices[0].id).toBe('builtin-1');
    expect(useVoicesStore.getState().error).toContain('内置音色库');
  });

  it('拉取成功后合并翻译、标记 remote 并写缓存', async () => {
    state.nodes = [{ id: 'n1', baseUrl: 'https://n.example.com', health: 'OK' }];
    state.fetched = [voice('zh-CN-XiaoxiaoNeural', { name: 'Xiaoxiao' })];
    state.builtin = [voice('zh-CN-XiaoxiaoNeural', { name: 'Xiaoxiao', nameZh: '晓晓', introZh: '普通话女声' })];
    await useVoicesStore.getState().load();
    const s = useVoicesStore.getState();
    expect(s.source).toBe('remote');
    expect(s.voices[0]).toMatchObject({ nameZh: '晓晓', introZh: '普通话女声' });
    expect(state.saved[0].nameZh).toBe('晓晓');
  });
});

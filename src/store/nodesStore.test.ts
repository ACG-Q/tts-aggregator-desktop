import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TtsNode } from '../types/models';

const saved: TtsNode[] = [];
const upsert = vi.fn(async (n: TtsNode) => { saved.push(n); });

vi.mock('./deps', () => ({
  deps: () => ({ nodes: { upsert, getAll: async () => [...saved], delete: vi.fn(), setDisabled: vi.fn() } }),
}));

vi.mock('./settingsStore', () => ({
  useSettingsStore: { getState: () => ({ appPrefs: { probeConcurrency: 2 } }) },
}));

import { useNodesStore } from './nodesStore';

describe('mergeSynced', () => {
  beforeEach(() => {
    saved.length = 0;
    upsert.mockClear();
    useNodesStore.setState({ nodes: [] });
  });

  it('新增远端节点并写入仓库，不触发探测', async () => {
    const result = await useNodesStore.getState().mergeSynced([
      { url: 'https://b.example.com', label: 'B', health: 'OK', apiVersion: 'V1', defaultVoice: '', voiceCount: 1 },
    ]);
    expect(result).toEqual({ added: 1, updated: 0, skipped: 0, total: 1 });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(useNodesStore.getState().nodes).toHaveLength(1);
  });
});

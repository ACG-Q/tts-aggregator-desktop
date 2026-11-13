import { beforeEach, describe, expect, it, vi } from 'vitest';

type RequestEvent = { payload: { requestId: string; from: { name: string; platform: string }; nodes: [] } };

const invoke = vi.fn(async (cmd: string, args?: unknown) => {
  void args;
  return cmd === 'lan_sync_status' ? null : undefined;
});
const saved: { key: string; value: unknown }[] = [];
let storedAutoAllow = false;
let handler: ((e: RequestEvent) => void) | null = null;

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (cmd: string, args?: unknown) => invoke(cmd, args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: async (_name: string, cb: (e: RequestEvent) => void) => {
    handler = cb;
    return () => {};
  },
}));

vi.mock('@tauri-apps/plugin-http', () => ({ fetch: vi.fn() }));

vi.mock('./deps', () => ({
  deps: () => ({
    settings: {
      getJson: async (_key: string, fallback: unknown) => storedAutoAllow ?? fallback,
      setJson: async (key: string, value: unknown) => {
        saved.push({ key, value });
      },
    },
  }),
}));

vi.mock('./nodesStore', () => ({
  useNodesStore: {
    getState: () => ({
      nodes: [],
      mergeSynced: async () => ({ added: 0, updated: 0, skipped: 0, total: 0 }),
    }),
  },
}));

import { useLanSyncStore } from './lanSyncStore';

describe('自动允许', () => {
  beforeEach(() => {
    storedAutoAllow = false;
    saved.length = 0;
    handler = null;
    invoke.mockClear();
    useLanSyncStore.setState({
      autoAllow: false,
      pending: null,
      phase: 'idle',
      message: null,
      result: null,
    });
  });

  it('默认关闭，切换后写盘', async () => {
    await useLanSyncStore.getState().refresh();
    expect(useLanSyncStore.getState().autoAllow).toBe(false);
    await useLanSyncStore.getState().setAutoAllow(true);
    expect(useLanSyncStore.getState().autoAllow).toBe(true);
    expect(saved).toEqual([{ key: 'lan_sync_auto_allow', value: true }]);
  });
});

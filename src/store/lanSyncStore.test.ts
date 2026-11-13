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

  it('开启后收到请求直接合并，不产生待确认状态', async () => {
    useLanSyncStore.setState({ autoAllow: true });
    await useLanSyncStore.getState().bind();
    handler?.({
      payload: { requestId: 'r1', from: { name: 'Samsung', platform: 'android' }, nodes: [] },
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(useLanSyncStore.getState().pending).toBeNull();
    expect(invoke).toHaveBeenCalledWith(
      'lan_sync_resolve',
      expect.objectContaining({ requestId: 'r1', accept: true }),
    );
    expect(useLanSyncStore.getState().message).toContain('已自动允许');
  });

  it('关闭后仍然进入待确认状态', async () => {
    useLanSyncStore.setState({ autoAllow: false });
    await useLanSyncStore.getState().bind();
    handler?.({
      payload: { requestId: 'r2', from: { name: 'Samsung', platform: 'android' }, nodes: [] },
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(useLanSyncStore.getState().pending?.requestId).toBe('r2');
    expect(invoke).not.toHaveBeenCalledWith('lan_sync_resolve', expect.anything());
  });
});

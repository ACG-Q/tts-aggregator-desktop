import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { fetch as httpFetch } from '@tauri-apps/plugin-http';
import {
  mergeNodes, toSyncedNodes,
  type Peer, type SyncedNode,
} from '../lib/lanSync';
import { useNodesStore } from './nodesStore';

export type LanSyncPhase =
  | 'idle' | 'starting' | 'waiting' | 'requesting' | 'syncing' | 'done' | 'error';

export interface SyncStatus {
  running: boolean;
  port: number;
  sid: string;
  localIp: string;
}

export interface PendingRequest {
  requestId: string;
  from: { name: string; platform: string };
  nodes: SyncedNode[];
}

interface LanSyncState {
  phase: LanSyncPhase;
  status: SyncStatus | null;
  pending: PendingRequest | null;
  message: string | null;
  result: { added: number; updated: number; skipped: number } | null;
  deviceName: string;
  start(deviceName: string): Promise<void>;
  refresh(): Promise<void>;
  stop(): Promise<void>;
  syncTo(peer: Peer): Promise<void>;
  accept(): Promise<void>;
  reject(): Promise<void>;
  bind(): Promise<UnlistenFn>;
}

/** 覆盖对端 60 秒确认窗口，避免用户稍晚确认时本机先超时。 */
const TIMEOUT_MS = 70_000;

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const useLanSyncStore = create<LanSyncState>((set, get) => ({
  phase: 'idle',
  status: null,
  pending: null,
  message: null,
  result: null,
  deviceName: '书房的电脑',

  async refresh() {
    try {
      const status = await invoke<SyncStatus | null>('lan_sync_status');
      set({ status, phase: status ? 'waiting' : 'idle' });
    } catch {
      set({ status: null, phase: 'idle' });
    }
  },

  async start(deviceName) {
    set({ phase: 'starting', message: null, result: null, deviceName });
    try {
      const nodes = toSyncedNodes(useNodesStore.getState().nodes);
      const status = await invoke<SyncStatus>('lan_sync_start', { deviceName, nodes });
      set({ status, phase: 'waiting' });
    } catch (e) {
      set({ phase: 'error', message: errorText(e) });
    }
  },

  async stop() {
    await invoke('lan_sync_stop').catch(() => undefined);
    set({ status: null, pending: null, phase: 'idle' });
  },

  async syncTo(peer) {
    set({ phase: 'syncing', message: null, result: null });
    try {
      const from = { name: get().deviceName, platform: 'desktop' };
      const nodes = toSyncedNodes(useNodesStore.getState().nodes);
      const res = await httpFetch(`http://${peer.host}:${peer.port}/v1/sync`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-sync-session': peer.sid },
        body: JSON.stringify({ from, nodes }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 403) {
        set({ phase: 'error', message: '对方拒绝了本次同步' });
        return;
      }
      if (res.status === 408) {
        set({ phase: 'error', message: '对方 60 秒内未确认' });
        return;
      }
      if (!res.ok) {
        set({ phase: 'error', message: `同步失败（${res.status}）` });
        return;
      }
      const body = await res.json() as { nodes: SyncedNode[]; applied: number };
      const merged = await useNodesStore.getState().mergeSynced(body.nodes ?? []);
      set({ phase: 'done', result: merged });
    } catch {
      set({ phase: 'error', message: '无法连接到设备，请确认在同一 Wi-Fi' });
    }
  },

  async accept() {
    const pending = get().pending;
    if (!pending) return;
    try {
      const merged = mergeNodes(useNodesStore.getState().nodes, pending.nodes);
      await invoke('lan_sync_resolve', {
        requestId: pending.requestId,
        accept: true,
        nodes: toSyncedNodes(merged.nodes),
        applied: merged.result.total,
      });
      const result = await useNodesStore.getState().mergeSynced(pending.nodes);
      set({ pending: null, phase: 'done', result });
    } catch (e) {
      set({ pending: null, phase: 'error', message: errorText(e) });
    }
  },

  async reject() {
    const pending = get().pending;
    set({ pending: null, phase: get().status ? 'waiting' : 'idle' });
    if (!pending) return;
    await invoke('lan_sync_resolve', {
      requestId: pending.requestId, accept: false, nodes: [], applied: 0,
    }).catch(() => undefined);
  },

  bind() {
    return listen<PendingRequest>('lan-sync://request', (event) => {
      set({ pending: event.payload, phase: 'requesting' });
      setTimeout(() => {
        if (get().pending?.requestId === event.payload.requestId) {
          void get().reject();
          set({ message: '请求已超时' });
        }
      }, 60_000);
    });
  },
}));

export function pairInfo(status: SyncStatus | null, name: string): Peer | null {
  if (!status) return null;
  return {
    host: status.localIp,
    port: status.port,
    sid: status.sid,
    name,
    platform: 'desktop',
  };
}

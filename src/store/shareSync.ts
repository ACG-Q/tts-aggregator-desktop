import { invoke } from '@tauri-apps/api/core';
import type { PoolConfig, ShareConfig, TtsNode } from '../types/models';
import { buildExportPayload } from '../lib/share';

export interface ShareProvider {
  (): { nodes: TtsNode[]; pool: PoolConfig; share: ShareConfig };
}

let provider: ShareProvider | null = null;

export function setShareProvider(p: ShareProvider): void {
  provider = p;
}

export async function notifyShare(): Promise<void> {
  if (!provider) return;
  const { nodes, pool, share } = provider();
  if (!share.enabled) return;
  try {
    await invoke('share_set_payload', { payload: JSON.stringify(buildExportPayload(nodes, pool)) });
  } catch (e) {
    console.warn('分享 payload 同步失败', e);
  }
}

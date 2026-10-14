import type { PoolConfig, TtsNode } from '../types/models';

export interface ExportPayload {
  version: 1;
  exportedAt: number;
  pool: PoolConfig;
  nodes: TtsNode[];
}

export function buildExportPayload(nodes: TtsNode[], pool: PoolConfig, now = Date.now()): ExportPayload {
  return { version: 1, exportedAt: now, pool, nodes };
}

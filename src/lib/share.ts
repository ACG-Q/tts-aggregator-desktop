import type { PoolConfig, TtsNode } from '../types/models';

export type ExportedNode = Omit<TtsNode, 'apiKey'>;

export interface ExportPayload {
  version: 1;
  exportedAt: number;
  pool: PoolConfig;
  nodes: ExportedNode[];
}

export function buildExportPayload(nodes: TtsNode[], pool: PoolConfig, now = Date.now()): ExportPayload {
  return {
    version: 1,
    exportedAt: now,
    pool,
    nodes: nodes.map(({ apiKey: _removed, ...rest }): ExportedNode => rest),
  };
}

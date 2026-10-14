import type { Api } from '../lib/api';
import type { LogsRepo, NodesRepo, SettingsRepo, SqlExec } from '../lib/db';

export interface Deps {
  db: SqlExec;
  api: Api;
  nodes: NodesRepo;
  logs: LogsRepo;
  settings: SettingsRepo;
}

let current: Deps | null = null;

export function setDeps(d: Deps): void {
  current = d;
}

export function deps(): Deps {
  if (!current) throw new Error('应用尚未初始化');
  return current;
}

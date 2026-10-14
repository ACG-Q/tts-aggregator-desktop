import { create } from 'zustand';
import type { CallLog, LogFilter } from '../types/models';
import type { LogsFilterKind } from '../lib/db';
import { deps } from './deps';

interface LogsState {
  logs: CallLog[];
  filter: LogFilter;
  loading: boolean;
  load(filter?: LogFilter): Promise<void>;
  clear(): Promise<void>;
}

export const useLogsStore = create<LogsState>((set, get) => ({
  logs: [],
  filter: 'ALL',
  loading: false,
  async load(filter) {
    if (filter) set({ filter });
    set({ loading: true });
    try {
      const logs = await deps().logs.query(get().filter as LogsFilterKind);
      set({ logs });
    } finally {
      set({ loading: false });
    }
  },
  async clear() {
    await deps().logs.clear();
    set({ logs: [] });
  },
}));

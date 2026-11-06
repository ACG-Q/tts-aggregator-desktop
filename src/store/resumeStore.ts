import { create } from 'zustand';
import { parseSnapshotJson, type PlaybackSnapshot } from '../lib/snapshot';
import { deps } from './deps';

export const SNAPSHOT_KEY = 'playback_snapshot';

interface ResumeState {
  snapshot: PlaybackSnapshot | null;
  loaded: boolean;
  load(): Promise<void>;
  save(snapshot: PlaybackSnapshot): Promise<void>;
  clear(): Promise<void>;
}

let writeChain: Promise<void> = Promise.resolve();

function enqueue(value: string): Promise<void> {
  writeChain = writeChain
    .then(() => deps().settings.set(SNAPSHOT_KEY, value))
    .catch((e) => {
      console.warn('续听快照写入失败', e);
    });
  return writeChain;
}

export const useResumeStore = create<ResumeState>((set) => ({
  snapshot: null,
  loaded: false,
  async load() {
    const raw = await deps().settings.get(SNAPSHOT_KEY);
    set({ snapshot: parseSnapshotJson(raw), loaded: true });
  },
  async save(snapshot) {
    set({ snapshot });
    await enqueue(JSON.stringify(snapshot));
  },
  async clear() {
    set({ snapshot: null });
    await enqueue('');
  },
}));

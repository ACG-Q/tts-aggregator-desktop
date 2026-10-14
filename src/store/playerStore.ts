import { create } from 'zustand';
import { splitForReading } from '../lib/split';

export type SegStatus = 'pending' | 'synthesizing' | 'playing' | 'done' | 'error';
export type PlayerStatus = 'idle' | 'running' | 'paused';
export interface Segment { text: string; status: SegStatus }

interface PlayerState {
  status: PlayerStatus;
  segs: Segment[];
  index: number;
  error: string | null;
  currentTime: number;
  duration: number;
  setSynth(fn: (text: string) => Promise<ArrayBuffer>): void;
  start(text: string): Promise<void>;
  pause(): void;
  resume(): Promise<void>;
  stop(): void;
  skipNext(): void;
}

const audio = new Audio();
let synthFn: ((text: string) => Promise<ArrayBuffer>) | null = null;
let runToken = 0;
let resolveEnded: (() => void) | null = null;
let currentUrl: string | null = null;
let prefetch: { index: number; promise: Promise<ArrayBuffer> } | null = null;

function setSeg(i: number, status: SegStatus): void {
  const segs = [...usePlayerStore.getState().segs];
  if (!segs[i]) return;
  segs[i] = { ...segs[i], status };
  usePlayerStore.setState({ segs });
}

function revokeUrl(): void {
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
}

audio.addEventListener('ended', () => {
  resolveEnded?.();
  resolveEnded = null;
});
audio.addEventListener('timeupdate', () => {
  usePlayerStore.setState({ currentTime: audio.currentTime, duration: audio.duration || 0 });
});

function playAndWait(): Promise<void> {
  return new Promise((resolve, reject) => {
    resolveEnded = resolve;
    audio.onerror = () => {
      resolveEnded = null;
      reject(new Error('音频播放失败'));
    };
    audio.play().catch((e: unknown) => {
      resolveEnded = null;
      reject(e instanceof Error ? e : new Error(String(e)));
    });
  });
}

async function pump(token: number): Promise<void> {
  let consecutiveErrors = 0;
  while (token === runToken) {
    const s = usePlayerStore.getState();
    if (s.status !== 'running') return;
    if (s.index >= s.segs.length) {
      const allError = s.segs.length > 0 && s.segs.every((x) => x.status === 'error');
      usePlayerStore.setState({
        status: 'idle',
        error: allError ? '朗读失败：所有段合成均失败，详见日志' : null,
      });
      return;
    }
    const i = s.index;
    setSeg(i, 'synthesizing');
    try {
      let bytes: Promise<ArrayBuffer>;
      if (prefetch && prefetch.index === i) {
        bytes = prefetch.promise;
        prefetch = null;
      } else {
        if (!synthFn) throw new Error('朗读器未初始化');
        bytes = synthFn(s.segs[i].text);
      }
      const buf = await bytes;
      if (token !== runToken || usePlayerStore.getState().status !== 'running') return;
      revokeUrl();
      currentUrl = URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }));
      audio.src = currentUrl;
      audio.currentTime = 0;
      setSeg(i, 'playing');
      const nextIdx = i + 1;
      if (synthFn && nextIdx < usePlayerStore.getState().segs.length && !prefetch) {
        const text = usePlayerStore.getState().segs[nextIdx].text;
        setSeg(nextIdx, 'synthesizing');
        prefetch = { index: nextIdx, promise: synthFn(text) };
        prefetch.promise.catch(() => { /* 到位时再统一处理失败 */ });
      }
      await playAndWait();
      if (token !== runToken) return;
      revokeUrl();
      audio.removeAttribute('src');
      setSeg(i, 'done');
      consecutiveErrors = 0;
      usePlayerStore.setState({ index: i + 1 });
    } catch (e) {
      if (token !== runToken) return;
      setSeg(i, 'error');
      consecutiveErrors++;
      usePlayerStore.setState({
        error: `第 ${i + 1} 段失败：${e instanceof Error ? e.message : String(e)}`,
        index: i + 1,
      });
      if (consecutiveErrors >= usePlayerStore.getState().segs.length) {
        usePlayerStore.setState({ status: 'idle', error: '朗读失败：连续段落全部失败，详见日志' });
        return;
      }
    }
  }
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  status: 'idle',
  segs: [],
  index: 0,
  error: null,
  currentTime: 0,
  duration: 0,
  setSynth(fn) {
    synthFn = fn;
  },
  async start(text) {
    get().stop();
    const segs = splitForReading(text).map((t) => ({ text: t, status: 'pending' as SegStatus }));
    if (segs.length === 0) {
      set({ error: '没有可朗读的文本' });
      return;
    }
    prefetch = null;
    set({ status: 'running', segs, index: 0, error: null, currentTime: 0, duration: 0 });
    const token = ++runToken;
    void pump(token);
  },
  pause() {
    if (get().status !== 'running') return;
    audio.pause();
    set({ status: 'paused' });
  },
  async resume() {
    if (get().status !== 'paused') return;
    set({ status: 'running' });
    await audio.play().catch(() => { /* src 无效时进入下一轮 pump 合成 */ });
    if (!audio.src) void pump(runToken);
  },
  stop() {
    runToken++;
    audio.pause();
    revokeUrl();
    audio.removeAttribute('src');
    prefetch = null;
    resolveEnded?.();
    resolveEnded = null;
    set({ status: 'idle', currentTime: 0, duration: 0 });
  },
  skipNext() {
    const s = get();
    if (s.status === 'idle' || s.segs.length === 0) return;
    runToken++;
    audio.pause();
    revokeUrl();
    audio.removeAttribute('src');
    resolveEnded?.();
    resolveEnded = null;
    prefetch = null;
    const next = Math.min(s.index + 1, s.segs.length);
    if (next >= s.segs.length) {
      set({ status: 'idle', index: s.segs.length });
      return;
    }
    set({ index: next, status: 'running' });
    const token = ++runToken;
    void pump(token);
  },
}));

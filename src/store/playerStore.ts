import { create } from 'zustand';
import { splitForReading } from '../lib/split';

export type SegStatus = 'pending' | 'synthesizing' | 'playing' | 'done' | 'error';
export type PlayerStatus = 'idle' | 'running' | 'paused';
export type PlaySource =
  | { kind: 'text' }
  | { kind: 'book'; bookId: string; chapterIdx: number };
export interface Segment { text: string; status: SegStatus }

export interface PlayerHooks {
  onSegDone?: (segIdx: number, source: PlaySource) => void;
  onFinished?: (source: PlaySource) => void;
}

export type SynthFn = (segText: string) => Promise<ArrayBuffer>;

interface PlayerState {
  status: PlayerStatus;
  segs: Segment[];
  index: number;
  error: string | null;
  currentTime: number;
  duration: number;
  text: string;
  volume: number;
  playbackRate: number;
  source: PlaySource | null;
  initPlayback(volume: number, rate: number): void;
  setSynth(fn: SynthFn): void;
  setHooks(h: PlayerHooks): void;
  setText(t: string): void;
  setVolume(v: number): void;
  setPlaybackRate(r: number): void;
  start(text: string): Promise<void>;
  startSegs(segTexts: string[], source: PlaySource, fromSeg?: number): Promise<void>;
  pause(): void;
  resume(): Promise<void>;
  stop(): void;
  skipNext(): void;
  jumpTo(i: number): void;
  seek(t: number): void;
}

const audio = new Audio();
let synthFn: SynthFn | null = null;
let runToken = 0;
let resolveEnded: (() => void) | null = null;
let currentUrl: string | null = null;
let hooks: PlayerHooks = {};
let prefetch: { index: number; promise: Promise<ArrayBuffer> } | null = null;

function revokeUrl(): void {
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
}

audio.addEventListener('timeupdate', () => {
  usePlayerStore.setState({
    currentTime: audio.currentTime,
    duration: Number.isFinite(audio.duration) ? audio.duration : 0,
  });
});
audio.addEventListener('ended', () => {
  const r = resolveEnded;
  resolveEnded = null;
  r?.();
});

async function pump(token: number): Promise<void> {
  const store = usePlayerStore;
  while (token === runToken) {
    const s = store.getState();
    if (s.status !== 'running') return;
    if (s.index >= s.segs.length) {
      const allError = s.segs.length > 0 && s.segs.every((x) => x.status === 'error');
      const src = s.source ?? { kind: 'text' as const };
      store.setState({
        status: 'idle',
        source: null,
        error: allError ? '朗读失败：所有段合成均失败，详见日志' : null,
      });
      hooks.onFinished?.(src);
      hooks = {};
      return;
    }
    const i = s.index;
    const seg = s.segs[i];
    if (seg.status === 'done') {
      store.setState({ index: i + 1 });
      continue;
    }
    store.setState({
      segs: store.getState().segs.map((x, j) => (j === i ? { ...x, status: 'synthesizing' } : x)),
    });
    let buf: ArrayBuffer | null = null;
    try {
      if (!synthFn) throw new Error('朗读器未初始化');
      let p: Promise<ArrayBuffer>;
      if (prefetch && prefetch.index === i) {
        p = prefetch.promise;
        prefetch = null;
      } else {
        p = synthFn(seg.text);
      }
      const nextIdx = i + 1;
      const nextText = store.getState().segs[nextIdx]?.text;
      if (synthFn && nextText && (!prefetch || prefetch.index !== nextIdx)) {
        store.setState({
          segs: store.getState().segs.map((x, j) =>
            j === nextIdx && x.status === 'pending' ? { ...x, status: 'synthesizing' as const } : x),
        });
        prefetch = { index: nextIdx, promise: synthFn(nextText) };
        prefetch.promise.catch(() => { /* 到位时统一处理失败 */ });
      }
      buf = await p;
    } catch (e) {
      store.setState({ error: `第 ${i + 1} 段失败：${e instanceof Error ? e.message : String(e)}` });
      buf = null;
    }
    if (token !== runToken) return;
    if (!buf || buf.byteLength === 0) {
      const cur = store.getState();
      if (cur.index !== i) return;
      store.setState({
        segs: cur.segs.map((x, j) => (j === i ? { ...x, status: 'error' } : x)),
        index: i + 1,
      });
      continue;
    }
    revokeUrl();
    currentUrl = URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }));
    audio.src = currentUrl;
    audio.currentTime = 0;
    audio.playbackRate = store.getState().playbackRate;
    store.setState({
      segs: store.getState().segs.map((x, j) => (j === i ? { ...x, status: 'playing' } : x)),
      currentTime: 0,
      duration: 0,
    });
    try {
      await new Promise<void>((resolve, reject) => {
        resolveEnded = resolve;
        audio.onerror = () => reject(new Error('音频播放失败'));
        audio.play().catch((e: unknown) => reject(e instanceof Error ? e : new Error(String(e))));
      });
    } catch (e) {
      if (token !== runToken) return;
      store.setState({ status: 'paused', error: e instanceof Error ? e.message : String(e) });
      return;
    }
    if (token !== runToken) return;
    revokeUrl();
    audio.removeAttribute('src');
    store.setState({
      segs: store.getState().segs.map((x, j) => (j === i ? { ...x, status: 'done' } : x)),
      index: i + 1,
      error: null,
    });
    hooks.onSegDone?.(i, store.getState().source ?? { kind: 'text' });
    prefetch = null;
  }
}

function resetPlayback(): void {
  runToken++;
  audio.pause();
  revokeUrl();
  audio.removeAttribute('src');
  const r = resolveEnded;
  resolveEnded = null;
  r?.();
  prefetch = null;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  status: 'idle',
  segs: [],
  index: 0,
  error: null,
  currentTime: 0,
  duration: 0,
  text: '',
  volume: 100,
  playbackRate: 1,
  source: null,

  initPlayback(volume, rate) {
    audio.volume = volume / 100;
    audio.playbackRate = rate;
    set({ volume, playbackRate: rate });
  },
  setSynth(fn) {
    synthFn = fn;
  },
  setHooks(h) {
    hooks = h;
  },
  setText(t) {
    set({ text: t });
  },
  setVolume(v) {
    const clamped = Math.min(100, Math.max(0, v));
    audio.volume = clamped / 100;
    set({ volume: clamped });
  },
  setPlaybackRate(r) {
    audio.playbackRate = r;
    set({ playbackRate: r });
  },

  async start(text) {
    resetPlayback();
    hooks = {};
    const segs = splitForReading(text).map((t) => ({ text: t, status: 'pending' as SegStatus }));
    if (segs.length === 0) {
      set({ error: '没有可朗读的文本' });
      return;
    }
    set({
      text, status: 'running', source: { kind: 'text' }, error: null,
      currentTime: 0, duration: 0, index: 0, segs,
    });
    const token = ++runToken;
    void pump(token);
  },

  async startSegs(segTexts, source, fromSeg = 0) {
    resetPlayback();
    if (segTexts.length === 0) {
      set({ error: '没有可朗读的内容' });
      return;
    }
    const from = Math.min(Math.max(fromSeg, 0), segTexts.length - 1);
    set({
      status: 'running', source, error: null, text: '', currentTime: 0, duration: 0,
      index: from,
      segs: segTexts.map((t, i) => ({ text: t, status: i < from ? 'done' : ('pending' as SegStatus) })),
    });
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
    if (audio.src) {
      const ok = await audio.play().then(() => true).catch(() => false);
      if (ok) return;
    }
    const token = ++runToken;
    void pump(token);
  },

  stop() {
    resetPlayback();
    hooks = {};
    set({ status: 'idle', segs: [], index: 0, error: null, currentTime: 0, duration: 0, source: null });
  },

  skipNext() {
    const s = get();
    if (s.status === 'idle' || s.segs.length === 0) return;
    get().jumpTo(s.index + 1);
  },

  jumpTo(i) {
    const s = get();
    if (s.status === 'idle' || s.segs.length === 0) return;
    if (i < 0) return;
    resetPlayback();
    set({ index: Math.min(i, s.segs.length), status: 'running', error: null, currentTime: 0, duration: 0 });
    const token = ++runToken;
    void pump(token);
  },

  seek(t) {
    if (audio.src) audio.currentTime = Math.max(0, Math.min(t, audio.duration || t));
  },
}));

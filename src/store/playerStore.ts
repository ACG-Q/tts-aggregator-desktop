import { create } from 'zustand';
import { toast } from 'sonner';
import { splitForReading } from '../lib/split';
import { PrefetchWindow } from '../lib/prefetch';
import type { PlaySource } from '../types/models';

export type { PlaySource };

export type SegStatus = 'pending' | 'synthesizing' | 'playing' | 'done' | 'error';
export type PlayerStatus = 'idle' | 'running' | 'paused';
export interface Segment { text: string; status: SegStatus }

export interface SnapshotData {
  source: PlaySource;
  segIndex: number;
  text: string;
  finished: boolean;
}

export type SnapshotSink = (data: SnapshotData) => void;

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
  sleepEndsAt: number | null;
  sleepMinutes: number;
  defaultSleepMinutes: number;
  initPlayback(volume: number, rate: number): void;
  setSynth(fn: SynthFn): void;
  setHooks(h: PlayerHooks): void;
  setText(t: string): void;
  setVolume(v: number): void;
  setPlaybackRate(r: number): void;
  setDefaultSleepMinutes(minutes: number): void;
  setSleepTimer(minutes: number): void;
  clearSleepTimer(): void;
  setSnapshotSink(fn: SnapshotSink): void;
  start(text: string, fromSeg?: number): Promise<void>;
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
let snapshotSink: SnapshotSink | null = null;
let sleepTimeout: ReturnType<typeof setTimeout> | null = null;

const prefetchWindow = new PrefetchWindow({
  size: 3,
  synth: (text) => (synthFn ? synthFn(text) : Promise.reject(new Error('朗读器未初始化'))),
  onState: (index, state) => {
    const s = usePlayerStore.getState();
    if (s.status === 'idle') return;
    const seg = s.segs[index];
    if (!seg) return;
    if (state === 'start' && seg.status === 'pending') {
      usePlayerStore.setState({
        segs: s.segs.map((x, j) => (j === index ? { ...x, status: 'synthesizing' as const } : x)),
      });
    } else if (state === 'fail' && seg.status === 'synthesizing') {
      usePlayerStore.setState({
        segs: s.segs.map((x, j) => (j === index ? { ...x, status: 'pending' as const } : x)),
      });
    }
  },
});

function clearSleepTimeout(): void {
  if (sleepTimeout) {
    clearTimeout(sleepTimeout);
    sleepTimeout = null;
  }
}

function scheduleSleep(endsAt: number | null): void {
  clearSleepTimeout();
  if (endsAt === null) return;
  const delay = Math.max(0, endsAt - Date.now());
  sleepTimeout = setTimeout(() => {
    sleepTimeout = null;
    const s = usePlayerStore.getState();
    usePlayerStore.setState({ sleepEndsAt: null, sleepMinutes: 0 });
    if (s.status === 'running' || s.status === 'paused') {
      s.pause();
      toast('睡眠定时已结束');
    }
  }, delay);
}

function emitSnapshot(finished = false, segIndex = usePlayerStore.getState().index): void {
  const s = usePlayerStore.getState();
  if (!s.source || !snapshotSink) return;
  snapshotSink({
    source: s.source,
    segIndex,
    text: s.source.kind === 'text' ? s.text : '',
    finished,
  });
}

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
      emitSnapshot(true, s.segs.length);
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
      const prefetched = prefetchWindow.take(i);
      const p = prefetched ?? synthFn(seg.text);
      prefetchWindow.ensure(i, store.getState().segs);
      try {
        buf = await p;
      } catch (e) {
        if (!prefetched || token !== runToken) throw e;
        // 预取失败不影响正常朗读：轮到该段时直接再合成一次
        buf = await synthFn(seg.text);
      }
    } catch (e) {
      if (token !== runToken) return;
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
    emitSnapshot(false);
    hooks.onSegDone?.(i, store.getState().source ?? { kind: 'text' });
    prefetchWindow.release(i);
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
  prefetchWindow.clear();
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
  sleepEndsAt: null,
  sleepMinutes: 0,
  defaultSleepMinutes: 0,

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
  setDefaultSleepMinutes(minutes) {
    set({ defaultSleepMinutes: Math.max(0, minutes) });
  },
  setSleepTimer(minutes) {
    const safe = Math.max(0, minutes);
    const endsAt = safe > 0 ? Date.now() + safe * 60_000 : null;
    set({ sleepMinutes: safe, sleepEndsAt: endsAt });
    scheduleSleep(endsAt);
  },
  clearSleepTimer() {
    clearSleepTimeout();
    set({ sleepEndsAt: null, sleepMinutes: 0 });
  },
  setSnapshotSink(fn) {
    snapshotSink = fn;
  },

  async start(text, fromSeg = 0) {
    resetPlayback();
    hooks = {};
    const segs = splitForReading(text).map((t) => ({ text: t, status: 'pending' as SegStatus }));
    if (segs.length === 0) {
      set({ error: '没有可朗读的文本' });
      return;
    }
    const from = Math.min(Math.max(fromSeg, 0), segs.length - 1);
    const minutes = get().defaultSleepMinutes;
    const endsAt = minutes > 0 ? Date.now() + minutes * 60_000 : null;
    set({
      text, status: 'running', source: { kind: 'text' }, error: null,
      currentTime: 0, duration: 0, index: from,
      segs: segs.map((s, i) => (i < from ? { ...s, status: 'done' as SegStatus } : s)),
      sleepMinutes: minutes, sleepEndsAt: endsAt,
    });
    scheduleSleep(endsAt);
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
    const minutes = get().defaultSleepMinutes;
    const endsAt = minutes > 0 ? Date.now() + minutes * 60_000 : null;
    set({ sleepMinutes: minutes, sleepEndsAt: endsAt });
    scheduleSleep(endsAt);
    const token = ++runToken;
    void pump(token);
  },

  pause() {
    if (get().status !== 'running') return;
    emitSnapshot(false);
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
    emitSnapshot(false);
    clearSleepTimeout();
    resetPlayback();
    hooks = {};
    set({
      status: 'idle', segs: [], index: 0, error: null,
      currentTime: 0, duration: 0, source: null, sleepEndsAt: null, sleepMinutes: 0,
    });
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

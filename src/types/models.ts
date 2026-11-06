export type ApiVersion = 'V1' | 'LEGACY' | 'UNKNOWN';
export type Health = 'OK' | 'FAIL' | 'UNKNOWN';
export type CallMode = 'AUTO' | 'GROUP' | 'MANUAL';
export type NodeSource = 'manual' | 'fofa' | 'zoomeye';
export type LogFilter = 'ALL' | 'OK' | 'FAIL' | 'SWITCH';

export interface TtsNode {
  id: string;
  baseUrl: string;
  label: string;
  keyless: boolean;
  apiKey: string | null;
  health: Health;
  lastChecked: number;
  defaultVoice: string;
  voiceCount: number;
  failCount: number;
  cooldownUntil: number;
  disabled: boolean;
  apiVersion: ApiVersion;
  source: NodeSource;
}

export interface Voice {
  id: string;
  name: string;
  localName: string;
  gender: string;
  locale: string;
  styles: string[] | null;
}

export interface SynthPrefs { voice: string; rate: number; pitch: number; style: string }
export interface SynthSettings { rate: number; pitch: number; voice: string }
export interface PoolConfig {
  mode: CallMode;
  groupIds: string[];
  manualId: string | null;
  groupCursor: number;
  manualFailCount: number;
}
export interface ShareConfig { enabled: boolean; port: number; token: string; localhostOnly: boolean }
export type ThemeMode = 'system' | 'light' | 'dark';

export type PlaySource =
  | { kind: 'text' }
  | { kind: 'book'; bookId: string; chapterIdx: number };

export interface AppPrefs {
  probeConcurrency: number;
  theme: ThemeMode;
  playbackRate: number;
  volume: number;
  failThreshold: number;
  cooldownMinutes: number;
  autoTestOnLaunch: boolean;
  sleepMinutes: number;
  resumeLast: boolean;
}

export const FAIL_THRESHOLD_OPTIONS = [2, 3, 5, 10] as const;
export const COOLDOWN_MINUTES_OPTIONS = [1, 5, 10, 30, 60] as const;
export const SLEEP_MINUTES_OPTIONS = [0, 15, 30, 60] as const;

export interface Book {
  id: string;
  title: string;
  importedAt: number;
  lastChapter: number;
  lastSegment: number;
  playbackRate: number;
  chapterCount: number;
}

export interface BookChapter {
  id: string;
  bookId: string;
  idx: number;
  volume: string;
  title: string;
  content: string;
}

export interface CallLog {
  id?: number;
  time: number;
  nodeUrl: string;
  mode: CallMode;
  textLen: number;
  attempt: number;
  success: boolean;
  latencyMs: number;
  fromNode: string | null;
  error: string | null;
  triggeredCooldown: boolean;
  textPreview: string;
  voice: string;
  rate: number;
  pitch: number;
}

export const HEALTH_ORDINAL: Record<Health, number> = { OK: 0, FAIL: 1, UNKNOWN: 2 };
export const API_VERSION_ORDINAL: Record<ApiVersion, number> = { V1: 0, LEGACY: 1, UNKNOWN: 2 };
export const MODE_ORDINAL: Record<CallMode, number> = { AUTO: 0, GROUP: 1, MANUAL: 2 };

export const DEFAULT_POOL: PoolConfig = { mode: 'AUTO', groupIds: [], manualId: null, groupCursor: 0, manualFailCount: 0 };
export const DEFAULT_SYNTH: SynthSettings = { rate: 0, pitch: 0, voice: '' };
export const DEFAULT_APP_PREFS: AppPrefs = {
  probeConcurrency: 4,
  theme: 'system',
  playbackRate: 1,
  volume: 100,
  failThreshold: 3,
  cooldownMinutes: 10,
  autoTestOnLaunch: false,
  sleepMinutes: 0,
  resumeLast: true,
};

function pickOption(raw: unknown, options: readonly number[], fallback: number): number {
  return typeof raw === 'number' && options.includes(raw) ? raw : fallback;
}

function pickBool(raw: unknown, fallback: boolean): boolean {
  return typeof raw === 'boolean' ? raw : fallback;
}

export function normalizeAppPrefs(raw: unknown): AppPrefs {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<AppPrefs>;
  return {
    probeConcurrency:
      typeof o.probeConcurrency === 'number' && o.probeConcurrency >= 1 && o.probeConcurrency <= 8
        ? o.probeConcurrency
        : DEFAULT_APP_PREFS.probeConcurrency,
    theme: o.theme === 'light' || o.theme === 'dark' || o.theme === 'system'
      ? o.theme
      : DEFAULT_APP_PREFS.theme,
    playbackRate:
      typeof o.playbackRate === 'number' && o.playbackRate >= 0.5 && o.playbackRate <= 2
        ? o.playbackRate
        : DEFAULT_APP_PREFS.playbackRate,
    volume:
      typeof o.volume === 'number' && o.volume >= 0 && o.volume <= 100
        ? o.volume
        : DEFAULT_APP_PREFS.volume,
    failThreshold: pickOption(o.failThreshold, FAIL_THRESHOLD_OPTIONS, DEFAULT_APP_PREFS.failThreshold),
    cooldownMinutes: pickOption(o.cooldownMinutes, COOLDOWN_MINUTES_OPTIONS, DEFAULT_APP_PREFS.cooldownMinutes),
    autoTestOnLaunch: pickBool(o.autoTestOnLaunch, DEFAULT_APP_PREFS.autoTestOnLaunch),
    sleepMinutes: pickOption(o.sleepMinutes, SLEEP_MINUTES_OPTIONS, DEFAULT_APP_PREFS.sleepMinutes),
    resumeLast: pickBool(o.resumeLast, DEFAULT_APP_PREFS.resumeLast),
  };
}

export function normalizeSynth(raw: unknown): SynthSettings {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<SynthSettings>;
  const clamp = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v)
      ? Math.max(-100, Math.min(100, Math.round(v)))
      : fallback;
  return {
    voice: typeof o.voice === 'string' ? o.voice : '',
    rate: clamp(o.rate, 0),
    pitch: clamp(o.pitch, 0),
  };
}

export function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  return c?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function defaultShare(port = 8787): ShareConfig {
  return { enabled: false, port, token: newId(), localhostOnly: false };
}

export function isCoolingDown(node: TtsNode, now: number): boolean {
  return node.cooldownUntil > now;
}

export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

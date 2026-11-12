import { create } from 'zustand';
import {
  DEFAULT_APP_PREFS, DEFAULT_POOL, DEFAULT_SYNTH,
  normalizeAppPrefs, normalizeSynth,
  type AppPrefs, type PoolConfig, type SynthSettings,
} from '../types/models';
import { mirrorPrefs } from '../lib/theme';
import { deps } from './deps';
import { usePlayerStore } from './playerStore';
import { useResumeStore } from './resumeStore';

interface SettingsState {
  synth: SynthSettings;
  pool: PoolConfig;
  appPrefs: AppPrefs;
  loaded: boolean;
  load(): Promise<void>;
  saveSynth(s: SynthSettings): Promise<void>;
  updatePool(fn: (c: PoolConfig) => PoolConfig): Promise<void>;
  saveAppPrefs(p: AppPrefs): Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  synth: DEFAULT_SYNTH,
  pool: DEFAULT_POOL,
  appPrefs: DEFAULT_APP_PREFS,
  loaded: false,
  async load() {
    const s = deps().settings;
    set({
      synth: normalizeSynth(await s.getJson('synth_settings', DEFAULT_SYNTH)),
      pool: await s.getJson('pool_config', DEFAULT_POOL),
      appPrefs: normalizeAppPrefs(await s.getJson<Partial<AppPrefs>>('app_prefs', {})),
      loaded: true,
    });
    const prefs = get().appPrefs;
    mirrorPrefs({ theme: prefs.theme, palette: prefs.palette });
  },
  async saveSynth(synth) {
    set({ synth });
    await deps().settings.setJson('synth_settings', synth);
  },
  async updatePool(fn) {
    const pool = fn(get().pool);
    set({ pool });
    await deps().settings.setJson('pool_config', pool);
  },
  async saveAppPrefs(appPrefs) {
    set({ appPrefs });
    mirrorPrefs({ theme: appPrefs.theme, palette: appPrefs.palette });
    usePlayerStore.getState().setDefaultSleepMinutes(appPrefs.sleepMinutes);
    await deps().settings.setJson('app_prefs', appPrefs);
    if (!appPrefs.resumeLast) await useResumeStore.getState().clear();
  },
}));

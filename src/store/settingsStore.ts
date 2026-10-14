import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import {
  DEFAULT_APP_PREFS, DEFAULT_POOL, DEFAULT_SYNTH, defaultShare,
  type AppPrefs, type PoolConfig, type ShareConfig, type SynthSettings,
} from '../types/models';
import { deps } from './deps';
import { notifyShare } from './shareSync';

interface SettingsState {
  synth: SynthSettings;
  pool: PoolConfig;
  share: ShareConfig;
  appPrefs: AppPrefs;
  loaded: boolean;
  load(): Promise<void>;
  saveSynth(s: SynthSettings): Promise<void>;
  updatePool(fn: (c: PoolConfig) => PoolConfig): Promise<void>;
  saveShare(s: ShareConfig): Promise<void>;
  saveAppPrefs(p: AppPrefs): Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  synth: DEFAULT_SYNTH,
  pool: DEFAULT_POOL,
  share: defaultShare(),
  appPrefs: DEFAULT_APP_PREFS,
  loaded: false,
  async load() {
    const s = deps().settings;
    set({
      synth: await s.getJson('synth_settings', DEFAULT_SYNTH),
      pool: await s.getJson('pool_config', DEFAULT_POOL),
      share: await s.getJson('share_config', defaultShare()),
      appPrefs: await s.getJson('app_prefs', DEFAULT_APP_PREFS),
      loaded: true,
    });
  },
  async saveSynth(synth) {
    set({ synth });
    await deps().settings.setJson('synth_settings', synth);
  },
  async updatePool(fn) {
    const pool = fn(get().pool);
    set({ pool });
    await deps().settings.setJson('pool_config', pool);
    await notifyShare();
  },
  async saveShare(share) {
    set({ share });
    await deps().settings.setJson('share_config', share);
    try {
      await invoke('share_set_token', { token: share.token });
    } catch (e) {
      console.warn('分享 token 同步失败', e);
    }
    await notifyShare();
  },
  async saveAppPrefs(appPrefs) {
    set({ appPrefs });
    await deps().settings.setJson('app_prefs', appPrefs);
  },
}));

import type { usePlayerStore } from '../store/playerStore';

type PlayerApi = typeof usePlayerStore;

export function bindMediaSession(store: PlayerApi): void {
  if (!('mediaSession' in navigator)) return;
  const ms = navigator.mediaSession;
  try {
    ms.setActionHandler('play', () => { void store.getState().resume(); });
    ms.setActionHandler('pause', () => store.getState().pause());
    ms.setActionHandler('stop', () => store.getState().stop());
    ms.setActionHandler('nexttrack', () => store.getState().skipNext());
  } catch {
    /* 部分平台不支持的 action 忽略 */
  }
  let last = '';
  store.subscribe((s) => {
    const key = `${s.status}|${s.index}|${s.segs.length}`;
    if (key === last) return;
    last = key;
    ms.playbackState = s.status === 'running' ? 'playing' : s.status === 'paused' ? 'paused' : 'none';
    if (s.segs.length > 0) {
      try {
        ms.metadata = new MediaMetadata({
          title: `TTS Aggregator · 第 ${Math.min(s.index + 1, s.segs.length)}/${s.segs.length} 段`,
          artist: 'TTS Aggregator',
        });
      } catch {
        /* MediaMetadata 不可用忽略 */
      }
    }
  });
}

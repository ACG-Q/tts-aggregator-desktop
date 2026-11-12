import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { createApi } from './lib/api';
import { createBooksRepo, createLogsRepo, createNodesRepo, createSettingsRepo, openDb } from './lib/db';
import { setDeps } from './store/deps';
import { useNodesStore } from './store/nodesStore';
import { useSettingsStore } from './store/settingsStore';
import { useVoicesStore } from './store/voicesStore';
import { synthesizeText } from './store/poolDeps';
import { usePlayerStore } from './store/playerStore';
import { useResumeStore } from './store/resumeStore';
import { useNowPlayingStore } from './store/nowPlayingStore';
import type { PlaybackSnapshot } from './lib/snapshot';
import { bindMediaSession } from './lib/mediaSession';

async function bootstrap() {
  const db = await openDb();
  setDeps({
    db,
    api: createApi(),
    nodes: createNodesRepo(db),
    logs: createLogsRepo(db),
    settings: createSettingsRepo(db),
    books: createBooksRepo(db),
  });
  await useSettingsStore.getState().load();
  await useResumeStore.getState().load();
  await useNodesStore.getState().load();
  await useVoicesStore.getState().initCache();
  const bootPrefs = useSettingsStore.getState().appPrefs;
  usePlayerStore.getState().initPlayback(bootPrefs.volume, bootPrefs.playbackRate);
  usePlayerStore.getState().setDefaultSleepMinutes(bootPrefs.sleepMinutes);
  usePlayerStore.getState().setSnapshotSink((d) => {
    if (!useSettingsStore.getState().appPrefs.resumeLast) return;
    const now = useNowPlayingStore.getState().current;
    const snapshot: PlaybackSnapshot = {
      version: 1,
      source: d.source,
      segIndex: d.segIndex,
      text: d.source.kind === 'text' ? d.text : '',
      updatedAt: Date.now(),
    };
    if (d.source.kind === 'book' && now && now.bookId === d.source.bookId) {
      snapshot.bookTitle = now.title;
      snapshot.chapterTitle = now.chapterTitle;
      snapshot.chapterCount = now.chapterCount;
    }
    if (d.finished) {
      void useResumeStore.getState().clear();
      return;
    }
    void useResumeStore.getState().save(snapshot);
  });
  bindMediaSession(usePlayerStore);
  usePlayerStore.getState().setSynth(async (text) => {
    const result = await synthesizeText(text);
    return result.bytes;
  });
  if (bootPrefs.autoTestOnLaunch) {
    void useNodesStore.getState().probeAll();
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

bootstrap().catch((e) => {
  console.error(e);
  document.body.innerHTML = `<pre style="padding:24px">启动失败：${String(e)}</pre>`;
});

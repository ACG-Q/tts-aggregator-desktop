import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import { createApi } from './lib/api';
import { createLogsRepo, createNodesRepo, createSettingsRepo, openDb } from './lib/db';
import { setDeps } from './store/deps';
import { setShareProvider } from './store/shareSync';
import { useNodesStore } from './store/nodesStore';
import { useSettingsStore } from './store/settingsStore';
import { useVoicesStore } from './store/voicesStore';
import { synthesizeText } from './store/poolDeps';
import { usePlayerStore } from './store/playerStore';

async function bootstrap() {
  const db = await openDb();
  setDeps({
    db,
    api: createApi(),
    nodes: createNodesRepo(db),
    logs: createLogsRepo(db),
    settings: createSettingsRepo(db),
  });
  await useSettingsStore.getState().load();
  await useNodesStore.getState().load();
  await useVoicesStore.getState().initCache();
  setShareProvider(() => ({
    nodes: useNodesStore.getState().nodes,
    pool: useSettingsStore.getState().pool,
    share: useSettingsStore.getState().share,
  }));
  usePlayerStore.getState().setSynth(async (text) => {
    const result = await synthesizeText(text);
    return result.bytes;
  });
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

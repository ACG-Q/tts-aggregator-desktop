import { useRef, useState } from 'react';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { decodeTextBuffer } from '../lib/encoding';
import { buildBaseUrl, dedupeByBaseUrl, rankRelevance, type HostRecord } from '../lib/importers/hosts';
import { parseFofaCsv, parseFofaJson } from '../lib/importers/fofa-file';
import { searchFofa, searchZoomeye } from '../lib/importers/search';
import { parseZoomeyeJson } from '../lib/importers/zoomeye-file';
import { deps } from '../store/deps';
import { useNodesStore } from '../store/nodesStore';

type Tab = 'fofa-file' | 'zoomeye-file' | 'fofa-api' | 'zoomeye-api';
const TABS: [Tab, string][] = [
  ['fofa-file', 'FOFA 文件'], ['zoomeye-file', 'ZoomEye 文件'],
  ['fofa-api', 'FOFA 搜索'], ['zoomeye-api', 'ZoomEye 搜索'],
];

export function ImportPanel() {
  const [tab, setTab] = useState<Tab>('fofa-file');
  const [records, setRecords] = useState<HostRecord[] | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fofa, setFofa] = useState({ email: '', key: '', query: 'title="tts" || title="speech"', size: 100 });
  const [ze, setZe] = useState({ apiKey: '', query: 'tts', page: 1 });
  const fileRef = useRef<HTMLInputElement>(null);

  function accept(list: HostRecord[]): void {
    const deduped = dedupeByBaseUrl(list);
    setRecords(deduped);
    setErr(null);
    const on = new Set<number>();
    deduped.forEach((r, i) => { if (rankRelevance(r) > 0) on.add(i); });
    setChecked(on);
  }

  async function onFilePicked(file: File): Promise<void> {
    try {
      const text = await decodeTextBuffer(await file.arrayBuffer());
      const list = tab === 'zoomeye-file' ? parseZoomeyeJson(text)
        : file.name.toLowerCase().endsWith('.json') ? parseFofaJson(text)
          : parseFofaCsv(text);
      accept(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setRecords(null);
    }
  }

  async function runApiSearch(): Promise<void> {
    setBusy(true);
    try {
      const list = tab === 'fofa-api'
        ? await searchFofa((u, i) => tauriFetch(u, i), { ...fofa, size: Math.min(500, fofa.size) })
        : await searchZoomeye((u, i) => tauriFetch(u, i), ze);
      accept(list);
      await deps().settings.setJson(
        tab === 'fofa-api' ? 'fofa_credentials' : 'zoomeye_credentials',
        tab === 'fofa-api' ? { ...fofa } : { ...ze },
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setRecords(null);
    } finally {
      setBusy(false);
    }
  }

  async function doImport(): Promise<void> {
    if (!records) return;
    const chosen = records.filter((_, i) => checked.has(i));
    if (chosen.length === 0) { setErr('未勾选任何记录'); return; }
    setBusy(true);
    try {
      await useNodesStore.getState().importRecords(
        chosen.map((r) => ({ baseUrl: buildBaseUrl(r), label: r.title || r.ip })),
        tab.startsWith('fofa') ? 'fofa' : 'zoomeye',
      );
      setRecords(null);
      setChecked(new Set());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="tabs">
        {TABS.map(([t, label]) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => { setTab(t); setRecords(null); setErr(null); }}>
            {label}
          </button>
        ))}
      </div>

      {tab.endsWith('-file') && (
        <div className="row">
          <button className="btn" onClick={() => fileRef.current?.click()}>选择文件</button>
          <span className="muted">支持 FOFA 导出的 CSV/JSON、ZoomEye 导出的 JSON</span>
          <input ref={fileRef} type="file" accept=".csv,.json" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFilePicked(f); e.target.value = ''; }} />
        </div>
      )}

      {tab === 'fofa-api' && (
        <div className="row">
          <input className="input" placeholder="email" value={fofa.email} onChange={(e) => setFofa({ ...fofa, email: e.target.value })} />
          <input className="input" placeholder="api key" value={fofa.key} onChange={(e) => setFofa({ ...fofa, key: e.target.value })} />
          <input className="input grow" placeholder="查询语法" value={fofa.query} onChange={(e) => setFofa({ ...fofa, query: e.target.value })} />
          <button className="btn primary" disabled={busy} onClick={() => void runApiSearch()}>{busy ? '搜索中…' : '搜索'}</button>
        </div>
      )}

      {tab === 'zoomeye-api' && (
        <div className="row">
          <input className="input" placeholder="API-KEY" value={ze.apiKey} onChange={(e) => setZe({ ...ze, apiKey: e.target.value })} />
          <input className="input grow" placeholder="关键词" value={ze.query} onChange={(e) => setZe({ ...ze, query: e.target.value })} />
          <button className="btn primary" disabled={busy} onClick={() => void runApiSearch()}>{busy ? '搜索中…' : '搜索'}</button>
        </div>
      )}

      {err && <div className="muted" style={{ color: 'var(--danger)', marginTop: 8 }}>{err}</div>}

      {records && records.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="row between" style={{ marginBottom: 6 }}>
            <span className="muted">命中 {records.length} 条，已勾选 {checked.size} 条（含 tts/speech/voice 关键词的默认勾选）</span>
            <div className="row">
              <button className="btn" onClick={() => setChecked(new Set(records.map((_, i) => i)))}>全选</button>
              <button className="btn" onClick={() => setChecked(new Set())}>全不选</button>
              <button className="btn primary" disabled={busy || checked.size === 0} onClick={() => void doImport()}>
                {busy ? '导入中…' : `导入 ${checked.size} 条并探测`}
              </button>
            </div>
          </div>
          <div className="seg-list">
            {records.map((r, i) => (
              <label key={i} className="seg row" style={{ gap: 8 }}>
                <input type="checkbox" checked={checked.has(i)}
                  onChange={() => {
                    const next = new Set(checked);
                    if (next.has(i)) next.delete(i); else next.add(i);
                    setChecked(next);
                  }} />
                <span className="mono">{r.ip}:{r.port}</span>
                <span className="grow">{r.title || '—'}</span>
                {rankRelevance(r) > 0 && <span className="badge ok">TTS 相关</span>}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

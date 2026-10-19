import { useRef, useState } from 'react';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { Check, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { decodeTextBuffer } from '@/lib/encoding';
import { buildBaseUrl, dedupeByBaseUrl, rankRelevance, type HostRecord } from '@/lib/importers/hosts';
import { parseFofaCsv, parseFofaJson } from '@/lib/importers/fofa-file';
import { searchFofa, searchZoomeye } from '@/lib/importers/search';
import { parseZoomeyeJson } from '@/lib/importers/zoomeye-file';
import { deps } from '@/store/deps';
import { useNodesStore } from '@/store/nodesStore';

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
    <Card>
      <CardContent className="space-y-3 pt-6">
        <Tabs value={tab} onValueChange={(v) => { setTab(v as Tab); setRecords(null); setErr(null); }}>
          <TabsList>
            {TABS.map(([t, label]) => (
              <TabsTrigger key={t} value={t}>{label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {tab.endsWith('-file') && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-1 h-4 w-4" />
              选择文件
            </Button>
            <span className="text-sm text-muted-foreground">支持 FOFA 导出的 CSV/JSON、ZoomEye 导出的 JSON</span>
            <input ref={fileRef} type="file" accept=".csv,.json" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFilePicked(f); e.target.value = ''; }} />
          </div>
        )}

        {tab === 'fofa-api' && (
          <div className="flex gap-2">
            <Input placeholder="email" aria-label="FOFA email" value={fofa.email} onChange={(e) => setFofa({ ...fofa, email: e.target.value })} />
            <Input placeholder="api key" aria-label="FOFA api key" value={fofa.key} onChange={(e) => setFofa({ ...fofa, key: e.target.value })} />
            <Input placeholder="查询语法" aria-label="FOFA 查询语法" className="grow" value={fofa.query} onChange={(e) => setFofa({ ...fofa, query: e.target.value })} />
            <Button disabled={busy} onClick={() => void runApiSearch()}>{busy ? '搜索中…' : '搜索'}</Button>
          </div>
        )}

        {tab === 'zoomeye-api' && (
          <div className="flex gap-2">
            <Input placeholder="API-KEY" aria-label="ZoomEye API-KEY" value={ze.apiKey} onChange={(e) => setZe({ ...ze, apiKey: e.target.value })} />
            <Input placeholder="关键词" aria-label="ZoomEye 关键词" className="grow" value={ze.query} onChange={(e) => setZe({ ...ze, query: e.target.value })} />
            <Button disabled={busy} onClick={() => void runApiSearch()}>{busy ? '搜索中…' : '搜索'}</Button>
          </div>
        )}

        {err && <div className="text-sm text-destructive">{err}</div>}

        {records && records.length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                命中 {records.length} 条，已勾选 {checked.size} 条（含 tts/speech/voice 关键词的默认勾选）
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setChecked(new Set(records.map((_, i) => i)))}>全选</Button>
                <Button variant="outline" size="sm" onClick={() => setChecked(new Set())}>全不选</Button>
                <Button size="sm" disabled={busy || checked.size === 0} onClick={() => void doImport()}>
                  <Check className="mr-1 h-4 w-4" />
                  {busy ? '导入中…' : `导入 ${checked.size} 条并探测`}
                </Button>
              </div>
            </div>
            <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-2">
              {records.map((r, i) => (
                <label key={i} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent">
                  <Checkbox checked={checked.has(i)}
                    onCheckedChange={() => {
                      const next = new Set(checked);
                      if (next.has(i)) next.delete(i); else next.add(i);
                      setChecked(next);
                    }} />
                  <span className="font-mono text-muted-foreground">{r.ip}:{r.port}</span>
                  <span className="grow truncate">{r.title || '—'}</span>
                  {rankRelevance(r) > 0 && <Badge className="bg-success/15 text-success hover:bg-success/15">TTS 相关</Badge>}
                </label>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ListPlus, Plus, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/PageHeader';
import { parseBatchLines } from '@/lib/batch';
import { useNodesStore } from '@/store/nodesStore';
import { useSettingsStore } from '@/store/settingsStore';
import { isCoolingDown, type CallMode, type TtsNode } from '@/types/models';
import { ImportPanel } from './ImportPanel';

const MODES: [CallMode, string, string][] = [
  ['AUTO', '自动', '按健康度依次尝试，失败自动切换'],
  ['GROUP', '组', '组内轮询，成功后换下一个'],
  ['MANUAL', '手选', '只用选中节点，连败 3 次后停止'],
];

function healthBadge(n: TtsNode) {
  if (n.disabled) return <Badge className="bg-surface-3 text-muted-foreground hover:bg-surface-3">已禁用</Badge>;
  if (isCoolingDown(n, Date.now())) return <Badge className="bg-warning/15 text-warning hover:bg-warning/15">冷却中</Badge>;
  if (n.health === 'OK') return <Badge className="bg-success/15 text-success hover:bg-success/15">正常</Badge>;
  if (n.health === 'FAIL') return <Badge variant="destructive">失败</Badge>;
  return <Badge variant="secondary">未测</Badge>;
}

function Stat({ value, label, sub, tone }: { value: string; label: string; sub: string; tone?: 'success' | 'warning' }) {
  return (
    <div className="rounded-[11px] border border-line bg-card px-4 py-3.5">
      <div className={cn(
        'text-[21px] font-semibold leading-tight tracking-[-0.02em] num',
        tone === 'success' && 'text-success',
        tone === 'warning' && 'text-warning',
      )}>{value}</div>
      <div className="mt-[3px] text-[10.5px] text-muted-foreground">{label}</div>
      <div className="mt-[7px] text-[10.5px] text-faint">{sub}</div>
    </div>
  );
}

const emptyForm = { baseUrl: '', label: '', apiKey: '' };

export function NodesPage() {
  const st = useNodesStore();
  const { pool, updatePool, appPrefs, saveAppPrefs } = useSettingsStore();
  const [showForm, setShowForm] = useState<null | 'add' | 'edit'>(null);
  const [editOrig, setEditOrig] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [deleteFor, setDeleteFor] = useState<TtsNode | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchText, setBatchText] = useState('');
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => { void st.load(); }, []);

  const batch = useMemo(
    () => parseBatchLines(batchText, st.nodes.map((n) => n.baseUrl)),
    [batchText, st.nodes],
  );

  const shown = st.nodes.filter(
    (n) => !q || n.label.includes(q) || n.baseUrl.toLowerCase().includes(q.toLowerCase()),
  );

  const stats = useMemo(() => {
    const now = Date.now();
    const enabled = st.nodes.filter((n) => !n.disabled);
    const healthy = st.nodes.filter((n) => !n.disabled && n.health === 'OK' && !isCoolingDown(n, now));
    const cooling = st.nodes.filter((n) => !n.disabled && isCoolingDown(n, now));
    const disabled = st.nodes.filter((n) => n.disabled).length;
    const untested = st.nodes.filter((n) => !n.disabled && n.health === 'UNKNOWN').length;
    const coolingMin = cooling.length > 0
      ? Math.max(1, Math.ceil((Math.min(...cooling.map((n) => n.cooldownUntil)) - now) / 60000))
      : 0;
    return { enabled: enabled.length, healthy: healthy.length, cooling: cooling.length, disabled, untested, coolingMin };
  }, [st.nodes]);

  function openAdd(): void {
    setForm(emptyForm);
    setEditOrig('');
    setErr(null);
    setShowForm('add');
  }

  function openEdit(n: TtsNode): void {
    setForm({ baseUrl: n.baseUrl, label: n.label, apiKey: n.apiKey ?? '' });
    setEditOrig(n.baseUrl);
    setErr(null);
    setShowForm('edit');
  }

  async function submit(): Promise<void> {
    if (!form.baseUrl.trim()) { setErr('URL 不能为空'); return; }
    setErr(null);
    try {
      if (showForm === 'add') {
        await st.add({ baseUrl: form.baseUrl, label: form.label, apiKey: form.apiKey || null });
      } else {
        const orig = st.nodes.find((n) => n.baseUrl === editOrig);
        if (!orig) throw new Error('节点不存在');
        await st.update(
          { ...orig, baseUrl: form.baseUrl.trim(), label: form.label, apiKey: form.apiKey || null },
          editOrig,
        );
      }
      setShowForm(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Nodes · 节点"
        title="节点池"
        description="管理 TTS 节点、探测健康度，并决定朗读时如何调度。"
        actions={
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
              <Input placeholder="搜索备注 / URL" value={q} onChange={(e) => setQ(e.target.value)}
                className="h-9 w-52 pl-8" />
            </div>
            <Button variant="outline" onClick={() => setBatchOpen(true)}>
              <ListPlus className="mr-1.5 h-4 w-4" />
              批量添加
            </Button>
            <Button onClick={openAdd}>
              <Plus className="mr-1.5 h-4 w-4" />
              添加节点
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat value={String(st.nodes.length)} label="节点总数" sub={`启用 ${stats.enabled} · 禁用 ${stats.disabled}`} />
        <Stat value={String(stats.healthy)} label="健康可用" sub={`占比 ${st.nodes.length ? Math.round((stats.healthy / st.nodes.length) * 100) : 0}%`} tone="success" />
        <Stat value={String(stats.cooling)} label="冷却中" sub={stats.cooling > 0 ? `约 ${stats.coolingMin} 分钟后恢复` : '暂无冷却节点'} tone="warning" />
        <Stat value={String(stats.untested)} label="待探测" sub="点击「全部探测」更新" />
      </div>

      <div className="mb-3.5 grid gap-3 md:grid-cols-[1.5fr_1fr]">
        <div className="rounded-[13px] border border-line bg-card px-4 py-4">
          <div className="mb-2.5 text-[11px] text-muted-foreground">调度模式</div>
          <div className="inline-flex gap-0.5 rounded-[9px] border border-line bg-surface-2 p-[3px]" role="group" aria-label="调度模式">
            {MODES.map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => void updatePool((c) => ({ ...c, mode }))}
                className={cn(
                  'rounded-md px-4 py-1.5 text-[12px] transition-colors',
                  pool.mode === mode
                    ? 'bg-card font-semibold text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2.5 text-[11px] text-faint">
            {MODES.find(([m]) => m === pool.mode)?.[2]}
          </p>
        </div>
        <div className="rounded-[13px] border border-line bg-card px-4 py-4">
          <div className="mb-2.5 text-[11px] text-muted-foreground">探测</div>
          <Button variant="outline" className="w-full" onClick={() => void st.probeAll()} disabled={st.probing}>
            <RefreshCw className={cn('mr-1.5 h-4 w-4', st.probing && 'animate-spin')} />
            {st.probing ? (st.probeProgress ?? '探测中…') : `全部探测 · 并发 ${appPrefs.probeConcurrency}`}
          </Button>
          <div className="mt-3.5 flex items-center justify-between text-[10.5px] text-muted-foreground">
            <span>探测并发</span>
            <Input
              type="number" min={1} max={8} className="h-7 w-16 text-center"
              value={appPrefs.probeConcurrency}
              onChange={(e) => void saveAppPrefs({
                ...appPrefs,
                probeConcurrency: Math.max(1, Math.min(8, Number(e.target.value) || 1)),
              })}
            />
          </div>
        </div>
      </div>

      <div className="mb-3.5">
        <button
          onClick={() => setImportOpen((v) => !v)}
          className="flex w-full items-center gap-2.5 rounded-[11px] border border-dashed border-line-strong px-4 py-2.5 text-left text-[12px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          {importOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          从 FOFA / ZoomEye 导入节点
          <span className="ml-auto text-[10.5px] text-faint">可选</span>
        </button>
        {importOpen && <div className="mt-3"><ImportPanel /></div>}
      </div>

      <div className="overflow-hidden rounded-[13px] border border-line bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-surface-2">
              <TableHead className="pl-[18px]">节点</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>版本 / Key</TableHead>
              <TableHead>音色</TableHead>
              <TableHead className="text-center">组</TableHead>
              <TableHead className="text-center">手选</TableHead>
              <TableHead className="pr-[18px] text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((n) => (
              <TableRow key={n.id}>
                <TableCell className="pl-[18px]">
                  <div className="font-semibold text-[12.5px]">{n.label || '—'}</div>
                  <div className="font-mono text-[10.5px] text-faint">{n.baseUrl}</div>
                </TableCell>
                <TableCell>{healthBadge(n)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline">{n.apiVersion}</Badge>
                    {n.keyless && <span className="text-[10px] text-success">免 Key</span>}
                  </div>
                </TableCell>
                <TableCell className="num">{n.voiceCount || '—'}</TableCell>
                <TableCell className="text-center">
                  <Checkbox
                    checked={pool.groupIds.includes(n.id)}
                    onCheckedChange={() => void updatePool((c) => ({
                      ...c,
                      groupIds: c.groupIds.includes(n.id)
                        ? c.groupIds.filter((x) => x !== n.id)
                        : [...c.groupIds, n.id],
                    }))}
                  />
                </TableCell>
                <TableCell className="text-center">
                  <Checkbox
                    checked={pool.manualId === n.id}
                    onCheckedChange={() => void updatePool((c) => ({ ...c, manualId: n.id, manualFailCount: 0 }))}
                  />
                </TableCell>
                <TableCell className="pr-[18px] text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => void st.reprobe(n)}>测试</Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(n)}>编辑</Button>
                    <Button variant="ghost" size="sm" onClick={() => void st.setDisabled([n.id], !n.disabled)}>
                      {n.disabled ? '启用' : '禁用'}
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteFor(n)}>删除</Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {shown.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-[12px] text-muted-foreground">
                  {st.nodes.length ? '没有匹配的节点' : '还没有节点，点击「添加节点」'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!showForm} onOpenChange={(o) => { if (!o) setShowForm(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{showForm === 'add' ? '添加节点' : '编辑节点'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>节点 URL</Label>
              <Input placeholder="https://tts.example.com" value={form.baseUrl}
                onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>备注名</Label>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>API Key（免 Key 节点留空）</Label>
              <Input type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} />
            </div>
            {err && <div className="text-[12.5px] text-destructive">{err}</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(null)}>取消</Button>
            <Button onClick={() => void submit()}>保存并探测</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={batchOpen} onOpenChange={setBatchOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>批量添加节点</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Textarea
              rows={10}
              placeholder={'每行一条，格式：URL [标签] [API Key]\n（标签和 API Key 可省略，用空格或 Tab 分隔）\n\nhttps://tts.example.com\nhttps://tts2.example.com 我的节点\nhttps://tts3.example.com 备用 sk-abc123'}
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
              className="font-mono text-xs"
            />
            <div className="flex flex-wrap gap-3 text-[11.5px]">
              <span className="text-success">可添加 {batch.items.length} 条</span>
              {batch.duplicates.length > 0 && (
                <span className="text-muted-foreground">重复 {batch.duplicates.length} 条（已忽略）</span>
              )}
              {batch.invalid.length > 0 && (
                <span className="text-destructive">无效 {batch.invalid.length} 行（需以 http:// 或 https:// 开头）</span>
              )}
            </div>
            {batch.invalid.length > 0 && (
              <div className="max-h-24 overflow-y-auto rounded-md border border-destructive/30 bg-destructive/5 p-2 font-mono text-xs text-destructive">
                {batch.invalid.map((l, i) => <div key={i}>{l}</div>)}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchOpen(false)}>取消</Button>
            <Button
              disabled={batch.items.length === 0}
              onClick={() => {
                void st.importRecords(
                  batch.items.map((i) => ({ baseUrl: i.baseUrl, label: i.label, apiKey: i.apiKey })),
                  'manual',
                ).then(() => {
                  toast.success(`已添加 ${batch.items.length} 个节点，正在探测`);
                  setBatchText('');
                  setBatchOpen(false);
                });
              }}
            >
              添加 {batch.items.length} 条并探测
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteFor} onOpenChange={(o) => { if (!o) setDeleteFor(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除 {deleteFor?.baseUrl}？</AlertDialogTitle>
            <AlertDialogDescription>节点及其探测状态将被删除，可通过重新导入恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteFor) void st.remove([deleteFor.id]); }}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

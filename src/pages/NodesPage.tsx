import { useEffect, useState } from 'react';
import { Plus, RefreshCw, Search } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
  if (n.disabled) return <Badge className="bg-muted text-muted-foreground hover:bg-muted">已禁用</Badge>;
  if (isCoolingDown(n, Date.now())) return <Badge className="bg-warning/20 text-warning hover:bg-warning/20">冷却中</Badge>;
  if (n.health === 'OK') return <Badge className="bg-success/15 text-success hover:bg-success/15">正常</Badge>;
  if (n.health === 'FAIL') return <Badge variant="destructive">失败</Badge>;
  return <Badge variant="secondary">未测</Badge>;
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

  useEffect(() => { void st.load(); }, []);

  const shown = st.nodes.filter(
    (n) => !q || n.label.includes(q) || n.baseUrl.toLowerCase().includes(q.toLowerCase()),
  );

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
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">节点</h1>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 pt-6">
          <Button onClick={openAdd}>
            <Plus className="mr-1 h-4 w-4" />
            添加节点
          </Button>
          <Button variant="outline" onClick={() => void st.probeAll()} disabled={st.probing}>
            <RefreshCw className="mr-1 h-4 w-4" />
            {st.probing ? (st.probeProgress ?? '探测中…') : '全部探测'}
          </Button>
          <span className="text-sm text-muted-foreground">共 {st.nodes.length} 个</span>
          <div className="ml-auto flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input placeholder="搜索备注 / URL" value={q} onChange={(e) => setQ(e.target.value)} className="w-56" />
            <Label className="text-xs text-muted-foreground">探测并发</Label>
            <Input
              type="number" min={1} max={8} className="w-16"
              value={appPrefs.probeConcurrency}
              onChange={(e) => void saveAppPrefs({
                ...appPrefs,
                probeConcurrency: Math.max(1, Math.min(8, Number(e.target.value) || 1)),
              })}
            />
          </div>
        </CardContent>
      </Card>

      <ImportPanel />

      <Card>
        <CardContent className="pt-6">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {MODES.map(([mode, label, desc]) => (
              <Button
                key={mode}
                variant={pool.mode === mode ? 'default' : 'outline'}
                size="sm"
                title={desc}
                onClick={() => void updatePool((c) => ({ ...c, mode }))}
              >
                {label}
              </Button>
            ))}
            <span className="text-sm text-muted-foreground">{MODES.find(([m]) => m === pool.mode)?.[2]}</span>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>状态</TableHead>
                <TableHead>节点</TableHead>
                <TableHead>API</TableHead>
                <TableHead>音色</TableHead>
                <TableHead>组</TableHead>
                <TableHead>手选</TableHead>
                <TableHead>来源</TableHead>
                <TableHead className="w-64">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((n) => (
                <TableRow key={n.id}>
                  <TableCell>{healthBadge(n)}</TableCell>
                  <TableCell>
                    <div className="font-medium">{n.label || '—'}</div>
                    <div className="font-mono text-xs text-muted-foreground">{n.baseUrl}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Badge variant="outline">{n.apiVersion}</Badge>
                      {n.keyless && <Badge className="bg-success/15 text-success hover:bg-success/15">免Key</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>{n.voiceCount || '—'}</TableCell>
                  <TableCell>
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
                  <TableCell>
                    <Checkbox
                      checked={pool.manualId === n.id}
                      onCheckedChange={() => void updatePool((c) => ({ ...c, manualId: n.id, manualFailCount: 0 }))}
                    />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{n.source}</TableCell>
                  <TableCell>
                    <div className="flex flex-nowrap gap-1">
                      <Button variant="outline" size="sm" onClick={() => void st.reprobe(n)}>测试</Button>
                      <Button variant="outline" size="sm" onClick={() => openEdit(n)}>编辑</Button>
                      <Button variant="outline" size="sm" onClick={() => void st.setDisabled([n.id], !n.disabled)}>
                        {n.disabled ? '启用' : '禁用'}
                      </Button>
                      <Button variant="outline" size="sm" className="text-destructive" onClick={() => setDeleteFor(n)}>删</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {shown.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    {st.nodes.length ? '没有匹配的节点' : '还没有节点，点击“添加节点”'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
            {err && <div className="text-sm text-destructive">{err}</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(null)}>取消</Button>
            <Button onClick={() => void submit()}>保存并探测</Button>
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

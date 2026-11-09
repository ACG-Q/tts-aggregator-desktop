import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw, Search, Trash2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';
import { fmtLogTime, fmtTimeFull } from '@/lib/format';
import { useLogsStore } from '@/store/logsStore';
import type { LogFilter } from '@/types/models';

const PAGE_SIZE = 100;

const FILTERS: [LogFilter, string][] = [
  ['ALL', '全部'], ['OK', '成功'], ['FAIL', '失败'], ['SWITCH', '切换'],
];

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

export function LogsPage() {
  const { logs, filter, loading, load, clear } = useLogsStore();
  const [page, setPage] = useState(0);
  const [q, setQ] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return logs;
    return logs.filter((l) =>
      l.nodeUrl.toLowerCase().includes(needle)
      || l.textPreview.toLowerCase().includes(needle)
      || (l.error ?? '').toLowerCase().includes(needle)
      || (l.fromNode ?? '').toLowerCase().includes(needle));
  }, [logs, q]);

  const stats = useMemo(() => {
    const ok = logs.filter((l) => l.success).length;
    const fail = logs.length - ok;
    const avg = logs.length > 0
      ? Math.round(logs.reduce((sum, l) => sum + l.latencyMs, 0) / logs.length)
      : 0;
    const p95 = logs.length > 0
      ? [...logs].map((l) => l.latencyMs).sort((a, b) => a - b)[Math.max(0, Math.ceil(logs.length * 0.95) - 1)]
      : 0;
    return { ok, fail, avg, p95, rate: logs.length > 0 ? (ok / logs.length) * 100 : 0 };
  }, [logs]);

  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div>
      <PageHeader
        eyebrow="Logs · 日志"
        title="调用记录"
        description="合成调用的成功、失败与切换记录，用来判断哪个节点更可靠。"
        actions={
          <>
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn('mr-1.5 h-4 w-4', loading && 'animate-spin')} />
              {loading ? '刷新中…' : '刷新'}
            </Button>
            <Button variant="outline" className="text-destructive hover:border-destructive/40 hover:bg-destructive/10"
              onClick={() => setConfirmClear(true)}>
              <Trash2 className="mr-1.5 h-4 w-4" />
              清空
            </Button>
          </>
        }
      />

      <div className="mb-3.5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat value={String(logs.length)} label="当前记录" sub={`筛选：${FILTERS.find(([f]) => f === filter)?.[1] ?? '全部'}`} />
        <Stat value={`${stats.rate.toFixed(1)}%`} label="成功率" sub={`${stats.fail} 次失败`} tone="success" />
        <Stat value={`${stats.avg} ms`} label="平均延迟" sub={`P95 ${stats.p95} ms`} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <div className="inline-flex gap-0.5 rounded-[9px] border border-line bg-surface-2 p-[3px]" role="group" aria-label="日志筛选">
          {FILTERS.map(([f, label]) => (
            <button
              key={f}
              onClick={() => { setPage(0); void load(f); }}
              className={cn(
                'rounded-md px-3.5 py-1.5 text-[12px] transition-colors',
                filter === f
                  ? 'bg-card font-semibold text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
          <Input placeholder="搜索节点 / 内容" className="h-9 w-56 pl-8" value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        </div>
        <span className="ml-auto text-[11.5px] text-faint num">共 {filtered.length} 条</span>
      </div>

      <div className="overflow-hidden rounded-[13px] border border-line bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-surface-2">
              <TableHead className="pl-[18px]">时间</TableHead>
              <TableHead>结果</TableHead>
              <TableHead>节点</TableHead>
              <TableHead>耗时</TableHead>
              <TableHead className="pr-[18px]">内容</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageItems.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="whitespace-nowrap pl-[18px] num text-faint"
                  title={fmtTimeFull(l.time)}>
                  {fmtLogTime(l.time)}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {l.success
                      ? <Badge className="bg-success/15 text-success hover:bg-success/15">成功</Badge>
                      : <Badge variant="destructive">失败</Badge>}
                    {l.triggeredCooldown && <Badge className="bg-warning/15 text-warning hover:bg-warning/15">冷却</Badge>}
                  </div>
                </TableCell>
                <TableCell className="max-w-40 truncate font-mono text-[10.5px] text-faint">{l.nodeUrl}</TableCell>
                <TableCell className="num">{l.latencyMs} ms</TableCell>
                <TableCell className="max-w-xs truncate pr-[18px] text-muted-foreground"
                  title={l.error ?? l.textPreview}>
                  {l.error && (
                    <AlertTriangle className="mr-1 inline h-3.5 w-3.5 -translate-y-px text-destructive" />
                  )}
                  {l.error ? `${l.error} · ` : ''}
                  {l.textPreview}
                  {l.fromNode && <span className="text-faint">（从 {l.fromNode} 切换）</span>}
                </TableCell>
              </TableRow>
            ))}
            {pageItems.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-[12px] text-muted-foreground">
                  {logs.length ? '没有匹配的记录' : '暂无日志'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="pt-3">
        <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />
      </div>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>清空全部日志？</AlertDialogTitle>
            <AlertDialogDescription>所有调用记录将被删除，不可恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void clear()}>清空</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

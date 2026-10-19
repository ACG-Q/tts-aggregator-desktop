import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

export function LogsPage() {
  const { logs, filter, loading, load, clear } = useLogsStore();
  const [page, setPage] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => { void load(); }, []);

  const pageItems = logs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <PageHeader
        title="调用日志"
        description="合成调用的成功 / 失败 / 切换记录。"
        actions={
          <>
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn('mr-1.5 h-4 w-4', loading && 'animate-spin')} />
              {loading ? '刷新中…' : '刷新'}
            </Button>
            <Button variant="outline" className="text-destructive hover:bg-destructive/10"
              onClick={() => setConfirmClear(true)}>
              <Trash2 className="mr-1.5 h-4 w-4" />
              清空
            </Button>
          </>
        }
      />

      {/* 过滤分段控件 */}
      <div className="flex w-fit gap-1 rounded-lg bg-muted p-1">
        {FILTERS.map(([f, label]) => (
          <button
            key={f}
            onClick={() => { setPage(0); void load(f); }}
            className={cn(
              'rounded-md px-4 py-1.5 text-sm transition-colors',
              filter === f
                ? 'bg-card font-medium text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 日志表：关键列 */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="pl-5">时间</TableHead>
              <TableHead>结果</TableHead>
              <TableHead>节点</TableHead>
              <TableHead>耗时</TableHead>
              <TableHead className="pr-5">内容</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageItems.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="whitespace-nowrap pl-5 tabular-nums text-muted-foreground"
                  title={fmtTimeFull(l.time)}>
                  {fmtLogTime(l.time)}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {l.success
                      ? <Badge className="bg-success/15 text-success hover:bg-success/15">成功</Badge>
                      : <Badge variant="destructive">失败</Badge>}
                    {l.triggeredCooldown && <Badge className="bg-warning/20 text-warning hover:bg-warning/20">冷却</Badge>}
                  </div>
                </TableCell>
                <TableCell className="max-w-40 truncate font-mono text-xs text-muted-foreground">{l.nodeUrl}</TableCell>
                <TableCell className="tabular-nums">{l.latencyMs}ms</TableCell>
                <TableCell className="max-w-xs truncate pr-5 text-muted-foreground"
                  title={l.error ?? l.textPreview}>
                  {l.error && (
                    <AlertTriangle className="mr-1 inline h-3.5 w-3.5 -translate-y-px text-destructive" />
                  )}
                  {l.error ? `${l.error} · ` : ''}
                  {l.textPreview}
                  {l.fromNode && <span className="text-muted-foreground">（从 {l.fromNode} 切换）</span>}
                </TableCell>
              </TableRow>
            ))}
            {logs.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">暂无日志</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Pagination page={page} pageSize={PAGE_SIZE} total={logs.length} onPage={setPage} />

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

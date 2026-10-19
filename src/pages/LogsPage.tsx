import { useEffect, useState } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Pagination } from '@/components/Pagination';
import { fmtTimeFull } from '@/lib/format';
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
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">调用日志</h1>

      <Card>
        <CardContent className="flex items-center justify-between pt-6">
          <Tabs value={filter} onValueChange={(v) => { setPage(0); void load(v as LogFilter); }}>
            <TabsList>
              {FILTERS.map(([f, label]) => (
                <TabsTrigger key={f} value={f}>{label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className="mr-1 h-4 w-4" />
              {loading ? '刷新中…' : '刷新'}
            </Button>
            <Button variant="outline" size="sm" className="text-destructive" onClick={() => setConfirmClear(true)}>
              <Trash2 className="mr-1 h-4 w-4" />
              清空
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>时间</TableHead>
                <TableHead>结果</TableHead>
                <TableHead>节点</TableHead>
                <TableHead>模式</TableHead>
                <TableHead>尝试</TableHead>
                <TableHead>耗时</TableHead>
                <TableHead>长度</TableHead>
                <TableHead>内容预览</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{fmtTimeFull(l.time)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {l.success
                        ? <Badge className="bg-success/15 text-success hover:bg-success/15">成功</Badge>
                        : <Badge variant="destructive">失败</Badge>}
                      {l.triggeredCooldown && <Badge className="bg-warning/20 text-warning hover:bg-warning/20">触发冷却</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">{l.nodeUrl}</TableCell>
                  <TableCell>{l.mode}</TableCell>
                  <TableCell>{l.attempt}</TableCell>
                  <TableCell>{l.latencyMs}ms</TableCell>
                  <TableCell>{l.textLen}</TableCell>
                  <TableCell title={l.error ?? undefined} className="max-w-md truncate text-muted-foreground">
                    {l.error ? `⚠ ${l.error} · ` : ''}{l.textPreview}{l.fromNode ? `（从 ${l.fromNode} 切换）` : ''}
                  </TableCell>
                </TableRow>
              ))}
              {logs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">暂无日志</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <Pagination page={page} pageSize={PAGE_SIZE} total={logs.length} onPage={setPage} />
        </CardContent>
      </Card>

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

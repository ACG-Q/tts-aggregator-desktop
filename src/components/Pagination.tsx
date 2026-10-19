import { Button } from '@/components/ui/button';

export function Pagination({ page, pageSize, total, onPage }: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <div className="flex items-center justify-end gap-2 pt-3">
      <span className="text-xs text-muted-foreground">
        第 {page + 1}/{pages} 页 · 共 {total} 条
      </span>
      <Button variant="outline" size="sm" disabled={page <= 0} onClick={() => onPage(page - 1)}>上一页</Button>
      <Button variant="outline" size="sm" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>下一页</Button>
    </div>
  );
}

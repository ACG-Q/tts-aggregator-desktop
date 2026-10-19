import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { BookTocItem } from '@/lib/db';
import { cn } from '@/lib/utils';

export function ChapterTree({ items, currentIdx, onPick }: {
  items: BookTocItem[];
  currentIdx: number | null;
  onPick: (idx: number) => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, BookTocItem[]>();
    for (const it of items) {
      const key = it.volume || '';
      const arr = map.get(key) ?? [];
      arr.push(it);
      map.set(key, arr);
    }
    return [...map.entries()];
  }, [items]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggle(volume: string): void {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(volume)) next.delete(volume);
      else next.add(volume);
      return next;
    });
  }

  if (items.length === 0) {
    return <div className="py-8 text-center text-sm text-muted-foreground">本书没有章节</div>;
  }

  return (
    <div className="space-y-1">
      {groups.map(([volume, chs]) => (
        <div key={volume || '__root'}>
          {volume && (
            <button
              className="flex w-full items-center gap-1 rounded px-2 py-1 text-left text-sm font-medium hover:bg-accent"
              onClick={() => toggle(volume)}
            >
              {collapsed.has(volume)
                ? <ChevronRight className="h-4 w-4" />
                : <ChevronDown className="h-4 w-4" />}
              {volume}
              <span className="ml-auto text-xs text-muted-foreground">{chs.length} 章</span>
            </button>
          )}
          {(!volume || !collapsed.has(volume)) && (
            <ul className={cn('space-y-0.5', volume && 'ml-4')}>
              {chs.map((ch) => (
                <li key={ch.idx}>
                  <button
                    onClick={() => onPick(ch.idx)}
                    className={cn(
                      'w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-accent',
                      currentIdx === ch.idx && 'bg-primary/10 font-medium text-primary',
                    )}
                  >
                    {ch.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

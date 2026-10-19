import { memo, useEffect, useMemo, useRef, useState, type Ref } from 'react';
import { Check, ChevronDown, ChevronRight, Play, Search } from 'lucide-react';
import type { BookTocItem } from '@/lib/db';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

interface RowProps {
  item: BookTocItem;
  isCurrent: boolean;
  isDone: boolean;
  onPick: (idx: number) => void;
  innerRef?: Ref<HTMLLIElement>;
}

const ChapterRow = memo(function ChapterRow({ item, isCurrent, isDone, onPick, innerRef }: RowProps) {
  return (
    <li ref={innerRef}>
      <button
        onClick={() => onPick(item.idx)}
        className={cn(
          'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent',
          isCurrent && 'bg-primary/10 font-medium text-primary',
          isDone && !isCurrent && 'text-muted-foreground',
        )}
      >
        {isCurrent
          ? <Play className="h-3.5 w-3.5 shrink-0" />
          : isDone
            ? <Check className="h-3.5 w-3.5 shrink-0 text-success" />
            : <span className="w-3.5 shrink-0 text-center text-xs text-muted-foreground">{item.idx + 1}</span>}
        <span className="truncate">{item.title}</span>
      </button>
    </li>
  );
});

export function ChapterTree({ items, currentIdx, lastChapter, onPick }: {
  items: BookTocItem[];
  currentIdx: number | null;
  lastChapter: number;
  onPick: (idx: number) => void;
}) {
  const [q, setQ] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const currentRef = useRef<HTMLLIElement>(null);

  const filtered = useMemo(() => {
    const needle = q.trim();
    if (!needle) return items;
    return items.filter((it) => it.title.includes(needle) || it.volume.includes(needle));
  }, [items, q]);

  const groups = useMemo(() => {
    const map = new Map<string, BookTocItem[]>();
    for (const it of filtered) {
      const key = it.volume || '';
      const arr = map.get(key) ?? [];
      arr.push(it);
      map.set(key, arr);
    }
    return [...map.entries()];
  }, [filtered]);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest' });
  }, [currentIdx]);

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
    <div className="flex min-h-0 flex-col gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="搜索章节"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {groups.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">没有匹配的章节</div>
        )}
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
                <span className="truncate">{volume}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">{chs.length} 章</span>
              </button>
            )}
            {(!volume || !collapsed.has(volume)) && (
              <ul className={cn('space-y-0.5', volume && 'ml-4')}>
                {chs.map((ch) => (
                  <ChapterRow
                    key={ch.idx}
                    item={ch}
                    isCurrent={currentIdx === ch.idx}
                    isDone={ch.idx < lastChapter}
                    onPick={onPick}
                    innerRef={currentIdx === ch.idx ? currentRef : undefined}
                  />
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

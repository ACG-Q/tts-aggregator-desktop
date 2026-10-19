import { cn } from '@/lib/utils';
import { usePlayerStore } from '@/store/playerStore';

export function SegmentList() {
  const { segs, index } = usePlayerStore();
  if (segs.length === 0) return null;
  return (
    <div className="max-h-80 overflow-y-auto rounded-md border">
      {segs.map((seg, i) => (
        <button
          key={i}
          onClick={() => usePlayerStore.getState().jumpTo(i)}
          className={cn(
            'flex w-full gap-2 border-b px-3 py-1.5 text-left text-sm last:border-b-0 hover:bg-accent',
            i === index && 'bg-primary/10',
            seg.status === 'playing' && 'text-primary',
            seg.status === 'error' && 'text-destructive',
            seg.status === 'done' && 'text-muted-foreground',
          )}
        >
          <span className="w-8 shrink-0 text-right text-xs text-muted-foreground">{i + 1}</span>
          <span className="truncate">{seg.text}</span>
        </button>
      ))}
    </div>
  );
}

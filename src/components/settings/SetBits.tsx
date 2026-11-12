import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Switch({ checked, onCheckedChange, label }: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative h-[22px] w-[38px] shrink-0 rounded-full border transition-colors',
        checked ? 'border-primary/60 bg-primary/80' : 'border-line-strong bg-surface-3',
      )}
    >
      <span
        className={cn(
          'absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow-sm transition-[left]',
          checked ? 'left-[17px]' : 'left-[3px]',
        )}
      />
    </button>
  );
}

export function SetCard({ title, children, danger }: { title: string; children: ReactNode; danger?: boolean }) {
  return (
    <div className="mb-3.5 rounded-[13px] border border-line bg-card px-[18px] py-1">
      <div className={cn('pb-0.5 pt-3.5 text-[12px] font-semibold', danger && 'text-destructive')}>
        {title}
      </div>
      {children}
    </div>
  );
}

export function SetRow({ title, desc, control, stacked }: {
  title: string;
  desc: string;
  control: ReactNode;
  stacked?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex gap-6 border-t border-line py-[15px] first-of-type:border-t-0',
        stacked ? 'flex-col' : 'items-center justify-between',
      )}
    >
      <div className="min-w-0">
        <b className="block text-[12.5px] font-semibold">{title}</b>
        <span className="mt-[3px] block text-[10.5px] text-muted-foreground">{desc}</span>
      </div>
      <div className={cn('flex shrink-0 items-center gap-2.5', stacked && 'w-full')}>{control}</div>
    </div>
  );
}

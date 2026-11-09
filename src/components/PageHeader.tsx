import type { ReactNode } from 'react';

export function PageHeader({ title, eyebrow, description, actions }: {
  title: string;
  eyebrow?: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4 md:gap-6">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="text-[27px] font-semibold leading-tight tracking-[-0.02em]">{title}</h1>
        {description && (
          <p className="mt-2 max-w-[580px] text-[13px] text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

import { useEffect, useMemo, useRef } from 'react';
import { sentenceIndexAt, splitSentences } from '@/lib/sentences';
import { cn } from '@/lib/utils';

interface Props {
  text: string;
  progress: number;
  className?: string;
}

export function SentenceText({ text, progress, className }: Props) {
  const sentences = useMemo(() => splitSentences(text), [text]);
  const active = sentenceIndexAt(progress, sentences);
  const activeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (sentences.length === 0) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={className}>
      {sentences.map((s, i) => (
        <span
          key={s.start}
          ref={i === active ? activeRef : undefined}
          className={cn(
            'rounded px-0.5 transition-colors',
            i === active && 'bg-primary text-primary-foreground',
            i < active && 'text-muted-foreground',
          )}
        >
          {s.text}
        </span>
      ))}
    </span>
  );
}

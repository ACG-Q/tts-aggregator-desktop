import type { PlaySource } from '../types/models';

export interface PlaybackSnapshot {
  version: 1;
  source: PlaySource;
  segIndex: number;
  text: string;
  bookTitle?: string;
  chapterTitle?: string;
  chapterCount?: number;
  updatedAt: number;
}

function isSource(v: unknown): v is PlaySource {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  if (o.kind === 'text') return true;
  return o.kind === 'book'
    && typeof o.bookId === 'string' && o.bookId.length > 0
    && typeof o.chapterIdx === 'number' && Number.isInteger(o.chapterIdx) && o.chapterIdx >= 0;
}

export function parseSnapshot(raw: unknown): PlaybackSnapshot | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) return null;
  if (!isSource(o.source)) return null;
  if (typeof o.segIndex !== 'number' || !Number.isInteger(o.segIndex) || o.segIndex < 0) return null;
  if (typeof o.text !== 'string') return null;
  if (o.source.kind === 'text' && o.text.length === 0) return null;
  if (typeof o.updatedAt !== 'number' || !Number.isFinite(o.updatedAt)) return null;
  return {
    version: 1,
    source: o.source,
    segIndex: o.segIndex,
    text: o.text,
    bookTitle: typeof o.bookTitle === 'string' ? o.bookTitle : undefined,
    chapterTitle: typeof o.chapterTitle === 'string' ? o.chapterTitle : undefined,
    chapterCount: typeof o.chapterCount === 'number' ? o.chapterCount : undefined,
    updatedAt: o.updatedAt,
  };
}

export function parseSnapshotJson(raw: string | null): PlaybackSnapshot | null {
  if (!raw) return null;
  try {
    return parseSnapshot(JSON.parse(raw));
  } catch {
    return null;
  }
}

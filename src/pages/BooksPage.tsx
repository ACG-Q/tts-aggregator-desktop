import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, History, Play, Upload, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { readTextFile } from '@/lib/encoding';
import { parseToc } from '@/lib/toc';
import { playChapter } from '@/store/bookPlay';
import { deps } from '@/store/deps';
import { useResumeStore } from '@/store/resumeStore';
import { useSettingsStore } from '@/store/settingsStore';
import type { Book } from '@/types/models';

const COVER_PALETTE: [string, string][] = [
  ['#43604d', '#24362c'],
  ['#4a5568', '#262d38'],
  ['#7a5145', '#3d2a26'],
  ['#3f6662', '#223835'],
  ['#7a6848', '#3d3424'],
  ['#5c4657', '#302531'],
];

function coverColors(title: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < title.length; i += 1) hash = (hash * 31 + title.charCodeAt(i)) % 997;
  return COVER_PALETTE[hash % COVER_PALETTE.length];
}

function bookPct(book: Book): number {
  return book.chapterCount > 0 ? Math.round((book.lastChapter / book.chapterCount) * 100) : 0;
}

function BookCard({ book, onOpen, onPlay }: {
  book: Book;
  onOpen: () => void;
  onPlay: () => void;
}) {
  const hasProgress = book.lastChapter > 0 || book.lastSegment > 0;
  const pct = bookPct(book);
  const [c1, c2] = coverColors(book.title);

  return (
    <div
      role="button"
      tabIndex={0}
      className="group cursor-pointer overflow-hidden rounded-[13px] border border-line bg-card transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div
        className="relative flex h-[146px] items-end overflow-hidden p-[13px]"
        style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 90% at 100% 0%, rgba(255,255,255,.13), transparent 55%), repeating-linear-gradient(115deg, rgba(255,255,255,.035) 0 1px, transparent 1px 9px)',
          }}
        />
        <div className="relative z-[1] text-[34px] font-semibold leading-none tracking-[-0.03em] text-white/82 [text-shadow:0_2px_16px_rgba(0,0,0,.22)]">
          {book.title.slice(0, 1) || '书'}
        </div>
        <span className="absolute right-2.5 top-2.5 z-[1] inline-flex h-5 items-center rounded-full bg-[rgba(10,14,10,.32)] px-2 text-[9.5px] text-white/78 backdrop-blur-md">
          {book.chapterCount} 章
        </span>
        <button
          type="button"
          aria-label={hasProgress ? '继续播放' : '从头播放'}
          title={hasProgress ? '继续播放' : '从头播放'}
          onClick={(e) => { e.stopPropagation(); onPlay(); }}
          className="absolute bottom-2.5 right-2.5 z-[2] grid h-[34px] w-[34px] translate-y-1 place-items-center rounded-full bg-[#f5f4ec]/90 text-[#1c241c] opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 focus-visible:translate-y-0 focus-visible:opacity-100"
        >
          <Play className="h-3.5 w-3.5 fill-current" />
        </button>
      </div>

      <div className="px-[15px] pb-[15px] pt-[13px]">
        <div className="truncate text-[13.5px] font-semibold tracking-[-0.01em]">{book.title}</div>
        <div className="mt-0.5 text-[10.5px] text-muted-foreground">
          {hasProgress ? `正在听 · 第 ${book.lastChapter + 1} 章` : `未开始 · 共 ${book.chapterCount} 章`}
        </div>
        <div className="mt-[11px] h-[3px] overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-[7px] flex items-center justify-between gap-2 text-[9.5px] text-faint">
          <span className="num">{pct}%</span>
          <span className="num">第 {Math.min(book.lastChapter + 1, book.chapterCount)}/{book.chapterCount} 章</span>
        </div>
      </div>
    </div>
  );
}

function Stat({ value, label, sub }: { value: string; label: string; sub: string }) {
  return (
    <div className="rounded-[11px] border border-line bg-card px-4 py-3.5">
      <div className="text-[21px] font-semibold leading-tight tracking-[-0.02em] num">{value}</div>
      <div className="mt-[3px] text-[10.5px] text-muted-foreground">{label}</div>
      <div className="mt-[7px] text-[10.5px] text-faint">{sub}</div>
    </div>
  );
}

export function BooksPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const nav = useNavigate();
  const snapshot = useResumeStore((s) => s.snapshot);
  const clearSnapshot = useResumeStore((s) => s.clear);
  const resumeEnabled = useSettingsStore((s) => s.appPrefs.resumeLast);

  const reload = useCallback(async () => {
    setBooks(await deps().books.getAll());
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const bookSnapshot = resumeEnabled && snapshot?.source.kind === 'book' ? snapshot : null;
  const resumeSource = bookSnapshot?.source.kind === 'book' ? bookSnapshot.source : null;
  const resumeBook = resumeSource
    ? books.find((b) => b.id === resumeSource.bookId) ?? null
    : null;

  useEffect(() => {
    if (!resumeSource || books.length === 0) return;
    if (!books.some((b) => b.id === resumeSource.bookId)) {
      void clearSnapshot();
    }
  }, [books, resumeSource, clearSnapshot]);

  const stats = useMemo(() => {
    const totalChapters = books.reduce((sum, b) => sum + b.chapterCount, 0);
    const listening = books.filter((b) => b.lastChapter > 0 || b.lastSegment > 0).length;
    const avgProgress = books.length > 0
      ? Math.round(books.reduce((sum, b) => sum + bookPct(b), 0) / books.length)
      : 0;
    return { totalChapters, listening, avgProgress };
  }, [books]);

  async function onImport(file: File): Promise<void> {
    setBusy(true);
    try {
      const raw = await readTextFile(file);
      const units = parseToc(raw);
      if (units.length === 0) {
        toast.error('没有识别到任何内容');
        return;
      }
      const title = file.name.replace(/\.txt$/i, '');
      await deps().books.importBook(title, units);
      toast.success(`已入库《${title}》，共 ${units.length} 章`);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Library · 书架"
        title="你的听书架"
        description="导入 TXT 小说，自动解析卷/章目录，随时从上次停下的地方继续。"
        actions={
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,text/plain"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onImport(f);
                e.target.value = '';
              }}
            />
            <Button onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload className="mr-1.5 h-4 w-4" />
              {busy ? '导入中…' : '导入 TXT'}
            </Button>
          </>
        }
      />

      {bookSnapshot && resumeSource && resumeBook && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[11px] border border-primary/25 bg-primary/8 px-4 py-3">
          <History className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1 text-[13px]">
            <span className="font-semibold">继续上次收听</span>
            <span className="ml-1.5 text-muted-foreground">
              《{bookSnapshot.bookTitle ?? resumeBook.title}》第 {resumeSource.chapterIdx + 1} 章 · 第 {bookSnapshot.segIndex + 1} 段
            </span>
          </div>
          <Button
            size="sm"
            onClick={() => void playChapter(
              resumeSource.bookId,
              resumeSource.chapterIdx,
              bookSnapshot.segIndex,
            )}
          >
            继续
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void clearSnapshot()} title="忽略" aria-label="忽略">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {books.length > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            value={String(books.length)}
            label="书架藏书"
            sub={`共 ${stats.totalChapters} 章`}
          />
          <Stat
            value={String(stats.listening)}
            label="正在收听"
            sub={stats.listening > 0 ? '有进度可续听' : '还没有开始听'}
          />
          <Stat
            value={String(stats.totalChapters)}
            label="累计章节"
            sub={books.length > 0 ? `平均 ${Math.round(stats.totalChapters / books.length)} 章/本` : '—'}
          />
          <Stat
            value={`${stats.avgProgress}%`}
            label="整体进度"
            sub="按已听章节估算"
          />
        </div>
      )}

      {books.length === 0 ? (
        <div className="rounded-[13px] border border-dashed border-line bg-card/50 px-6 py-16 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 text-[13px] font-medium">还没有书</p>
          <p className="mt-1 text-[11.5px] text-muted-foreground">导入 TXT 小说，自动解析目录后即可连续听书</p>
          <Button variant="outline" className="mt-5" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Upload className="mr-1.5 h-4 w-4" />
            导入第一本
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-[15px] sm:grid-cols-[repeat(auto-fill,minmax(186px,1fr))]">
          {books.map((b) => (
            <BookCard
              key={b.id}
              book={b}
              onOpen={() => nav(`/books/${b.id}`)}
              onPlay={() => void playChapter(b.id, b.lastChapter, b.lastSegment)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

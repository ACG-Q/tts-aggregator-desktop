import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, History, Play, Upload } from 'lucide-react';
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

function BookCard({ book, onOpen, onPlay }: {
  book: Book;
  onOpen: () => void;
  onPlay: () => void;
}) {
  const hasProgress = book.lastChapter > 0 || book.lastSegment > 0;
  const pct = book.chapterCount > 0
    ? Math.round((book.lastChapter / book.chapterCount) * 100)
    : 0;

  return (
    <div
      className="group flex cursor-pointer flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/50"
      onClick={onOpen}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium">{book.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            共 {book.chapterCount} 章 · {new Date(book.importedAt).toLocaleDateString('zh-CN')}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          title={hasProgress ? '继续播放' : '从头播放'}
          className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => { e.stopPropagation(); onPlay(); }}
        >
          <Play className="h-4 w-4" />
        </Button>
      </div>

      {hasProgress && (
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
            <span>听到第 {book.lastChapter + 1} 章</span>
            <span>{pct}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <button
        className="mt-4 flex items-center justify-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-accent-foreground group-hover:opacity-100"
        onClick={(e) => { e.stopPropagation(); onOpen(); }}
      >
        <BookOpen className="h-3.5 w-3.5" />
        打开
      </button>
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
    <div className="space-y-6">
      <PageHeader
        title="书架"
        description="导入 TXT 小说，自动解析卷/章目录后即可连续听书。"
        actions={
          <>
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload className="mr-1.5 h-4 w-4" />
              {busy ? '导入中…' : '导入 TXT'}
            </Button>
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
          </>
        }
      />

      {bookSnapshot && resumeSource && resumeBook && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
          <History className="h-4 w-4 text-primary" />
          <div className="min-w-0 flex-1 text-sm">
            <span className="font-medium">继续上次收听</span>
            <span className="ml-2 text-muted-foreground">
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
          <Button size="sm" variant="ghost" onClick={() => void clearSnapshot()}>忽略</Button>
        </div>
      )}

      {books.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 py-16 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">还没有书</p>
          <p className="mt-1 text-xs text-muted-foreground">导入 TXT 小说，自动解析目录后即可连续听书</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, Loader2, Pencil, Play, Trash2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ChapterTree } from '@/components/book/ChapterTree';
import type { BookTocItem } from '@/lib/db';
import { estimateReadingSeconds, fmtReadingDuration } from '@/lib/estimate';
import { playChapter } from '@/store/bookPlay';
import { deps } from '@/store/deps';
import { useNowPlayingStore } from '@/store/nowPlayingStore';
import { usePlayerStore } from '@/store/playerStore';
import type { Book, BookChapter } from '@/types/models';

function coverColors(title: string): [string, string] {
  const palette: [string, string][] = [
    ['#43604d', '#24362c'],
    ['#4a5568', '#262d38'],
    ['#7a5145', '#3d2a26'],
    ['#3f6662', '#223835'],
    ['#7a6848', '#3d3424'],
    ['#5c4657', '#302531'],
  ];
  let hash = 0;
  for (let i = 0; i < title.length; i += 1) hash = (hash * 31 + title.charCodeAt(i)) % 997;
  return palette[hash % palette.length];
}

export function BookDetailPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [book, setBook] = useState<Book | null>(null);
  const [toc, setToc] = useState<BookTocItem[]>([]);
  const [preview, setPreview] = useState<BookChapter | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [deleteFor, setDeleteFor] = useState<Book | null>(null);
  const [renameFor, setRenameFor] = useState<Book | null>(null);
  const [renameText, setRenameText] = useState('');
  const source = usePlayerStore((s) => s.source);
  const status = usePlayerStore((s) => s.status);

  const currentChapter = source?.kind === 'book' && source.bookId === id ? source.chapterIdx : null;
  const playing = status !== 'idle';

  const reload = useCallback(async () => {
    const books = await deps().books.getAll();
    setBook(books.find((b) => b.id === id) ?? null);
  }, [id]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { void deps().books.getToc(id).then(setToc); }, [id]);

  useEffect(() => {
    const cur = useNowPlayingStore.getState().current;
    if (cur && cur.bookId === id && book) {
      useNowPlayingStore.getState().set({
        ...cur,
        title: book.title,
        chapterCount: book.chapterCount,
      });
    }
    return () => { useNowPlayingStore.getState().set(null); };
  }, [id, book]);

  const previewIdx = currentChapter ?? book?.lastChapter ?? 0;

  useEffect(() => {
    let cancelled = false;
    setPreviewLoading(true);
    void deps().books.getChapter(id, previewIdx).then((ch) => {
      if (!cancelled) setPreview(ch);
    }).finally(() => {
      if (!cancelled) setPreviewLoading(false);
    });
    return () => { cancelled = true; };
  }, [id, previewIdx]);

  const paragraphs = useMemo(() => {
    if (!preview) return [];
    return preview.content
      .split(/\n+/)
      .map((p) => p.trim())
      .filter(Boolean)
      .slice(0, 8);
  }, [preview]);

  function startFrom(b: Book, fromResume: boolean): void {
    void playChapter(b.id, fromResume ? b.lastChapter : 0, fromResume ? b.lastSegment : 0);
  }

  if (!book) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => nav('/books')}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          返回书架
        </Button>
        <p className="py-12 text-center text-[12.5px] text-muted-foreground">书不存在或已删除</p>
      </div>
    );
  }

  const hasProgress = book.lastChapter > 0 || book.lastSegment > 0;
  const pct = book.chapterCount > 0
    ? Math.round((book.lastChapter / book.chapterCount) * 100)
    : 0;
  const [c1, c2] = coverColors(book.title);
  const previewTitle = preview?.title ?? toc.find((t) => t.idx === previewIdx)?.title ?? '章节预览';
  const previewChars = preview?.content.length ?? 0;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <Button variant="ghost" size="sm" onClick={() => nav('/books')} className="-ml-2">
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
          返回书架
        </Button>
        <span className="text-[11px] text-faint">
          书架 / <span className="text-muted-foreground">{book.title}</span>
        </span>
      </div>

      <header className="flex flex-wrap items-center gap-5">
        <div
          className="relative flex h-[124px] w-[92px] shrink-0 items-end overflow-hidden rounded-xl p-3 shadow-[0_14px_32px_rgba(0,0,0,0.24)]"
          style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(100%_80%_at_100%_0%,rgba(255,255,255,.18),transparent_60%)]" />
          <span className="relative z-[1] text-[30px] font-semibold leading-none text-white/85">
            {book.title.slice(0, 1) || '书'}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="text-[25px] font-semibold leading-tight tracking-[-0.02em]">{book.title}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11.5px] text-muted-foreground">
            <span>共 {book.chapterCount} 章</span>
            <span aria-hidden="true">·</span>
            <span>已听 {pct}%</span>
            {book.playbackRate > 0 && <Badge variant="secondary">{book.playbackRate}x</Badge>}
            {playing && currentChapter !== null && (
              <Badge className="border-primary/25 bg-primary/12 text-primary">正在收听</Badge>
            )}
          </div>
          <p className="mt-2 text-[11px] text-faint">
            导入于 {new Date(book.importedAt).toLocaleDateString('zh-CN')}
            {hasProgress && ` · 听到第 ${book.lastChapter + 1} 章第 ${book.lastSegment + 1} 段`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!playing && (
            <Button onClick={() => startFrom(book, hasProgress)}>
              <Play className="mr-1.5 h-4 w-4" />
              {hasProgress ? `继续听 第 ${book.lastChapter + 1} 章` : '从头开始听'}
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            title="重命名"
            aria-label="重命名"
            onClick={() => { setRenameFor(book); setRenameText(book.title); }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            title="删除"
            aria-label="删除"
            className="text-destructive hover:border-destructive/40 hover:bg-destructive/10"
            onClick={() => setDeleteFor(book)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="mt-5 rounded-[13px] border border-line bg-card px-[18px] py-3.5">
        <div className="mb-2 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
          <span>阅读进度</span>
          <span className="num">第 {Math.min(book.lastChapter + 1, book.chapterCount)} 章 / {book.chapterCount} 章 · {pct}%</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[320px_1fr]">
        <div className="overflow-hidden rounded-[13px] border border-line bg-card">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3.5 text-[12.5px] font-semibold">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            目录
            <span className="ml-auto text-[10px] font-normal text-faint num">{toc.length} 章</span>
          </div>
          <div className="max-h-[560px] overflow-hidden px-2 pb-2.5 pt-1.5">
            <ChapterTree
              items={toc}
              currentIdx={currentChapter}
              lastChapter={book.lastChapter}
              onPick={(idx) => void playChapter(book.id, idx, 0)}
            />
          </div>
        </div>

        <div className="paper-surface min-h-[420px] rounded-[13px] border border-line px-5 py-6 sm:px-8 sm:py-8">
          <div className="mb-5 flex items-start justify-between gap-3.5">
            <div className="min-w-0">
              <div className="eyebrow mb-1.5">Chapter {String(previewIdx + 1).padStart(2, '0')}</div>
              <h2 className="truncate text-[18px] font-semibold tracking-[-0.01em]">{previewTitle}</h2>
            </div>
            <Button size="sm" onClick={() => void playChapter(book.id, previewIdx, 0)} className="shrink-0">
              <Play className="mr-1.5 h-3.5 w-3.5" />
              从这里听
            </Button>
          </div>

          {previewLoading ? (
            <div className="flex items-center gap-2 py-10 text-[12px] text-faint">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在读取章节…
            </div>
          ) : paragraphs.length === 0 ? (
            <p className="py-10 text-center text-[12px] text-faint">本章暂无内容</p>
          ) : (
            <div className="space-y-[1.35em] text-[15.5px] leading-[1.98] text-paper-foreground">
              {paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          )}

          <div className="mt-7 flex items-center justify-between gap-3 border-t border-line pt-3.5 text-[10.5px] text-faint">
            <span className="num">
              {previewChars > 0
                ? `本章 ${previewChars} 字 · 约 ${fmtReadingDuration(estimateReadingSeconds(previewChars))}`
                : '—'}
            </span>
            <span>进度自动保存</span>
          </div>
        </div>
      </div>

      <AlertDialog open={!!deleteFor} onOpenChange={(o) => { if (!o) setDeleteFor(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除《{deleteFor?.title}》？</AlertDialogTitle>
            <AlertDialogDescription>书与全部章节内容将被删除，不可恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deleteFor) return;
                void deps().books.delete(deleteFor.id).then(() => {
                  usePlayerStore.getState().stop();
                  toast.success('已删除');
                  nav('/books');
                });
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!renameFor} onOpenChange={(o) => { if (!o) setRenameFor(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名书名</DialogTitle>
          </DialogHeader>
          <Input value={renameText} onChange={(e) => setRenameText(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameFor(null)}>取消</Button>
            <Button
              onClick={() => {
                if (!renameFor || !renameText.trim()) return;
                void deps().books.rename(renameFor.id, renameText.trim()).then(reload);
                setRenameFor(null);
              }}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

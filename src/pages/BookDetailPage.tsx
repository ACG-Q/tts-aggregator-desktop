import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, Pencil, Trash2 } from 'lucide-react';
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
import { playChapter } from '@/store/bookPlay';
import { deps } from '@/store/deps';
import { useNowPlayingStore } from '@/store/nowPlayingStore';
import { usePlayerStore } from '@/store/playerStore';
import type { Book } from '@/types/models';

export function BookDetailPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [book, setBook] = useState<Book | null>(null);
  const [toc, setToc] = useState<BookTocItem[]>([]);
  const [deleteFor, setDeleteFor] = useState<Book | null>(null);
  const [renameFor, setRenameFor] = useState<Book | null>(null);
  const [renameText, setRenameText] = useState('');
  const player = usePlayerStore();

  const src = player.source;
  const currentChapter = src?.kind === 'book' && src.bookId === id ? src.chapterIdx : null;
  const playing = player.status !== 'idle';

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
        <p className="py-12 text-center text-sm text-muted-foreground">书不存在或已删除</p>
      </div>
    );
  }

  const hasProgress = book.lastChapter > 0 || book.lastSegment > 0;

  return (
    <div className="space-y-4">
      {/* 顶栏 */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => nav('/books')} title="返回书架">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        {!playing && (
          <Button onClick={() => startFrom(book, hasProgress)}>
            {hasProgress ? `继续听 第 ${book.lastChapter + 1} 章` : '从头开始听'}
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">{book.title}</h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>共 {book.chapterCount} 章</span>
            {hasProgress && <span>· 听到第 {book.lastChapter + 1} 章</span>}
            {book.playbackRate > 0 && <Badge variant="secondary">{book.playbackRate}x</Badge>}
          </div>
        </div>
        <Button variant="outline" onClick={() => { setRenameFor(book); setRenameText(book.title); }}>
          <Pencil className="mr-1.5 h-4 w-4" />
          改名
        </Button>
        <Button variant="outline" className="text-destructive hover:bg-destructive/10"
          onClick={() => setDeleteFor(book)}>
          <Trash2 className="mr-1.5 h-4 w-4" />
          删除
        </Button>
      </div>

      {/* 两栏：左目录 / 右播放器 */}
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* 左：目录 */}
        <div className="flex min-h-0 flex-col rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            目录
            <span className="ml-auto text-xs text-muted-foreground">{toc.length} 章</span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col lg:max-h-[calc(100vh-16rem)]">
            <ChapterTree
              items={toc}
              currentIdx={currentChapter}
              lastChapter={book.lastChapter}
              onPick={(idx) => void playChapter(book.id, idx, 0)}
            />
          </div>
        </div>

        {/* 右：提示 */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
            <p>点击左侧目录中的任意章节即可开始朗读，播放控制在底部播放条。</p>
            <p className="mt-2">当前章节进度会在播放时自动保存，下次可从断点继续。</p>
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

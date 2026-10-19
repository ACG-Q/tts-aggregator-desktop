import { useCallback, useEffect, useRef, useState } from 'react';
import { Pencil, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ChapterTree } from '@/components/book/ChapterTree';
import { PlayerControls } from '@/components/player/PlayerControls';
import type { BookTocItem } from '@/lib/db';
import { readTextFile } from '@/lib/encoding';
import { parseToc } from '@/lib/toc';
import { playChapter } from '@/store/bookPlay';
import { deps } from '@/store/deps';
import { usePlayerStore } from '@/store/playerStore';
import type { Book } from '@/types/models';

export function BooksPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [toc, setToc] = useState<BookTocItem[]>([]);
  const [resumeFor, setResumeFor] = useState<Book | null>(null);
  const [deleteFor, setDeleteFor] = useState<Book | null>(null);
  const [renameFor, setRenameFor] = useState<Book | null>(null);
  const [renameText, setRenameText] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const player = usePlayerStore();
  const currentChapter =
    player.source?.kind === 'book' && player.source.bookId === selected
      ? player.source.chapterIdx
      : null;

  const reload = useCallback(async () => {
    setBooks(await deps().books.getAll());
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    if (!selected) {
      setToc([]);
      return;
    }
    void deps().books.getToc(selected).then(setToc);
  }, [selected, books]);

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

  function openBook(b: Book): void {
    setSelected(b.id);
    if (b.lastChapter > 0 || b.lastSegment > 0) setResumeFor(b);
    else void playChapter(b.id, 0, 0);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">书架</h1>
        <Button onClick={() => fileRef.current?.click()} disabled={busy}>
          <Upload className="mr-1 h-4 w-4" />
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
      </div>

      {books.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            还没有书。导入 TXT 小说，自动解析卷/章目录后即可连续听书。
          </CardContent>
        </Card>
      )}

      {books.map((b) => (
        <Card key={b.id} className={selected === b.id ? 'border-primary' : ''}>
          <CardContent className="flex items-center gap-3 pt-6">
            <button className="min-w-0 flex-1 text-left" onClick={() => openBook(b)}>
              <div className="truncate font-medium">{b.title}</div>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{new Date(b.importedAt).toLocaleDateString('zh-CN')}</span>
                {b.playbackRate > 0 && <Badge variant="secondary">{b.playbackRate}x</Badge>}
              </div>
            </button>
            <Button variant="ghost" size="icon" title="改名" onClick={() => { setRenameFor(b); setRenameText(b.title); }}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" title="删除" onClick={() => setDeleteFor(b)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </CardContent>
        </Card>
      ))}

      {selected && (
        <Card>
          <CardContent className="pt-6">
            <PlayerControls />
            <div className="mt-4">
              <ChapterTree
                items={toc}
                currentIdx={currentChapter}
                onPick={(idx) => void playChapter(selected, idx, 0)}
              />
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!resumeFor} onOpenChange={(o) => { if (!o) setResumeFor(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>继续上次进度？</AlertDialogTitle>
            <AlertDialogDescription>
              《{resumeFor?.title}》上次听到第 {(resumeFor?.lastChapter ?? 0) + 1} 章。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                if (resumeFor) {
                  void deps().books.setProgress(resumeFor.id, 0, 0).then(() => playChapter(resumeFor.id, 0, 0));
                }
              }}
            >
              从头开始
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (resumeFor) void playChapter(resumeFor.id, resumeFor.lastChapter, resumeFor.lastSegment);
              }}
            >
              继续播放
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                const id = deleteFor.id;
                void deps().books.delete(id).then(() => {
                  if (selected === id) {
                    setSelected(null);
                    usePlayerStore.getState().stop();
                  }
                  return reload();
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

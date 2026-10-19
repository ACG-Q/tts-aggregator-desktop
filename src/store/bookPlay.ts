import { toast } from 'sonner';
import { splitForReading } from '../lib/split';
import { deps } from './deps';
import { useNowPlayingStore } from './nowPlayingStore';
import { usePlayerStore } from './playerStore';

export async function playChapter(bookId: string, chapterIdx: number, fromSeg = 0): Promise<void> {
  const chapter = await deps().books.getChapter(bookId, chapterIdx);
  if (!chapter) {
    toast.error('章节不存在');
    return;
  }
  const segs = splitForReading(chapter.content);
  if (segs.length === 0) {
    toast.error('本章没有可朗读的内容');
    return;
  }
  const books = await deps().books.getAll();
  const book = books.find((b) => b.id === bookId);
  const player = usePlayerStore.getState();
  if (book && book.playbackRate > 0) player.setPlaybackRate(book.playbackRate);

  if (book) {
    useNowPlayingStore.getState().set({
      bookId,
      title: book.title,
      chapterTitle: chapter.title,
      chapterCount: book.chapterCount,
      chapterIdx,
    });
  }

  // 章节切换：先停掉当前播放，再从目标章的指定段起播。
  // 之前直接 startSegs，会在上一章的 pump 循环里继续跑，导致两章串音。
  player.stop();
  player.setHooks({
    onSegDone: (segIdx) => {
      void deps().books.setProgress(bookId, chapterIdx, Math.min(segIdx + 1, segs.length));
    },
    onFinished: async () => {
      const next = chapterIdx + 1;
      const has = await deps().books.hasChapter(bookId, next);
      if (has) {
        await playChapter(bookId, next, 0);
        return;
      }
      await deps().books.setProgress(bookId, chapterIdx, segs.length);
      toast('本书已播完');
    },
  });
  await usePlayerStore.getState().startSegs(segs, { kind: 'book', bookId, chapterIdx }, fromSeg);
}

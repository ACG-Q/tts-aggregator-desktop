import { create } from 'zustand';

export interface NowPlaying {
  bookId: string;
  title: string;
  chapterTitle: string;
  chapterCount: number;
  chapterIdx: number;
}

interface NowPlayingState {
  current: NowPlaying | null;
  set(p: NowPlaying | null): void;
}

export const useNowPlayingStore = create<NowPlayingState>((set) => ({
  current: null,
  set(current) { set({ current }); },
}));

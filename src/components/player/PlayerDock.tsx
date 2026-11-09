import { useState } from 'react';
import {
  ChevronDown, ChevronUp, Pause, Play, RotateCcw, RotateCw, SkipBack, SkipForward, Timer, Volume2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { SentenceText } from '@/components/player/SentenceText';
import { RATE_OPTIONS } from '@/components/player/rates';
import { useSleepCountdown } from '@/hooks/useSleepCountdown';
import { fmtClock } from '@/lib/format';
import { useNowPlayingStore } from '@/store/nowPlayingStore';
import { usePlayerStore } from '@/store/playerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { SIDEBAR_COLLAPSE_THRESHOLD, useSidebarStore } from '@/store/sidebarStore';
import { SIDEBAR_RAIL_THRESHOLD } from '@/lib/sidebar';
import { SLEEP_MINUTES_OPTIONS } from '@/types/models';

function CurrentSegmentText() {
  const seg = usePlayerStore((s) => s.segs[s.index]);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  if (!seg || !seg.text.trim()) {
    return <span className="text-muted-foreground">暂无朗读文本</span>;
  }
  const progress = duration > 0 ? currentTime / duration : 0;
  return <SentenceText text={seg.text} progress={progress} />;
}

function useDockLeft() {
  const windowWidth = useSidebarStore((s) => s.windowWidth);
  const collapsed = useSidebarStore((s) => s.collapsed());
  if (typeof window !== 'undefined' && windowWidth < SIDEBAR_COLLAPSE_THRESHOLD) return 0;
  const rail = collapsed || windowWidth < SIDEBAR_RAIL_THRESHOLD;
  return rail ? 72 : 232;
}

function ProgressBar({ compact }: { compact: boolean }) {
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const disabled = duration <= 0;
  const value = Math.min(currentTime, duration || 0);
  return (
    <div className={`flex items-center gap-2 ${compact ? 'flex-1' : 'w-full'}`}>
      <span className="w-10 shrink-0 text-right text-[10.5px] num text-muted-foreground">
        {disabled ? '--:--' : fmtClock(currentTime)}
      </span>
      <Slider
        disabled={disabled}
        value={[value]}
        max={Math.max(duration, 1)}
        step={0.5}
        onValueChange={([v]) => usePlayerStore.getState().seek(v)}
        className="flex-1"
      />
      <span className="w-10 shrink-0 text-[10.5px] num text-muted-foreground">
        {disabled ? '--:--' : fmtClock(duration)}
      </span>
    </div>
  );
}

function Transport({ large }: { large: boolean }) {
  const status = usePlayerStore((s) => s.status);
  const idle = status === 'idle';
  const player = (): ReturnType<typeof usePlayerStore.getState> => usePlayerStore.getState();
  const btn = large
    ? 'h-[34px] w-[34px] rounded-[9px]'
    : 'h-[30px] w-[30px] rounded-[8px]';
  const iconCls = large ? 'h-[18px] w-[18px]' : 'h-4 w-4';
  const base = 'grid place-items-center text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:pointer-events-none disabled:opacity-40';
  return (
    <div className={`flex items-center ${large ? 'gap-1.5' : 'gap-0.5'}`}>
      <button type="button" className={`${base} ${btn}`} disabled={idle} onClick={() => player().jumpTo(player().index - 1)} title="上一段" aria-label="上一段">
        <SkipBack className={iconCls} />
      </button>
      <button type="button" className={`${base} ${btn} hidden sm:grid`} title="后退 10 秒" onClick={() => player().seek(player().currentTime - 10)} aria-label="后退 10 秒">
        <RotateCcw className={iconCls} />
      </button>
      {status === 'running' ? (
        <button
          type="button"
          onClick={() => player().pause()}
          title="暂停"
          aria-label="暂停"
          className={`grid place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_4px_14px_var(--highlight)] transition-colors hover:bg-primary/90 ${large ? 'mx-1 h-[46px] w-[46px]' : 'mx-1 h-[38px] w-[38px]'}`}
        >
          <Pause className={large ? 'h-5 w-5' : 'h-4 w-4'} />
        </button>
      ) : (
        <button
          type="button"
          disabled={idle}
          onClick={() => void player().resume()}
          title="播放"
          aria-label="播放"
          className={`grid place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_4px_14px_var(--highlight)] transition-colors hover:bg-primary/90 disabled:opacity-40 ${large ? 'mx-1 h-[46px] w-[46px]' : 'mx-1 h-[38px] w-[38px]'}`}
        >
          <Play className={large ? 'h-5 w-5' : 'h-4 w-4'} />
        </button>
      )}
      <button type="button" className={`${base} ${btn} hidden sm:grid`} title="前进 10 秒" onClick={() => player().seek(player().currentTime + 10)} aria-label="前进 10 秒">
        <RotateCw className={iconCls} />
      </button>
      <button type="button" className={`${base} ${btn}`} disabled={idle} onClick={() => player().skipNext()} title="下一段" aria-label="下一段">
        <SkipForward className={iconCls} />
      </button>
    </div>
  );
}

function SleepTimerSelect() {
  const sleepMinutes = usePlayerStore((s) => s.sleepMinutes);
  const endsAt = usePlayerStore((s) => s.sleepEndsAt);
  const countdown = useSleepCountdown(endsAt);
  return (
    <div className="flex items-center gap-1">
      <Timer className="h-4 w-4 shrink-0 text-muted-foreground" />
      <Select
        value={String(sleepMinutes)}
        onValueChange={(v) => usePlayerStore.getState().setSleepTimer(Number(v))}
      >
        <SelectTrigger className="h-8 w-24 text-[11px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          {SLEEP_MINUTES_OPTIONS.map((m) => (
            <SelectItem key={m} value={String(m)}>{m === 0 ? '无定时' : `${m} 分钟`}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {countdown && <span className="w-10 text-[10.5px] num text-muted-foreground">{countdown}</span>}
    </div>
  );
}

function VolumeAndRate() {
  const volume = usePlayerStore((s) => s.volume);
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const appPrefs = useSettingsStore((s) => s.appPrefs);
  const saveAppPrefs = useSettingsStore((s) => s.saveAppPrefs);
  return (
    <div className="flex items-center gap-3">
      <div className="flex w-[130px] items-center gap-2">
        <Volume2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <Slider
          value={[volume]}
          max={100}
          step={1}
          onValueChange={([v]) => {
            usePlayerStore.getState().setVolume(v);
            void saveAppPrefs({ ...appPrefs, volume: v });
          }}
          className="flex-1"
        />
      </div>
      <Select
        value={String(playbackRate)}
        onValueChange={(v) => {
          const rate = Number(v);
          usePlayerStore.getState().setPlaybackRate(rate);
          void saveAppPrefs({ ...appPrefs, playbackRate: rate });
        }}
      >
        <SelectTrigger className="h-8 w-[72px] text-[11px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          {RATE_OPTIONS.map((r) => (<SelectItem key={r} value={String(r)}>{r}x</SelectItem>))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SpeedPill() {
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const appPrefs = useSettingsStore((s) => s.appPrefs);
  const saveAppPrefs = useSettingsStore((s) => s.saveAppPrefs);
  return (
    <Select
      value={String(playbackRate)}
      onValueChange={(v) => {
        const rate = Number(v);
        usePlayerStore.getState().setPlaybackRate(rate);
        void saveAppPrefs({ ...appPrefs, playbackRate: rate });
      }}
    >
      <SelectTrigger className="h-7 w-auto gap-1 rounded-full border-line bg-surface-2 px-2.5 text-[10.5px] text-muted-foreground hover:border-line-strong hover:text-foreground">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {RATE_OPTIONS.map((r) => (<SelectItem key={r} value={String(r)}>{r}x</SelectItem>))}
      </SelectContent>
    </Select>
  );
}

function SleepPill() {
  const sleepMinutes = usePlayerStore((s) => s.sleepMinutes);
  const endsAt = usePlayerStore((s) => s.sleepEndsAt);
  const countdown = useSleepCountdown(endsAt);
  return (
    <Select
      value={String(sleepMinutes)}
      onValueChange={(v) => usePlayerStore.getState().setSleepTimer(Number(v))}
    >
      <SelectTrigger className="h-7 w-auto gap-1.5 rounded-full border-line bg-surface-2 px-2.5 text-[10.5px] text-muted-foreground hover:border-line-strong hover:text-foreground [&_svg:not([class*='size-'])]:size-3.5">
        <Timer className="h-3.5 w-3.5" />
        <SelectValue />
        {countdown && <span className="num text-[9.5px] text-faint">{countdown}</span>}
      </SelectTrigger>
      <SelectContent>
        {SLEEP_MINUTES_OPTIONS.map((m) => (
          <SelectItem key={m} value={String(m)}>{m === 0 ? '无定时' : `${m} 分钟`}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function BookMeta({ large }: { large: boolean }) {
  const now = useNowPlayingStore((s) => s.current);
  const source = usePlayerStore((s) => s.source);
  const isBook = source?.kind === 'book';
  const cover = isBook && now ? now.title.slice(0, 1) : '文';
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div
        className={`${large ? 'h-14 w-14 text-xl' : 'h-10 w-10 text-[15px]'} grid shrink-0 place-items-center rounded-[9px] bg-[linear-gradient(135deg,#43604d,#24362c)] font-semibold text-white/85`}
      >
        {cover}
      </div>
      <div className={large ? 'min-w-0' : 'w-[110px] min-w-0 shrink-0 sm:w-[152px]'}>
        <div className={`${large ? 'text-[17px]' : 'text-xs'} truncate font-semibold`}>
          {isBook && now ? now.title : '文本朗读'}
        </div>
        <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
          {isBook && now ? now.chapterTitle : '粘贴或导入的文本'}
        </div>
      </div>
    </div>
  );
}

export function PlayerDock() {
  const [expanded, setExpanded] = useState(false);
  const left = useDockLeft();
  const status = usePlayerStore((s) => s.status);
  const error = usePlayerStore((s) => s.error);
  const index = usePlayerStore((s) => s.index);
  const segCount = usePlayerStore((s) => s.segs.length);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const now = useNowPlayingStore((s) => s.current);

  if (status === 'idle') return null;

  const segPos = segCount > 0
    ? `段 ${Math.min(index + 1, segCount)}/${segCount}`
    : '';
  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div
      className="fixed bottom-0 right-0 z-[55] border-t border-line bg-card/95 backdrop-blur-xl transition-[left] duration-200"
      style={{ left }}
    >
      <div
        className="absolute -top-px left-0 h-0.5 rounded-r-full bg-primary transition-[width] duration-300"
        style={{ width: `${progress}%` }}
        aria-hidden="true"
      />

      <div className="relative flex h-[68px] items-center gap-2.5 px-3 md:gap-4 md:px-[18px]">
        <BookMeta large={false} />

        <div className="flex shrink-0 items-center gap-2.5">
          <Transport large={false} />
          <span className="hidden w-[82px] shrink-0 text-center text-[10.5px] num text-muted-foreground md:block">
            {duration > 0 ? `${fmtClock(currentTime)} / ${fmtClock(duration)}` : '--:-- / --:--'}
          </span>
        </div>

        <div className="ml-auto hidden min-w-0 max-w-[360px] flex-1 truncate text-[11.5px] text-muted-foreground lg:block">
          <CurrentSegmentText />
        </div>

        <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
          <SpeedPill />
          <SleepPill />
        </div>

        {error && (
          <span className="hidden max-w-[180px] truncate text-[11px] text-destructive xl:block" title={error}>
            {error}
          </span>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? '收起播放面板' : '展开播放面板'}
          aria-label={expanded ? '收起播放面板' : '展开播放面板'}
          className="h-8 w-8 shrink-0 rounded-[8px] text-muted-foreground"
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </Button>
      </div>

      {expanded && (
        <div className="border-t border-line px-4 pb-[22px] pt-[18px] md:px-6">
          <div className="mx-auto w-full max-w-[920px]">
            <div className="mb-3.5 flex items-center justify-between gap-5">
              <div className="min-w-0">
                <h3 className="truncate text-[17px] font-semibold tracking-[-0.01em]">
                  {now ? `${now.title} · ${now.chapterTitle}` : '文本朗读'}
                </h3>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {now ? `第 ${now.chapterIdx + 1}/${now.chapterCount} 章 · ` : ''}
                  {segPos || '自动保存进度'}
                </p>
              </div>
              {error && <p className="truncate text-xs text-destructive">{error}</p>}
            </div>

            <div className="mb-3.5">
              <ProgressBar compact={false} />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <Transport large />
              <div className="flex flex-wrap items-center gap-3.5">
                <SleepTimerSelect />
                <VolumeAndRate />
              </div>
            </div>

            <div className="mt-3.5 rounded-[10px] bg-surface-2 px-3.5 py-3 text-[12.5px] leading-[1.85] text-muted-foreground">
              <CurrentSegmentText />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

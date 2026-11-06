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

function ProgressBar({ compact }: { compact: boolean }) {
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const disabled = duration <= 0;
  const value = Math.min(currentTime, duration || 0);
  return (
    <div className={`flex items-center gap-2 ${compact ? 'flex-1' : 'w-full'}`}>
      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
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
      <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">
        {disabled ? '--:--' : fmtClock(duration)}
      </span>
    </div>
  );
}

function Transport({ large }: { large: boolean }) {
  const status = usePlayerStore((s) => s.status);
  const idle = status === 'idle';
  const size = large ? 'default' : 'icon';
  const iconCls = large ? 'h-5 w-5' : 'h-4 w-4';
  const player = (): ReturnType<typeof usePlayerStore.getState> => usePlayerStore.getState();
  return (
    <div className={`flex items-center ${large ? 'gap-4' : 'gap-1'}`}>
      <Button variant="ghost" size={size} disabled={idle} onClick={() => player().jumpTo(player().index - 1)} title="上一段">
        <SkipBack className={iconCls} />
      </Button>
      <Button variant="ghost" size={size} title="后退 10 秒" onClick={() => player().seek(player().currentTime - 10)}>
        <RotateCcw className={iconCls} />
      </Button>
      {status === 'running' ? (
        <Button size={size} onClick={() => player().pause()} title="暂停">
          <Pause className={iconCls} />
        </Button>
      ) : (
        <Button size={size} disabled={idle} onClick={() => void player().resume()} title="播放">
          <Play className={iconCls} />
        </Button>
      )}
      <Button variant="ghost" size={size} title="前进 10 秒" onClick={() => player().seek(player().currentTime + 10)}>
        <RotateCw className={iconCls} />
      </Button>
      <Button variant="ghost" size={size} disabled={idle} onClick={() => player().skipNext()} title="下一段">
        <SkipForward className={iconCls} />
      </Button>
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
        <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
        <SelectContent>
          {SLEEP_MINUTES_OPTIONS.map((m) => (
            <SelectItem key={m} value={String(m)}>{m === 0 ? '无定时' : `${m} 分钟`}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {countdown && <span className="w-10 text-xs tabular-nums text-muted-foreground">{countdown}</span>}
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
      <div className="flex w-28 items-center gap-1">
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
        <SelectTrigger className="w-16"><SelectValue /></SelectTrigger>
        <SelectContent>
          {RATE_OPTIONS.map((r) => (<SelectItem key={r} value={String(r)}>{r}x</SelectItem>))}
        </SelectContent>
      </Select>
    </div>
  );
}

function BookMeta({ large }: { large: boolean }) {
  const now = useNowPlayingStore((s) => s.current);
  const source = usePlayerStore((s) => s.source);
  const isBook = source?.kind === 'book';
  const cover = now?.title.slice(0, 1) ?? '文';
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div
        className={`${large ? 'h-20 w-20 text-2xl' : 'h-10 w-10 text-base'} grid shrink-0 place-items-center rounded-lg bg-primary/15 font-semibold text-primary`}
      >
        {cover}
      </div>
      <div className="min-w-0">
        <div className={`${large ? 'text-lg' : 'text-sm'} truncate font-medium`}>
          {isBook && now ? now.title : '文本朗读'}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {isBook && now ? now.chapterTitle : '粘贴或导入的文本'}
        </div>
      </div>
    </div>
  );
}

export function PlayerDock() {
  const [expanded, setExpanded] = useState(false);
  const status = usePlayerStore((s) => s.status);
  const error = usePlayerStore((s) => s.error);
  const index = usePlayerStore((s) => s.index);
  const segCount = usePlayerStore((s) => s.segs.length);
  const now = useNowPlayingStore((s) => s.current);

  if (status === 'idle') return null;

  const segPos = segCount > 0
    ? `段 ${Math.min(index + 1, segCount)}/${segCount}`
    : '';

  if (expanded) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card shadow-[0_-8px_30px_rgba(0,0,0,0.12)]">
        <div className="mx-auto max-w-4xl px-6 py-5">
          <div className="mb-4 flex items-start justify-between">
            <BookMeta large />
            <Button variant="ghost" size="icon" onClick={() => setExpanded(false)} title="收起">
              <ChevronDown className="h-5 w-5" />
            </Button>
          </div>
          <div className="mb-3"><ProgressBar compact={false} /></div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs tabular-nums text-muted-foreground">
              {now ? `第 ${now.chapterIdx + 1}/${now.chapterCount} 章` : segPos}
            </span>
            <Transport large />
            <div className="flex items-center gap-3">
              <SleepTimerSelect />
              <VolumeAndRate />
            </div>
          </div>
          <div className="mt-5 max-h-40 overflow-y-auto rounded-[10px] bg-muted/60 px-4 py-3.5 text-[13.5px] leading-[1.9]">
            <CurrentSegmentText />
          </div>
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
      {error && <p className="px-4 pt-1 text-xs text-destructive">{error}</p>}
      <div className="flex h-16 items-center gap-4 px-4">
        <BookMeta large={false} />
        <div className="hidden flex-col items-center gap-0.5 sm:flex">
          <Transport large={false} />
          <span className="text-[10px] tabular-nums text-muted-foreground">{segPos}</span>
        </div>
        <ProgressBar compact />
        <div className="hidden md:block"><VolumeAndRate /></div>
        <Button variant="ghost" size="icon" onClick={() => setExpanded(true)} title="展开">
          <ChevronUp className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

import { useState } from 'react';
import {
  ChevronDown, ChevronUp, Pause, Play, RotateCcw, RotateCw, SkipBack, SkipForward, Volume2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { fmtClock } from '@/lib/format';
import { RATE_OPTIONS } from '@/components/player/rates';
import { useNowPlayingStore } from '@/store/nowPlayingStore';
import { usePlayerStore } from '@/store/playerStore';
import { useSettingsStore } from '@/store/settingsStore';

function CurrentSegmentText() {
  const segs = usePlayerStore((s) => s.segs);
  const index = usePlayerStore((s) => s.index);
  const seg = segs[index];
  if (!seg || !seg.text.trim()) {
    return <span className="text-muted-foreground">暂无朗读文本</span>;
  }
  return <span className="rounded bg-primary px-1 py-0.5 text-primary-foreground">{seg.text}</span>;
}

function ProgressBar({ compact }: { compact: boolean }) {
  const player = usePlayerStore();
  const disabled = player.duration <= 0;
  const value = Math.min(player.currentTime, player.duration || 0);
  return (
    <div className={`flex items-center gap-2 ${compact ? 'flex-1' : 'w-full'}`}>
      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {disabled ? '--:--' : fmtClock(player.currentTime)}
      </span>
      <Slider
        disabled={disabled}
        value={[value]}
        max={Math.max(player.duration, 1)}
        step={0.5}
        onValueChange={([v]) => player.seek(v)}
        className="flex-1"
      />
      <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">
        {disabled ? '--:--' : fmtClock(player.duration)}
      </span>
    </div>
  );
}

function Transport({ large }: { large: boolean }) {
  const player = usePlayerStore();
  const idle = player.status === 'idle';
  const size = large ? 'default' : 'icon';
  const iconCls = large ? 'h-5 w-5' : 'h-4 w-4';
  return (
    <div className={`flex items-center ${large ? 'gap-4' : 'gap-1'}`}>
      <Button variant="ghost" size={size} disabled={idle} onClick={() => player.jumpTo(player.index - 1)} title="上一段">
        <SkipBack className={iconCls} />
      </Button>
      <Button variant="ghost" size={size} title="后退 15 秒" onClick={() => player.seek(player.currentTime - 15)}>
        <RotateCcw className={iconCls} />
      </Button>
      {player.status === 'running' ? (
        <Button size={size} onClick={player.pause} title="暂停">
          <Pause className={iconCls} />
        </Button>
      ) : (
        <Button size={size} disabled={idle} onClick={() => void player.resume()} title="播放">
          <Play className={iconCls} />
        </Button>
      )}
      <Button variant="ghost" size={size} title="前进 15 秒" onClick={() => player.seek(player.currentTime + 15)}>
        <RotateCw className={iconCls} />
      </Button>
      <Button variant="ghost" size={size} disabled={idle} onClick={player.skipNext} title="下一段">
        <SkipForward className={iconCls} />
      </Button>
    </div>
  );
}

function VolumeAndRate() {
  const player = usePlayerStore();
  const { appPrefs, saveAppPrefs } = useSettingsStore();
  return (
    <div className="flex items-center gap-3">
      <div className="flex w-28 items-center gap-1">
        <Volume2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <Slider
          value={[player.volume]}
          max={100}
          step={1}
          onValueChange={([v]) => {
            player.setVolume(v);
            void saveAppPrefs({ ...appPrefs, volume: v });
          }}
          className="flex-1"
        />
      </div>
      <Select
        value={String(player.playbackRate)}
        onValueChange={(v) => {
          const rate = Number(v);
          player.setPlaybackRate(rate);
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
  const src = usePlayerStore((s) => s.source);
  const isBook = src?.kind === 'book';
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
  const player = usePlayerStore();
  const now = useNowPlayingStore((s) => s.current);

  if (player.status === 'idle') return null;

  const err = player.error;
  const segPos = player.segs.length > 0
    ? `段 ${Math.min(player.index + 1, player.segs.length)}/${player.segs.length}`
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
          <div className="flex items-center justify-between">
            <span className="text-xs tabular-nums text-muted-foreground">
              {now ? `第 ${now.chapterIdx + 1}/${now.chapterCount} 章` : segPos}
            </span>
            <Transport large />
            <VolumeAndRate />
          </div>
          <div className="mt-5 rounded-[10px] bg-muted/60 px-4 py-3.5 text-[13.5px] leading-[1.9]">
            <CurrentSegmentText />
          </div>
          {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
      {err && <p className="px-4 pt-1 text-xs text-destructive">{err}</p>}
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

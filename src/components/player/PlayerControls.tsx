import { Pause, Play, SkipForward, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { fmtClock } from '@/lib/format';
import { usePlayerStore } from '@/store/playerStore';
import { useSettingsStore } from '@/store/settingsStore';

export const RATE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function PlayerControls({ onStart, startDisabled }: {
  onStart?: () => void;
  startDisabled?: boolean;
}) {
  const player = usePlayerStore();
  const { appPrefs, saveAppPrefs } = useSettingsStore();
  const idle = player.status === 'idle';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {onStart && idle && (
          <Button onClick={onStart} disabled={startDisabled}>
            <Play className="mr-1 h-4 w-4" />
            开始朗读
          </Button>
        )}
        {player.status === 'running' && (
          <Button variant="outline" onClick={player.pause}>
            <Pause className="mr-1 h-4 w-4" />
            暂停
          </Button>
        )}
        {player.status === 'paused' && (
          <Button onClick={() => void player.resume()}>
            <Play className="mr-1 h-4 w-4" />
            继续
          </Button>
        )}
        <Button variant="outline" onClick={player.skipNext} disabled={idle}>
          <SkipForward className="mr-1 h-4 w-4" />
          下一段
        </Button>
        <Button variant="destructive" onClick={player.stop} disabled={idle}>
          <Square className="mr-1 h-4 w-4" />
          停止
        </Button>
        {player.segs.length > 0 && (
          <span className="text-sm text-muted-foreground">
            进度 {Math.min(player.index + 1, player.segs.length)}/{player.segs.length} 段
            {player.duration > 0 && ` · ${fmtClock(player.currentTime)} / ${fmtClock(player.duration)}`}
          </span>
        )}
        {player.error && <span className="text-sm text-destructive">{player.error}</span>}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex min-w-52 flex-1 items-center gap-3">
          <Label className="shrink-0 text-xs text-muted-foreground">进度</Label>
          <Slider
            disabled={player.duration <= 0}
            value={[Math.min(player.currentTime, player.duration || 0)]}
            max={Math.max(player.duration, 1)}
            step={0.5}
            onValueChange={([v]) => player.seek(v)}
            className="flex-1"
          />
        </div>
        <div className="flex w-40 items-center gap-3">
          <Label className="shrink-0 text-xs text-muted-foreground">音量</Label>
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
        <div className="flex items-center gap-2">
          <Label className="shrink-0 text-xs text-muted-foreground">倍速</Label>
          <Select
            value={String(player.playbackRate)}
            onValueChange={(v) => {
              const rate = Number(v);
              player.setPlaybackRate(rate);
              void saveAppPrefs({ ...appPrefs, playbackRate: rate });
            }}
          >
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RATE_OPTIONS.map((r) => (
                <SelectItem key={r} value={String(r)}>{r}x</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

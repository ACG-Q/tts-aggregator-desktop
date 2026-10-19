import { useRef } from 'react';
import { Pause, Play, SkipForward, Square, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/PageHeader';
import { RATE_OPTIONS } from '@/components/player/PlayerControls';
import { fmtClock } from '@/lib/format';
import { readTextFile } from '@/lib/encoding';
import { voiceDisplayName } from '@/lib/voices';
import { usePlayerStore } from '@/store/playerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useVoicesStore } from '@/store/voicesStore';

export function ReadPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const player = usePlayerStore();
  const { synth, saveSynth, appPrefs, saveAppPrefs } = useSettingsStore();
  const { voices, load } = useVoicesStore();
  const idle = player.status === 'idle';
  const busy = player.status === 'running' || player.status === 'paused';

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="朗读"
        description="粘贴或导入文本，选择音色后开始朗读；支持音量/倍速与系统媒体键。"
        actions={
          <>
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-1.5 h-4 w-4" />
              导入 TXT
            </Button>
            {idle && (
              <Button onClick={() => void player.start(player.text)} disabled={!player.text.trim()}>
                <Play className="mr-1.5 h-4 w-4" />
                开始朗读
              </Button>
            )}
          </>
        }
      />

      <input
        ref={fileRef}
        type="file"
        accept=".txt,text/plain"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) player.setText(await readTextFile(file));
          e.target.value = '';
        }}
      />

      {/* 创作区：文本为主角 + 吸底参数/播放条 */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <Textarea
          value={player.text}
          onChange={(e) => player.setText(e.target.value)}
          placeholder="粘贴或输入要朗读的文本，或导入 TXT…"
          className="min-h-[260px] resize-none border-0 bg-transparent p-5 text-[15px] leading-relaxed shadow-none focus-visible:ring-0 dark:bg-transparent"
        />

        {/* 吸底工具条：音色/语速/音调 + 播放控制 */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-border bg-muted/40 px-5 py-3">
          <div className="flex items-center gap-2">
            <Label className="shrink-0 text-xs text-muted-foreground">音色</Label>
            <Select
              value={synth.voice || 'node-default'}
              onOpenChange={(open) => { if (open) void load(); }}
              onValueChange={(v) => void saveSynth({ ...synth, voice: v === 'node-default' ? '' : v })}
            >
              <SelectTrigger className="w-52"><SelectValue placeholder="节点默认音色" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="node-default">节点默认音色</SelectItem>
                {voices.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{voiceDisplayName(v)}（{v.id}）</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="shrink-0 text-xs text-muted-foreground">语速 {synth.rate}</Label>
            <Slider value={[synth.rate]} min={-100} max={100} step={1} className="w-24"
              onValueChange={([v]) => void saveSynth({ ...synth, rate: v })} />
          </div>
          <div className="flex items-center gap-2">
            <Label className="shrink-0 text-xs text-muted-foreground">音调 {synth.pitch}</Label>
            <Slider value={[synth.pitch]} min={-100} max={100} step={1} className="w-24"
              onValueChange={([v]) => void saveSynth({ ...synth, pitch: v })} />
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            {player.status === 'running' && (
              <Button variant="outline" size="icon" onClick={player.pause} title="暂停">
                <Pause className="h-4 w-4" />
              </Button>
            )}
            {player.status === 'paused' && (
              <Button size="icon" onClick={() => void player.resume()} title="继续">
                <Play className="h-4 w-4" />
              </Button>
            )}
            <Button variant="outline" size="icon" onClick={player.skipNext} disabled={idle} title="下一段">
              <SkipForward className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={player.stop} disabled={idle} title="停止"
              className="text-destructive hover:bg-destructive/10">
              <Square className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* 进度/音量/倍速 */}
      {(busy || player.segs.length > 0) && (
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex min-w-52 flex-1 items-center gap-3">
            <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {fmtClock(player.currentTime)}
            </span>
            <Slider
              disabled={player.duration <= 0}
              value={[Math.min(player.currentTime, player.duration || 0)]}
              max={Math.max(player.duration, 1)}
              step={0.5}
              onValueChange={([v]) => player.seek(v)}
              className="flex-1"
            />
            <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">
              {fmtClock(player.duration)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Label className="shrink-0 text-xs text-muted-foreground">音量</Label>
            <Slider value={[player.volume]} max={100} step={1} className="w-20"
              onValueChange={([v]) => { player.setVolume(v); void saveAppPrefs({ ...appPrefs, volume: v }); }} />
          </div>
          <div className="flex items-center gap-2">
            <Label className="shrink-0 text-xs text-muted-foreground">倍速</Label>
            <Select value={String(player.playbackRate)}
              onValueChange={(v) => { const r = Number(v); player.setPlaybackRate(r); void saveAppPrefs({ ...appPrefs, playbackRate: r }); }}>
              <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RATE_OPTIONS.map((r) => (<SelectItem key={r} value={String(r)}>{r}x</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          {player.segs.length > 0 && (
            <span className="text-xs tabular-nums text-muted-foreground">
              段 {Math.min(player.index + 1, player.segs.length)}/{player.segs.length}
            </span>
          )}
        </div>
      )}

      {player.error && <p className="text-sm text-destructive">{player.error}</p>}

      {player.segs.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-5 py-3 text-sm font-medium">
            段落 · 点击可跳转
          </div>
          <div className="max-h-96 divide-y divide-border overflow-y-auto">
            {player.segs.map((seg, i) => (
              <button
                key={i}
                onClick={() => player.jumpTo(i)}
                className={`flex w-full gap-3 px-5 py-3 text-left text-sm transition-colors hover:bg-accent ${
                  i === player.index ? 'border-l-2 border-primary bg-primary/5' : 'border-l-2 border-transparent'
                }`}
              >
                <span className="shrink-0 tabular-nums text-muted-foreground">{i + 1}</span>
                <span className={i === player.index ? '' : 'text-muted-foreground'}>{seg.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

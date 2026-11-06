import { useMemo, useRef } from 'react';
import { History, Play, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/PageHeader';
import { readTextFile } from '@/lib/encoding';
import { estimateReadingSeconds, fmtReadingDuration, LONG_TEXT_HINT } from '@/lib/estimate';
import { fmtTimeFull } from '@/lib/format';
import { splitForReading } from '@/lib/split';
import { voiceDisplayName } from '@/lib/voices';
import { usePlayerStore } from '@/store/playerStore';
import { useResumeStore } from '@/store/resumeStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useVoicesStore } from '@/store/voicesStore';

export function ReadPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const text = usePlayerStore((s) => s.text);
  const status = usePlayerStore((s) => s.status);
  const segs = usePlayerStore((s) => s.segs);
  const index = usePlayerStore((s) => s.index);
  const error = usePlayerStore((s) => s.error);
  const setText = usePlayerStore((s) => s.setText);
  const start = usePlayerStore((s) => s.start);
  const jumpTo = usePlayerStore((s) => s.jumpTo);
  const synth = useSettingsStore((s) => s.synth);
  const saveSynth = useSettingsStore((s) => s.saveSynth);
  const appPrefs = useSettingsStore((s) => s.appPrefs);
  const voices = useVoicesStore((s) => s.voices);
  const load = useVoicesStore((s) => s.load);
  const snapshot = useResumeStore((s) => s.snapshot);
  const clearSnapshot = useResumeStore((s) => s.clear);
  const idle = status === 'idle';

  const chars = text.length;
  const seconds = estimateReadingSeconds(chars);
  const idleSegCount = useMemo(() => (chars > 0 ? splitForReading(text).length : 0), [text, chars]);
  const segments = idle ? idleSegCount : segs.length;
  const resumeSegCount = useMemo(
    () => (snapshot?.source.kind === 'text' ? splitForReading(snapshot.text).length : 0),
    [snapshot],
  );
  const textSnapshot = snapshot?.source.kind === 'text' ? snapshot : null;
  const canResume = idle && appPrefs.resumeLast && textSnapshot !== null;

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
              <Button onClick={() => void start(text)} disabled={!text.trim()}>
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
          if (file) setText(await readTextFile(file));
          e.target.value = '';
        }}
      />

      {canResume && textSnapshot && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
          <History className="h-4 w-4 text-primary" />
          <div className="min-w-0 flex-1 text-sm">
            <span className="font-medium">继续上次朗读</span>
            <span className="ml-2 text-muted-foreground">
              第 {Math.min(textSnapshot.segIndex + 1, Math.max(resumeSegCount, 1))} 段 · {fmtTimeFull(textSnapshot.updatedAt)}
            </span>
          </div>
          <Button size="sm" onClick={() => void start(textSnapshot.text, textSnapshot.segIndex)}>
            继续
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void clearSnapshot()} title="忽略">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="粘贴或输入要朗读的文本，或导入 TXT…"
          className="min-h-[260px] resize-none border-0 bg-transparent p-5 text-[15px] leading-relaxed shadow-none focus-visible:ring-0 dark:bg-transparent"
        />

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
          <div className="ml-auto text-xs text-muted-foreground">
            {chars} 字 · 约 {fmtReadingDuration(seconds)}
            {segments > 0 && ` · ${segments} 段`}
          </div>
        </div>
      </div>

      {chars > LONG_TEXT_HINT && (
        <p className="text-sm text-muted-foreground">
          文本较长，将分 {splitForReading(text).length} 段合成；建议导入书库以获得更好的续听体验。
        </p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {segs.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-5 py-3 text-sm font-medium">
            段落 · 点击可跳转
          </div>
          <div className="max-h-96 divide-y divide-border overflow-y-auto">
            {segs.map((seg, i) => (
              <button
                key={i}
                onClick={() => jumpTo(i)}
                className={`flex w-full gap-3 px-5 py-3 text-left text-sm transition-colors hover:bg-accent ${
                  i === index ? 'border-l-2 border-primary bg-primary/5' : 'border-l-2 border-transparent'
                }`}
              >
                <span className="shrink-0 tabular-nums text-muted-foreground">{i + 1}</span>
                <span className={i === index ? '' : 'text-muted-foreground'}>{seg.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

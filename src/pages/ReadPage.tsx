import { useMemo, useRef, useState } from 'react';
import { ChevronDown, History, Play, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

const card = 'rounded-[13px] border border-line bg-card';

export function ReadPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [listOpen, setListOpen] = useState(true);
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
    <div className="mx-auto w-full max-w-[820px]">
      <PageHeader
        eyebrow="Reading · 朗读"
        title="把文字，交给声音"
        description="粘贴或导入文本，选一个舒服的嗓音，然后让这一页慢慢读完。"
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

      <div className="space-y-4">
        {canResume && textSnapshot && (
          <div className="flex flex-wrap items-center gap-3 rounded-[11px] border border-primary/25 bg-primary/8 px-4 py-3">
            <History className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1 text-[13px]">
              <span className="font-semibold">继续上次朗读</span>
              <span className="ml-2 text-muted-foreground">
                第 {Math.min(textSnapshot.segIndex + 1, Math.max(resumeSegCount, 1))} 段 · {fmtTimeFull(textSnapshot.updatedAt)}
              </span>
            </div>
            <Button size="sm" onClick={() => void start(textSnapshot.text, textSnapshot.segIndex)}>
              继续
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void clearSnapshot()} title="忽略" aria-label="忽略">
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="paper-surface overflow-hidden rounded-[14px] border border-line">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-2.5">
            <div className="eyebrow">朗读稿</div>
            <div className="flex items-center gap-2 text-[10.5px] text-faint">
              <span className="num">{chars} 字</span>
              <span aria-hidden="true">·</span>
              <span>约 {fmtReadingDuration(seconds)}</span>
              {segments > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="num">{segments} 段</span>
                </>
              )}
            </div>
          </div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="粘贴或输入要朗读的文本，或导入 TXT…"
            className="min-h-[300px] resize-none rounded-none border-0 bg-transparent px-6 py-6 text-[16.5px] leading-[2.02] tracking-[0.012em] text-paper-foreground shadow-none placeholder:text-faint focus-visible:ring-0 dark:bg-transparent"
          />
          <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-2.5 text-[10.5px] text-faint">
            <span>支持 TXT · 自动按段落切分</span>
            <span>本地保存</span>
          </div>
        </div>

        <div className={`${card} grid gap-5 px-5 py-4 sm:grid-cols-3`}>
          <div className="min-w-0">
            <div className="eyebrow mb-2">音色</div>
            <Select
              value={synth.voice || 'node-default'}
              onOpenChange={(open) => { if (open) void load(); }}
              onValueChange={(v) => void saveSynth({ ...synth, voice: v === 'node-default' ? '' : v, style: '' })}
            >
              <SelectTrigger className="h-9 w-full"><SelectValue placeholder="节点默认音色" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="node-default">节点默认音色</SelectItem>
                {voices.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{voiceDisplayName(v)}（{v.id}）</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0">
            <div className="mb-2.5 flex items-baseline justify-between">
              <span className="eyebrow">语速</span>
              <b className="text-[11px] font-semibold num text-muted-foreground">{synth.rate > 0 ? `+${synth.rate}` : synth.rate}</b>
            </div>
            <Slider value={[synth.rate]} min={-100} max={100} step={1}
              onValueChange={([v]) => void saveSynth({ ...synth, rate: v })} />
          </div>
          <div className="min-w-0">
            <div className="mb-2.5 flex items-baseline justify-between">
              <span className="eyebrow">音调</span>
              <b className="text-[11px] font-semibold num text-muted-foreground">{synth.pitch > 0 ? `+${synth.pitch}` : synth.pitch}</b>
            </div>
            <Slider value={[synth.pitch]} min={-100} max={100} step={1}
              onValueChange={([v]) => void saveSynth({ ...synth, pitch: v })} />
          </div>
        </div>

        {chars > LONG_TEXT_HINT && (
          <div className="flex items-start gap-2.5 rounded-[11px] border border-line bg-surface-2 px-4 py-3 text-[12px] text-muted-foreground">
            <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border border-line-strong text-[9px] font-bold text-faint">!</span>
            <span>文本较长，将分 {splitForReading(text).length} 段合成；建议导入书库以获得更好的续听体验。</span>
          </div>
        )}

        {error && (
          <p className="rounded-[10px] border border-destructive/30 bg-destructive/8 px-4 py-3 text-[12.5px] text-destructive">
            {error}
          </p>
        )}

        {segs.length > 0 && (
          <div className={`${card} overflow-hidden`}>
            <button
              type="button"
              onClick={() => setListOpen((v) => !v)}
              aria-expanded={listOpen}
              className="flex w-full items-center gap-2 px-5 py-3 text-left text-[12.5px] font-semibold transition-colors hover:bg-surface-2"
            >
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${listOpen ? '' : '-rotate-90'}`} />
              段落 · 点击跳转
              <span className="ml-auto text-[11px] font-normal text-faint num">{segs.length} 段</span>
            </button>
            {listOpen && (
              <div className="max-h-96 divide-y divide-line overflow-y-auto border-t border-line">
                {segs.map((seg, i) => (
                  <button
                    key={i}
                    onClick={() => jumpTo(i)}
                    className={`flex w-full items-start gap-3 px-5 py-3 text-left text-[12.5px] transition-colors hover:bg-surface-2 ${
                      i === index ? 'bg-primary/8' : ''
                    }`}
                  >
                    <span className={`shrink-0 text-[10.5px] num ${i === index ? 'font-semibold text-primary' : 'text-faint'}`}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className={i === index ? 'text-foreground' : 'text-muted-foreground'}>{seg.text}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

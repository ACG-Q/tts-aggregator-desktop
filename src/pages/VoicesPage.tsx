import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Pause, Play, RefreshCw, Search, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/PageHeader';
import { playAudition, stopAudition } from '@/lib/audition';
import { styleDisplayName, voiceDisplayName } from '@/lib/voices';
import {
  LANGUAGE_OPTIONS, filterVoices, groupByLanguage, languageBucket, pushRecentVoice, readRecentVoices,
  sortVoicesByLanguage,
  type LanguageBucket,
} from '@/lib/voiceFilter';
import { synthesizeText } from '@/store/poolDeps';
import { useSettingsStore } from '@/store/settingsStore';
import { useVoicesStore } from '@/store/voicesStore';
import type { Voice } from '@/types/models';

const PAGE_SIZE = 60;

const GENDER_OPTIONS: { value: '' | 'Female' | 'Male'; label: string }[] = [
  { value: '', label: '全部' },
  { value: 'Female', label: '女' },
  { value: 'Male', label: '男' },
];

function genderLabel(gender: string): string {
  if (gender === 'Female') return '女';
  if (gender === 'Male') return '男';
  return gender;
}

function VoiceRow({ v, isDefault, defaultStyle, auditioningKey, onAudition, onSetDefault }: {
  v: Voice;
  isDefault: boolean;
  defaultStyle: string;
  auditioningKey: string | null;
  onAudition: (style: string) => void;
  onSetDefault: (style: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState(isDefault ? defaultStyle : '');
  const styles = v.styles ?? [];
  const busy = auditioningKey === `${v.id}:${style}`;
  const hasStyles = styles.length > 0;
  const hasIntro = Boolean(v.introZh);

  return (
    <div className="px-4 py-3 transition-colors hover:bg-surface-2">
      <div className="grid grid-cols-[36px_minmax(0,1fr)_auto_24px] items-center gap-3 lg:grid-cols-[36px_minmax(0,210px)_1fr_auto_auto_24px]">
        <div className="grid h-9 w-9 place-items-center rounded-[9px] border border-line bg-surface-2 text-[13px] font-semibold text-muted-foreground">
          {voiceDisplayName(v).slice(0, 1) || '音'}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[12.5px] font-semibold">{voiceDisplayName(v)}</div>
          <div className="truncate font-mono text-[10px] text-faint">{v.id}</div>
        </div>
        <div className="hidden min-w-0 flex-wrap gap-1.5 lg:flex">
          <span className="inline-flex h-[21px] items-center rounded-md border border-line bg-surface-2 px-1.5 text-[10px] text-muted-foreground">{v.locale}</span>
          <span className="inline-flex h-[21px] items-center rounded-md border border-line bg-surface-2 px-1.5 text-[10px] text-muted-foreground">{genderLabel(v.gender)}</span>
          <span className="inline-flex h-[21px] items-center rounded-md border border-line bg-surface-2 px-1.5 text-[10px] text-muted-foreground">
            {hasStyles ? `${styles.length} 种风格` : '无风格'}
          </span>
        </div>
        <div className="hidden w-14 justify-center lg:flex">
          {isDefault
            ? <Badge className="bg-primary/12 text-primary hover:bg-primary/12">默认</Badge>
            : <span className="text-[10px] text-faint">—</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAudition(style)}
            className={cn(busy && 'border-primary text-primary')}
          >
            {busy
              ? <><Pause className="mr-1 h-3.5 w-3.5" />停止</>
              : <><Play className="mr-1 h-3.5 w-3.5" />试听</>}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={isDefault && style === defaultStyle}
            onClick={() => onSetDefault(style)}
            className="hidden sm:inline-flex"
          >
            <Volume2 className="mr-1 h-3.5 w-3.5" />
            {isDefault && style === defaultStyle ? '当前默认' : '设为默认'}
          </Button>
        </div>
        <button
          type="button"
          aria-label={open ? '收起风格' : '展开风格'}
          aria-expanded={open}
          disabled={!hasStyles && !hasIntro}
          onClick={() => setOpen((x) => !x)}
          className={cn(
            'grid h-6 w-6 place-items-center rounded-md text-faint hover:bg-surface-3 hover:text-foreground',
            !hasStyles && !hasIntro && 'invisible',
          )}
        >
          <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
        </button>
      </div>

      {open && (hasStyles || hasIntro) && (
        <div className="mt-2.5 border-t border-line pl-0 pt-2.5 md:pl-12">
          {hasIntro && (
            <p className="mb-2 text-[11.5px] leading-relaxed text-muted-foreground">{v.introZh}</p>
          )}
          {hasStyles && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-faint">风格</span>
              {['', ...styles].map((s) => (
                <button
                  key={s || 'default'}
                  type="button"
                  aria-pressed={style === s}
                  onClick={() => {
                    setStyle(s);
                    onAudition(s);
                  }}
                  className={cn(
                    'inline-flex h-[24px] items-center rounded-full border px-2 text-[10.5px] transition-colors',
                    style === s
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-line bg-surface-2 text-muted-foreground hover:border-line-strong hover:text-foreground',
                  )}
                >
                  {s ? styleDisplayName(s) : '默认'}
                  {style === s && <Check className="ml-1 h-3 w-3" />}
                </button>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => onSetDefault(style)}
              >
                <Volume2 className="mr-1 h-3.5 w-3.5" />
                设为默认{style ? `（${styleDisplayName(style)}）` : ''}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function VoicesPage() {
  const { voices, loading, error, load, source } = useVoicesStore();
  const { synth, saveSynth } = useSettingsStore();
  const [q, setQ] = useState('');
  const [language, setLanguage] = useState<LanguageBucket | 'all'>('all');
  const [gender, setGender] = useState<'' | 'Female' | 'Male'>('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [auditioning, setAuditioning] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>(() => readRecentVoices(localStorage));

  useEffect(() => { void load(); }, []);

  const shown = useMemo(
    () => sortVoicesByLanguage(filterVoices(voices, { query: q, language, gender })),
    [voices, q, language, gender],
  );
  const visible = shown.slice(0, limit);
  const searching = q.trim().length > 0 || language !== 'all' || gender !== '';
  const groups = useMemo(() => groupByLanguage(visible), [visible]);
  const bucketTotals = useMemo(() => {
    const map = new Map<LanguageBucket, number>();
    for (const v of shown) {
      const b = languageBucket(v.locale);
      map.set(b, (map.get(b) ?? 0) + 1);
    }
    return map;
  }, [shown]);
  const recentVoices = useMemo(
    () => recent
      .map((id) => voices.find((v) => v.id === id))
      .filter((v): v is Voice => Boolean(v))
      .slice(0, 8),
    [recent, voices],
  );
  const defaultVoice = voices.find((v) => v.id === synth.voice);

  function resetLimit(): void {
    setLimit(PAGE_SIZE);
  }

  function record(id: string): void {
    setRecent(pushRecentVoice(localStorage, id));
  }

  async function audition(v: Voice, style: string): Promise<void> {
    const key = `${v.id}:${style}`;
    if (auditioning === key) {
      stopAudition();
      setAuditioning(null);
      return;
    }
    stopAudition();
    setAuditioning(key);
    try {
      const { bytes } = await synthesizeText('你好，这是一段试听。', {
        voice: v.id, rate: synth.rate, pitch: synth.pitch, style,
      });
      await playAudition(bytes);
      record(v.id);
    } catch (e) {
      toast.error(`试听失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAuditioning(null);
    }
  }

  function setDefault(v: Voice, style: string): void {
    void saveSynth({ ...synth, voice: v.id, style });
    record(v.id);
    toast.success(`默认音色已设为 ${voiceDisplayName(v)}${style ? ` · ${styleDisplayName(style)}` : ''}`);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Voices · 音色"
        title="音色库"
        description="搜索、试听并设置默认音色；带风格的音色可以连同风格一起保存。"
        actions={
          <Button variant="outline" onClick={() => void load(true)} disabled={loading}>
            <RefreshCw className={cn('mr-1.5 h-4 w-4', loading && 'animate-spin')} />
            {loading ? '拉取中…' : '重新拉取'}
          </Button>
        }
      />

      <div className="sticky top-[54px] z-20 -mx-1 mb-3.5 rounded-[13px] border border-line bg-card/95 p-3 backdrop-blur md:top-0">
        <div className="relative mb-2.5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
          <Input
            placeholder="搜索音色名或 ID"
            className="h-9 w-full pl-8"
            value={q}
            onChange={(e) => { setQ(e.target.value); resetLimit(); }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5">
            {LANGUAGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={language === opt.value}
                onClick={() => { setLanguage(opt.value); resetLimit(); }}
                className={cn(
                  'inline-flex h-[26px] items-center rounded-full border px-2.5 text-[10.5px] transition-colors',
                  language === opt.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-line bg-surface-2 text-muted-foreground hover:border-line-strong hover:text-foreground',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex gap-0.5 rounded-[9px] border border-line bg-surface-2 p-[3px]">
            {GENDER_OPTIONS.map((opt) => (
              <button
                key={opt.value || 'all'}
                type="button"
                aria-pressed={gender === opt.value}
                onClick={() => { setGender(opt.value); resetLimit(); }}
                className={cn(
                  'h-[24px] rounded-md px-2.5 text-[10.5px] transition-colors',
                  gender === opt.value
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-faint num">
            {shown.length} 个{source === 'builtin' ? ' · 内置库' : ''}
          </span>
        </div>
      </div>

      {error && (
        <p className="mb-3 rounded-[10px] border border-destructive/30 bg-destructive/8 px-4 py-2.5 text-[12px] text-destructive">
          {error}
        </p>
      )}

      <div className="mb-3.5 flex flex-wrap items-center gap-3 rounded-[13px] border border-primary/25 bg-primary/[0.06] px-4 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] border border-primary/25 bg-primary/10 text-primary">
          <Volume2 className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="text-[9.5px] uppercase tracking-[0.14em] text-faint">当前默认</div>
          <div className="truncate text-[13px] font-semibold">
            {defaultVoice ? voiceDisplayName(defaultVoice) : '节点默认音色'}
          </div>
          <div className="truncate font-mono text-[10px] text-faint">{synth.voice || '由节点决定'}</div>
        </div>
        {synth.style && <Badge variant="secondary">风格 · {styleDisplayName(synth.style)}</Badge>}
        <Badge className="ml-auto bg-primary/12 text-primary hover:bg-primary/12">默认</Badge>
      </div>

      {!searching && recentVoices.length > 0 && (
        <div className="mb-3.5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground">最近常用</span>
            <span className="text-[10px] text-faint">试听或设为默认后记录</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {recentVoices.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => void audition(v, synth.voice === v.id ? synth.style : '')}
                className="inline-flex h-[30px] items-center gap-1.5 rounded-full border border-line bg-card px-3 text-[11.5px] hover:border-primary/40"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                {voiceDisplayName(v)}
                {auditioning?.startsWith(`${v.id}:`) && <Pause className="h-3 w-3 text-primary" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {visible.length > 0 ? (
        <div className="overflow-hidden rounded-[13px] border border-line bg-card">
          {searching ? (
            <div className="divide-y divide-line">
              {visible.map((v) => (
                <VoiceRow
                  key={v.id}
                  v={v}
                  isDefault={synth.voice === v.id}
                  defaultStyle={synth.style}
                  auditioningKey={auditioning}
                  onAudition={(style) => void audition(v, style)}
                  onSetDefault={(style) => setDefault(v, style)}
                />
              ))}
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.bucket}>
                <div className="flex items-center justify-between border-b border-line bg-surface-2 px-4 py-2">
                  <span className="text-[11px] font-semibold">{g.label}</span>
                  <span className="text-[10.5px] text-faint num">{bucketTotals.get(g.bucket) ?? g.voices.length} 个</span>
                </div>
                <div className="divide-y divide-line">
                  {g.voices.map((v) => (
                    <VoiceRow
                      key={v.id}
                      v={v}
                      isDefault={synth.voice === v.id}
                      defaultStyle={synth.style}
                      auditioningKey={auditioning}
                      onAudition={(style) => void audition(v, style)}
                      onSetDefault={(style) => setDefault(v, style)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
          {limit < shown.length && (
            <div className="border-t border-line p-3 text-center">
              <Button variant="outline" onClick={() => setLimit((x) => x + PAGE_SIZE)}>
                加载更多（剩余 {shown.length - limit}）
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-[13px] border border-line bg-card py-16 text-center text-[12px] text-muted-foreground">
          {voices.length ? '没有匹配的音色，试试换个关键词或语言' : '还没有音色，请先添加节点并探测'}
        </div>
      )}
    </div>
  );
}

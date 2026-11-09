import { useEffect, useMemo, useState } from 'react';
import { Pause, Play, RefreshCw, Search, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';
import { playAudition, stopAudition } from '@/lib/audition';
import { voiceDisplayName } from '@/lib/voices';
import { synthesizeText } from '@/store/poolDeps';
import { useSettingsStore } from '@/store/settingsStore';
import { useVoicesStore } from '@/store/voicesStore';
import type { Voice } from '@/types/models';

const PAGE_SIZE = 50;

const genderLabel = (g: string) => (g === 'Female' ? '女' : g === 'Male' ? '男' : g);

function VoiceRow({ v, isDefault, auditioning, onAudition, onSetDefault }: {
  v: Voice;
  isDefault: boolean;
  auditioning: boolean;
  onAudition: () => void;
  onSetDefault: () => void;
}) {
  const tags = [v.gender && genderLabel(v.gender), v.locale, ...(v.styles ?? [])].filter(Boolean) as string[];
  return (
    <div className="grid grid-cols-[36px_1fr_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2 md:grid-cols-[36px_minmax(0,220px)_1fr_auto_auto]">
      <div className="grid h-9 w-9 place-items-center rounded-[9px] border border-line bg-surface-2 text-[13px] font-semibold text-muted-foreground">
        {voiceDisplayName(v).slice(0, 1) || '音'}
      </div>
      <div className="min-w-0">
        <div className="truncate text-[12.5px] font-semibold">{voiceDisplayName(v)}</div>
        <div className="truncate font-mono text-[10px] text-faint">{v.id}</div>
      </div>
      <div className="hidden flex-wrap gap-1.5 md:flex">
        {tags.map((t) => (
          <span key={t} className="inline-flex h-[21px] items-center rounded-md border border-line bg-surface-2 px-1.5 text-[10px] text-muted-foreground">
            {t}
          </span>
        ))}
      </div>
      <div className="hidden w-14 justify-center md:flex">
        {isDefault
          ? <Badge className="bg-primary/12 text-primary hover:bg-primary/12">默认</Badge>
          : <span className="text-[10px] text-faint">—</span>}
      </div>
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={onAudition}
          className={cn(auditioning && 'border-primary text-primary')}
        >
          {auditioning
            ? <><Pause className="mr-1 h-3.5 w-3.5" />停止</>
            : <><Play className="mr-1 h-3.5 w-3.5" />试听</>}
        </Button>
        <Button variant="ghost" size="sm" disabled={isDefault} onClick={onSetDefault} className="hidden sm:inline-flex">
          <Volume2 className="mr-1 h-3.5 w-3.5" />
          {isDefault ? '当前默认' : '设为默认'}
        </Button>
      </div>
    </div>
  );
}

export function VoicesPage() {
  const { voices, loading, error, load } = useVoicesStore();
  const { synth, saveSynth } = useSettingsStore();
  const [q, setQ] = useState('');
  const [gender, setGender] = useState('');
  const [locale, setLocale] = useState('');
  const [auditioning, setAuditioning] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => { void load(); }, []);

  const locales = useMemo(() => [...new Set(voices.map((v) => v.locale).filter(Boolean))], [voices]);
  const shown = voices.filter((v) =>
    (!gender || v.gender === gender)
    && (!locale || v.locale === locale)
    && (!q || voiceDisplayName(v).includes(q) || v.id.toLowerCase().includes(q.toLowerCase())));
  const pageItems = shown.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  async function audition(id: string): Promise<void> {
    if (auditioning === id) {
      stopAudition();
      setAuditioning(null);
      return;
    }
    stopAudition();
    setAuditioning(id);
    try {
      const { bytes } = await synthesizeText('你好，这是一段试听。', { voice: id, rate: synth.rate, pitch: synth.pitch, style: '' });
      await playAudition(bytes);
    } catch (e) {
      toast.error(`试听失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAuditioning(null);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Voices · 音色"
        title="音色库"
        description="浏览、试听并设置默认音色。音色来自当前节点池。"
        actions={
          <Button variant="outline" onClick={() => void load(true)} disabled={loading}>
            <RefreshCw className={cn('mr-1.5 h-4 w-4', loading && 'animate-spin')} />
            {loading ? '拉取中…' : '重新拉取'}
          </Button>
        }
      />

      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
          <Input placeholder="搜索音色名 / ID" className="h-9 w-60 pl-8" value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        </div>
        <Select value={gender || 'all-gender'} onValueChange={(v) => { setGender(v === 'all-gender' ? '' : v); setPage(0); }}>
          <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all-gender">全部性别</SelectItem>
            <SelectItem value="Female">女</SelectItem>
            <SelectItem value="Male">男</SelectItem>
          </SelectContent>
        </Select>
        <Select value={locale || 'all-locale'} onValueChange={(v) => { setLocale(v === 'all-locale' ? '' : v); setPage(0); }}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all-locale">全部语言</SelectItem>
            {locales.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="ml-auto text-[11.5px] text-faint num">共 {shown.length} 个</span>
      </div>

      {error && (
        <p className="mb-3 rounded-[10px] border border-destructive/30 bg-destructive/8 px-4 py-2.5 text-[12px] text-destructive">
          {error}
        </p>
      )}

      {pageItems.length > 0 ? (
        <div className="overflow-hidden rounded-[13px] border border-line bg-card">
          <div className="divide-y divide-line">
            {pageItems.map((v) => (
              <VoiceRow
                key={v.id}
                v={v}
                isDefault={synth.voice === v.id}
                auditioning={auditioning === v.id}
                onAudition={() => void audition(v.id)}
                onSetDefault={() => void saveSynth({ ...synth, voice: v.id })}
              />
            ))}
          </div>
          <div className="border-t border-line px-4 py-2.5">
            <Pagination page={page} pageSize={PAGE_SIZE} total={shown.length} onPage={setPage} />
          </div>
        </div>
      ) : (
        <div className="rounded-[13px] border border-line bg-card py-16 text-center text-[12px] text-muted-foreground">
          {voices.length ? '没有匹配的音色' : '还没有音色，请先添加节点并探测'}
        </div>
      )}
    </div>
  );
}

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

function VoiceCard({ v, isDefault, auditioning, onAudition, onSetDefault }: {
  v: Voice;
  isDefault: boolean;
  auditioning: boolean;
  onAudition: () => void;
  onSetDefault: () => void;
}) {
  const playing = auditioning;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium">{voiceDisplayName(v)}</div>
          <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{v.id}</div>
        </div>
        {isDefault && (
          <Badge className="shrink-0 bg-success/15 text-success hover:bg-success/15">默认</Badge>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
        {v.gender && <span>{genderLabel(v.gender)}</span>}
        {v.locale && <span>· {v.locale}</span>}
        {v.styles && v.styles.length > 0 && <span>· {v.styles.join('/')}</span>}
      </div>
      <div className="mt-3 flex gap-2">
        <Button variant="outline" size="sm" onClick={onAudition}
          className={cn(playing && 'border-primary text-primary')}>
          {playing
            ? <><Pause className="mr-1 h-3.5 w-3.5" />停止试听</>
            : <><Play className="mr-1 h-3.5 w-3.5" />试听</>}
        </Button>
        <Button variant="outline" size="sm" disabled={isDefault} onClick={onSetDefault}>
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
    <div className="space-y-6">
      <PageHeader
        title="音色"
        description="浏览、试听并设置默认音色。"
        actions={
          <Button variant="outline" onClick={() => void load(true)} disabled={loading}>
            <RefreshCw className={cn('mr-1.5 h-4 w-4', loading && 'animate-spin')} />
            {loading ? '拉取中…' : '重新拉取'}
          </Button>
        }
      />

      {/* 过滤条 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="搜索音色名 / ID" className="w-64 pl-9" value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        </div>
        <Select value={gender || 'all-gender'} onValueChange={(v) => { setGender(v === 'all-gender' ? '' : v); setPage(0); }}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all-gender">全部性别</SelectItem>
            <SelectItem value="Female">女</SelectItem>
            <SelectItem value="Male">男</SelectItem>
          </SelectContent>
        </Select>
        <Select value={locale || 'all-locale'} onValueChange={(v) => { setLocale(v === 'all-locale' ? '' : v); setPage(0); }}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all-locale">全部语言</SelectItem>
            {locales.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="ml-auto text-sm text-muted-foreground">共 {shown.length} 个</span>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* 卡片网格 */}
      {pageItems.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pageItems.map((v) => (
            <VoiceCard
              key={v.id}
              v={v}
              isDefault={synth.voice === v.id}
              auditioning={auditioning === v.id}
              onAudition={() => void audition(v.id)}
              onSetDefault={() => void saveSynth({ ...synth, voice: v.id })}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card py-16 text-center text-muted-foreground">
          {voices.length ? '没有匹配的音色' : '还没有音色，请先添加节点并探测'}
        </div>
      )}

      <Pagination page={page} pageSize={PAGE_SIZE} total={shown.length} onPage={setPage} />
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pagination } from '@/components/Pagination';
import { playAudition, stopAudition } from '@/lib/audition';
import { voiceDisplayName } from '@/lib/voices';
import { synthesizeText } from '@/store/poolDeps';
import { useSettingsStore } from '@/store/settingsStore';
import { useVoicesStore } from '@/store/voicesStore';

const PAGE_SIZE = 50;

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
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">音色</h1>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 pt-6">
          <Button variant="outline" onClick={() => void load(true)} disabled={loading}>
            <RefreshCw className="mr-1 h-4 w-4" />
            {loading ? '拉取中…' : '重新拉取'}
          </Button>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="搜索音色名 / ID" className="w-64 pl-8" value={q}
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
          <span className="ml-auto text-sm text-muted-foreground">{shown.length} 个</span>
        </CardContent>
        {error && <CardContent className="pt-0 text-sm text-destructive">{error}</CardContent>}
      </Card>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>性别</TableHead>
                <TableHead>语言</TableHead>
                <TableHead>风格</TableHead>
                <TableHead className="w-40">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">{voiceDisplayName(v)}</TableCell>
                  <TableCell className="font-mono text-muted-foreground">{v.id}</TableCell>
                  <TableCell>{v.gender === 'Female' ? '女' : v.gender === 'Male' ? '男' : v.gender || '—'}</TableCell>
                  <TableCell>{v.locale || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{v.styles?.length ? v.styles.join(' / ') : '—'}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" disabled={auditioning !== null && auditioning !== v.id}
                        onClick={() => void audition(v.id)}>
                        {auditioning === v.id ? '停止试听' : '试听'}
                      </Button>
                      <Button variant="outline" size="sm" disabled={synth.voice === v.id}
                        onClick={() => void saveSynth({ ...synth, voice: v.id })}>
                        {synth.voice === v.id ? '当前默认' : '设为默认'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {pageItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    {voices.length ? '没有匹配的音色' : '还没有音色，请先添加节点并探测'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <Pagination page={page} pageSize={PAGE_SIZE} total={shown.length} onPage={setPage} />
        </CardContent>
      </Card>
    </div>
  );
}

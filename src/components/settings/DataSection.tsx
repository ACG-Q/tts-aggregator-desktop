import { useEffect, useState, type ReactNode } from 'react';
import { Database, Download, Upload } from 'lucide-react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  buildConfigFile, mergeImportedNode, parseConfigFile,
} from '@/lib/configTransfer';
import { normalizeBaseUrl } from '@/types/models';
import { deps } from '@/store/deps';
import { useLogsStore } from '@/store/logsStore';
import { useNodesStore } from '@/store/nodesStore';
import { useSettingsStore } from '@/store/settingsStore';

function stamp(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

function Row({ title, desc, control }: { title: string; desc: string; control: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-6 border-t border-line py-[15px]">
      <div className="min-w-0">
        <b className="block text-[12.5px] font-semibold">{title}</b>
        <span className="mt-[3px] block text-[10.5px] text-muted-foreground">{desc}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2.5">{control}</div>
    </div>
  );
}

export function DataSection() {
  const synth = useSettingsStore((s) => s.synth);
  const appPrefs = useSettingsStore((s) => s.appPrefs);
  const saveSynth = useSettingsStore((s) => s.saveSynth);
  const saveAppPrefs = useSettingsStore((s) => s.saveAppPrefs);
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const [stats, setStats] = useState<{ books: number; chapters: number } | null>(null);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    let alive = true;
    void deps().books.getAll()
      .then((books) => {
        if (!alive) return;
        setStats({
          books: books.length,
          chapters: books.reduce((sum, b) => sum + b.chapterCount, 0),
        });
      })
      .catch((e: unknown) => {
        console.warn('读取数据库统计失败', e);
      });
    return () => { alive = false; };
  }, []);

  async function onClearLogs(): Promise<void> {
    setClearing(true);
    try {
      await useLogsStore.getState().clear();
      toast.success('已清空全部日志');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setClearing(false);
    }
  }

  async function onExport(): Promise<void> {
    setBusy('export');
    try {
      const path = await save({
        defaultPath: `tts-aggregator-config-${stamp()}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!path) return;
      const file = buildConfigFile(
        useNodesStore.getState().nodes,
        synth,
        appPrefs,
      );
      await writeTextFile(path, JSON.stringify(file, null, 2));
      toast.success('配置已导出（不含 API Key）');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function onImport(): Promise<void> {
    setBusy('import');
    try {
      const picked = await open({
        multiple: false,
        directory: false,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!picked || Array.isArray(picked)) return;
      const file = parseConfigFile(await readTextFile(picked));
      const existing = new Map(
        useNodesStore.getState().nodes.map((n) => [normalizeBaseUrl(n.baseUrl), n]),
      );
      const merged = new Map<string, ReturnType<typeof mergeImportedNode>>();
      for (const item of file.nodes) {
        merged.set(item.url, mergeImportedNode(existing.get(item.url), item));
      }
      for (const node of merged.values()) {
        await deps().nodes.upsert(node);
      }
      await useNodesStore.getState().load();
      await saveSynth(file.settings.synth);
      await saveAppPrefs(file.settings.appPrefs);
      void useNodesStore.getState().probeAll();
      toast.success(`已导入 ${file.nodes.length} 个节点并恢复偏好`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-[17px] font-semibold tracking-[-0.01em]">数据</h2>
        <p className="mt-1 text-[11.5px] text-muted-foreground">备份节点与偏好设置，不含 API Key 与分享 Token。</p>
      </div>
      <div className="mb-3.5 rounded-[13px] border border-line bg-card px-[18px] py-1">
        <div className="pb-0.5 pt-3.5 text-[12px] font-semibold">配置迁移</div>
        <Row
          title="导出配置"
          desc="包含设置、节点列表（不含 API Key）与调度参数。"
          control={
            <Button variant="outline" onClick={() => void onExport()} disabled={busy !== null}>
              <Download className="mr-1.5 h-4 w-4" />
              {busy === 'export' ? '导出中…' : '导出配置'}
            </Button>
          }
        />
        <Row
          title="导入配置"
          desc="从 JSON 文件恢复设置与节点列表。"
          control={
            <Button variant="outline" onClick={() => void onImport()} disabled={busy !== null}>
              <Upload className="mr-1.5 h-4 w-4" />
              {busy === 'import' ? '导入中…' : '导入配置'}
            </Button>
          }
        />
      </div>

      <div className="mb-3.5 rounded-[13px] border border-line bg-card px-[18px] py-1">
        <div className="pb-0.5 pt-3.5 text-[12px] font-semibold">数据库</div>
        <Row
          title="本地数据库"
          desc="书库、章节与朗读进度。"
          control={
            <Badge variant="secondary" className="num gap-1.5 px-2.5 py-1 text-[11px]">
              <Database className="h-3.5 w-3.5" />
              {stats ? `${stats.books} 本书 · ${stats.chapters} 章` : '—'}
            </Badge>
          }
        />
      </div>

      <div className="mb-3.5 rounded-[13px] border border-line bg-card px-[18px] py-1">
        <div className="pb-0.5 pt-3.5 text-[12px] font-semibold text-destructive">危险操作</div>
        <Row
          title="清空调用日志"
          desc="删除全部调用记录，不影响节点与书库。"
          control={
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={clearing}>
                  {clearing ? '清空中…' : '清空日志'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>清空全部调用日志？</AlertDialogTitle>
                  <AlertDialogDescription>
                    此操作不可恢复。节点、书库与朗读进度不会被删除。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={() => void onClearLogs()}>
                    确认清空
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          }
        />
      </div>
    </section>
  );
}

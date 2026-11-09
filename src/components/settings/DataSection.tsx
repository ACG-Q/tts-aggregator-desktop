import { useState, type ReactNode } from 'react';
import { Download, Upload } from 'lucide-react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  buildConfigFile, mergeImportedNode, parseConfigFile,
} from '@/lib/configTransfer';
import { normalizeBaseUrl } from '@/types/models';
import { deps } from '@/store/deps';
import { notifyShare } from '@/store/shareSync';
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
      await notifyShare();
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
    </section>
  );
}

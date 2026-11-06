import { useState } from 'react';
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
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-medium">数据</h2>
        <p className="text-sm text-muted-foreground">
          备份节点与偏好设置，不含 API Key 与分享 Token。
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void onExport()} disabled={busy !== null}>
          <Download className="mr-1.5 h-4 w-4" />
          {busy === 'export' ? '导出中…' : '导出配置'}
        </Button>
        <Button variant="outline" onClick={() => void onImport()} disabled={busy !== null}>
          <Upload className="mr-1.5 h-4 w-4" />
          {busy === 'import' ? '导入中…' : '导入配置'}
        </Button>
      </div>
    </section>
  );
}

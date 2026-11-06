import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/PageHeader';
import { DataSection } from '@/components/settings/DataSection';
import { voiceDisplayName } from '@/lib/voices';
import { useNodesStore } from '@/store/nodesStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useVoicesStore } from '@/store/voicesStore';
import { notifyShare } from '@/store/shareSync';
import {
  COOLDOWN_MINUTES_OPTIONS, FAIL_THRESHOLD_OPTIONS, SLEEP_MINUTES_OPTIONS,
  type ThemeMode,
} from '@/types/models';

const THEME_OPTIONS: [ThemeMode, string][] = [
  ['system', '跟随系统'], ['light', '浅色'], ['dark', '深色'],
];

type SectionKey = 'voice' | 'appearance' | 'schedule' | 'data' | 'share';

const SECTIONS: [SectionKey, string][] = [
  ['voice', '语音参数'],
  ['appearance', '外观与播放'],
  ['schedule', '调度与探测'],
  ['data', '数据'],
  ['share', '局域网分享'],
];

export function SettingsPage() {
  const { synth, saveSynth, appPrefs, saveAppPrefs, share, saveShare } = useSettingsStore();
  const { voices } = useVoicesStore();
  const probing = useNodesStore((s) => s.probing);
  const [copied, setCopied] = useState(false);
  const [ip, setIp] = useState('');
  const [running, setRunning] = useState(false);
  const [active, setActive] = useState<SectionKey>('voice');

  useEffect(() => {
    void invoke<string>('share_local_ip').then(setIp).catch(() => setIp('127.0.0.1'));
    void invoke<boolean>('share_status').then(setRunning).catch(() => setRunning(false));
  }, []);

  async function toggleShare(): Promise<void> {
    try {
      if (running) {
        await invoke('share_stop');
        setRunning(false);
      } else {
        await invoke('share_start', { port: share.port, token: share.token });
        await notifyShare();
        setRunning(true);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  function shareUrl(): string {
    const host = share.localhostOnly ? '127.0.0.1' : ip || '127.0.0.1';
    return `http://${host}:${share.port}/nodes.json?token=${share.token}`;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="设置" description="语音参数、外观播放、探测与局域网分享。" />

      <div className="grid gap-8 md:grid-cols-[200px_1fr]">
        {/* 左侧小节导航 */}
        <nav className="h-fit md:sticky md:top-8">
          <div className="flex gap-1 rounded-lg bg-muted p-1 md:flex-col">
            {SECTIONS.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActive(key)}
                className={cn(
                  'rounded-md px-3 py-2 text-left text-sm transition-colors',
                  active === key
                    ? 'bg-card font-medium text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </nav>

        {/* 右侧内容 */}
        <div className="max-w-2xl">
          {active === 'voice' && (
            <section className="space-y-4">
              <div>
                <h2 className="text-base font-medium">语音参数</h2>
                <p className="text-sm text-muted-foreground">作用于朗读与试听。</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">默认音色</Label>
                  <Select
                    value={synth.voice || 'node-default'}
                    onOpenChange={(open) => { if (open) void useVoicesStore.getState().load(); }}
                    onValueChange={(v) => void saveSynth({ ...synth, voice: v === 'node-default' ? '' : v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="node-default">节点默认音色</SelectItem>
                      {voices.map((v) => (
                        <SelectItem key={v.id} value={v.id}>{voiceDisplayName(v)}（{v.id}）</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">语速 {synth.rate}</Label>
                  <Slider value={[synth.rate]} min={-100} max={100} step={1}
                    onValueChange={([v]) => void saveSynth({ ...synth, rate: v })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">音调 {synth.pitch}</Label>
                  <Slider value={[synth.pitch]} min={-100} max={100} step={1}
                    onValueChange={([v]) => void saveSynth({ ...synth, pitch: v })} />
                </div>
              </div>
            </section>
          )}

          {active === 'appearance' && (
            <section className="space-y-4">
              <div>
                <h2 className="text-base font-medium">外观与播放</h2>
                <p className="text-sm text-muted-foreground">主题与默认播放速度。</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">主题</Label>
                  <Select value={appPrefs.theme} onValueChange={(v) => void saveAppPrefs({ ...appPrefs, theme: v as ThemeMode })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {THEME_OPTIONS.map(([mode, label]) => (
                        <SelectItem key={mode} value={mode}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">默认倍速 {appPrefs.playbackRate}x</Label>
                  <Slider value={[appPrefs.playbackRate]} min={0.5} max={2} step={0.25}
                    onValueChange={([v]) => void saveAppPrefs({ ...appPrefs, playbackRate: v })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">默认睡眠定时</Label>
                  <Select
                    value={String(appPrefs.sleepMinutes)}
                    onValueChange={(v) => void saveAppPrefs({ ...appPrefs, sleepMinutes: Number(v) })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SLEEP_MINUTES_OPTIONS.map((m) => (
                        <SelectItem key={m} value={String(m)}>{m === 0 ? '关闭' : `${m} 分钟`}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={appPrefs.resumeLast}
                    onCheckedChange={(c) => void saveAppPrefs({ ...appPrefs, resumeLast: c === true })}
                  />
                  自动续听
                </label>
              </div>
            </section>
          )}

          {active === 'schedule' && (
            <section className="space-y-4">
              <div>
                <h2 className="text-base font-medium">调度与探测</h2>
                <p className="text-sm text-muted-foreground">失败冷却策略与节点探测行为。</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">失败阈值</Label>
                  <Select
                    value={String(appPrefs.failThreshold)}
                    onValueChange={(v) => void saveAppPrefs({ ...appPrefs, failThreshold: Number(v) })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FAIL_THRESHOLD_OPTIONS.map((n) => (
                        <SelectItem key={n} value={String(n)}>{n} 次</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">冷却时长</Label>
                  <Select
                    value={String(appPrefs.cooldownMinutes)}
                    onValueChange={(v) => void saveAppPrefs({ ...appPrefs, cooldownMinutes: Number(v) })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COOLDOWN_MINUTES_OPTIONS.map((n) => (
                        <SelectItem key={n} value={String(n)}>{n} 分钟</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-3">
                  <Label className="text-xs text-muted-foreground">并发数</Label>
                  <Input type="number" min={1} max={8} className="w-20"
                    value={appPrefs.probeConcurrency}
                    onChange={(e) => void saveAppPrefs({
                      ...appPrefs,
                      probeConcurrency: Math.max(1, Math.min(8, Number(e.target.value) || 1)),
                    })} />
                  <span className="text-sm text-muted-foreground">1-8</span>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={appPrefs.autoTestOnLaunch}
                    onCheckedChange={(c) => void saveAppPrefs({ ...appPrefs, autoTestOnLaunch: c === true })}
                  />
                  启动时自动测试节点
                </label>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={probing}
                onClick={() => void useNodesStore.getState().probeAll()}
              >
                立即测试全部节点
              </Button>
            </section>
          )}

          {active === 'data' && <DataSection />}

          {active === 'share' && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-medium">局域网分享</h2>
                  <p className="text-sm text-muted-foreground">同一局域网的设备可拉取节点列表（只读，需 token）。</p>
                </div>
                <Button variant={running ? 'destructive' : 'default'} size="sm" onClick={() => void toggleShare()}>
                  {running ? '停止分享' : '开启分享'}
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Label className="text-xs text-muted-foreground">端口</Label>
                <Input type="number" min={1} max={65535} className="w-24"
                  value={share.port}
                  onChange={(e) => void saveShare({ ...share, port: Number(e.target.value) || 8787 })} />
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={share.localhostOnly}
                    onCheckedChange={(c) => void saveShare({ ...share, localhostOnly: c === true })} />
                  仅本机 (127.0.0.1)
                </label>
                <Button variant="outline" size="sm" onClick={() => void saveShare({ ...share, token: crypto.randomUUID() })}>
                  重置 Token
                </Button>
              </div>
              <div className="flex gap-2">
                <Input className="grow font-mono text-xs" readOnly value={shareUrl()} onFocus={(e) => e.target.select()} />
                <Button variant="outline" onClick={() => {
                  void navigator.clipboard.writeText(shareUrl());
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}>
                  {copied ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}
                  {copied ? '已复制' : '复制'}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {running ? `当前监听 0.0.0.0:${share.port}` : '未开启'}
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

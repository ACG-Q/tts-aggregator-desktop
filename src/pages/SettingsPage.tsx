import { useEffect, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { voiceDisplayName } from '@/lib/voices';
import { useSettingsStore } from '@/store/settingsStore';
import { useVoicesStore } from '@/store/voicesStore';
import { notifyShare } from '@/store/shareSync';
import type { ThemeMode } from '@/types/models';

const THEME_OPTIONS: [ThemeMode, string][] = [
  ['system', '跟随系统'], ['light', '浅色'], ['dark', '深色'],
];

export function SettingsPage() {
  const { synth, saveSynth, appPrefs, saveAppPrefs, share, saveShare } = useSettingsStore();
  const { voices } = useVoicesStore();
  const [copied, setCopied] = useState(false);
  const [ip, setIp] = useState('');
  const [running, setRunning] = useState(false);

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
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">设置</h1>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-sm font-medium">
            <span>默认语音参数</span>
            <span className="font-normal text-muted-foreground">作用于朗读与试听</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">外观与播放</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">探测</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Label className="text-xs text-muted-foreground">并发数</Label>
          <Input type="number" min={1} max={8} className="w-20"
            value={appPrefs.probeConcurrency}
            onChange={(e) => void saveAppPrefs({
              ...appPrefs,
              probeConcurrency: Math.max(1, Math.min(8, Number(e.target.value) || 1)),
            })} />
          <span className="text-sm text-muted-foreground">全部探测时同时发起的请求数（1-8）</span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-sm font-medium">
            <span>局域网分享</span>
            <Button variant={running ? 'destructive' : 'default'} size="sm" onClick={() => void toggleShare()}>
              {running ? '停止分享' : '开启分享'}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
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
            同一局域网的设备访问该地址即可拉取节点列表（只读，需 token）。
            {running ? `当前监听 0.0.0.0:${share.port}` : '未开启'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

import { useState, type ReactNode } from 'react';
import { Check, Pause, Play, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { PALETTES } from '@/lib/palette';
import { PageHeader } from '@/components/PageHeader';
import { DataSection } from '@/components/settings/DataSection';
import { playAudition, stopAudition } from '@/lib/audition';
import { styleDisplayName, voiceDisplayName } from '@/lib/voices';
import { synthesizeText } from '@/store/poolDeps';
import { useNodesStore } from '@/store/nodesStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useVoicesStore } from '@/store/voicesStore';
import {
  COOLDOWN_MINUTES_OPTIONS, FAIL_THRESHOLD_OPTIONS, SLEEP_MINUTES_OPTIONS,
  type ThemeMode,
} from '@/types/models';

const THEME_OPTIONS: [ThemeMode, string][] = [
  ['dark', '深色'], ['light', '浅色'], ['system', '跟随系统'],
];

type SectionKey = 'voice' | 'appearance' | 'schedule' | 'data';

const SECTIONS: [SectionKey, string, string][] = [
  ['voice', '语音参数', '默认音色、语速与音调'],
  ['appearance', '外观与播放', '主题与默认播放速度'],
  ['schedule', '调度与探测', '失败冷却与探测行为'],
  ['data', '数据', '导出与导入配置'],
];

function Switch({ checked, onCheckedChange, label }: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative h-[22px] w-[38px] shrink-0 rounded-full border transition-colors',
        checked ? 'border-primary/60 bg-primary/80' : 'border-line-strong bg-surface-3',
      )}
    >
      <span
        className={cn(
          'absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow-sm transition-[left]',
          checked ? 'left-[17px]' : 'left-[3px]',
        )}
      />
    </button>
  );
}

function SetCard({ title, children, danger }: { title: string; children: ReactNode; danger?: boolean }) {
  return (
    <div className="mb-3.5 rounded-[13px] border border-line bg-card px-[18px] py-1">
      <div className={cn('pb-0.5 pt-3.5 text-[12px] font-semibold', danger && 'text-destructive')}>
        {title}
      </div>
      {children}
    </div>
  );
}

function SetRow({ title, desc, control, stacked }: {
  title: string;
  desc: string;
  control: ReactNode;
  stacked?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex gap-6 border-t border-line py-[15px] first-of-type:border-t-0',
        stacked ? 'flex-col' : 'items-center justify-between',
      )}
    >
      <div className="min-w-0">
        <b className="block text-[12.5px] font-semibold">{title}</b>
        <span className="mt-[3px] block text-[10.5px] text-muted-foreground">{desc}</span>
      </div>
      <div className={cn('flex shrink-0 items-center gap-2.5', stacked && 'w-full')}>{control}</div>
    </div>
  );
}

function ThemePreview({ mode }: { mode: ThemeMode }) {
  const bg = mode === 'dark' ? '#1a1e18' : mode === 'light' ? '#f3f1e9' : 'linear-gradient(90deg,#1a1e18 50%,#f3f1e9 50%)';
  const side = mode === 'dark' ? '#232922' : mode === 'light' ? '#e7e3d8' : 'linear-gradient(180deg,#232922 50%,#e7e3d8 50%)';
  const line = mode === 'dark' ? 'rgba(236,235,226,.22)' : 'rgba(36,39,31,.18)';
  return (
    <div className="mb-[7px] flex h-[46px] overflow-hidden rounded-md" style={{ background: bg }}>
      <div className="w-[26%]" style={{ background: side }} />
      <div className="flex flex-1 flex-col gap-1 p-1.5">
        <div className="h-[3px] w-3/4 rounded-full" style={{ background: line }} />
        <div className="h-[3px] w-1/2 rounded-full" style={{ background: line }} />
        <div className="h-[3px] w-2/3 rounded-full" style={{ background: line }} />
      </div>
    </div>
  );
}

export function SettingsPage() {
  const { synth, saveSynth, appPrefs, saveAppPrefs } = useSettingsStore();
  const { voices } = useVoicesStore();
  const probing = useNodesStore((s) => s.probing);
  const [active, setActive] = useState<SectionKey>('voice');
  const [auditioning, setAuditioning] = useState(false);
  const voiceStyles = voices.find((v) => v.id === synth.voice)?.styles ?? [];

  async function audition(): Promise<void> {
    if (auditioning) {
      stopAudition();
      setAuditioning(false);
      return;
    }
    setAuditioning(true);
    try {
      const { bytes } = await synthesizeText('你好，这是一段试听。', {
        voice: synth.voice, rate: synth.rate, pitch: synth.pitch, style: synth.style,
      });
      await playAudition(bytes);
    } catch (e) {
      toast.error(`试听失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAuditioning(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Preferences · 设置"
        title="偏好设置"
        description="语音、外观、调度与数据管理。所有修改即时保存。"
        actions={
          <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-success/25 bg-success/12 px-2.5 text-[10.5px] text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            已保存
          </span>
        }
      />

      <div className="grid items-start gap-4 md:grid-cols-[208px_minmax(0,1fr)] md:gap-[30px]">
        <nav className="flex gap-1 overflow-x-auto md:sticky md:top-5 md:flex-col md:overflow-visible" aria-label="设置分区">
          {SECTIONS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActive(key)}
              className={cn(
                'h-[37px] shrink-0 whitespace-nowrap rounded-[9px] border px-3 text-left text-[12.5px] transition-colors',
                active === key
                  ? 'border-line bg-card font-semibold text-foreground shadow-sm'
                  : 'border-transparent text-muted-foreground hover:bg-surface-2 hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="max-w-[760px]">
          {active === 'voice' && (
            <section>
              <div className="mb-4">
                <h2 className="text-[17px] font-semibold tracking-[-0.01em]">语音参数</h2>
                <p className="mt-1 text-[11.5px] text-muted-foreground">作用于朗读与音色试听。</p>
              </div>
              <SetCard title="默认音色">
                <SetRow
                  title="朗读音色"
                  desc="未指定时使用当前节点的默认音色。"
                  control={
                    <Select
                      value={synth.voice || 'node-default'}
                      onOpenChange={(open) => { if (open) void useVoicesStore.getState().load(); }}
                      onValueChange={(v) => void saveSynth({ ...synth, voice: v === 'node-default' ? '' : v, style: '' })}
                    >
                      <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="node-default">节点默认音色</SelectItem>
                        {voices.map((v) => (
                          <SelectItem key={v.id} value={v.id}>{voiceDisplayName(v)}（{v.id}）</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  }
                />
                <SetRow
                  title="风格"
                  desc={voiceStyles.length
                    ? `当前 ${synth.style ? styleDisplayName(synth.style) : '默认风格'}，部分节点可能忽略该参数。`
                    : '当前音色没有可选风格。'}
                  control={
                    <Select
                      value={synth.style || 'default-style'}
                      onValueChange={(v) => void saveSynth({ ...synth, style: v === 'default-style' ? '' : v })}
                      disabled={voiceStyles.length === 0}
                    >
                      <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default-style">默认风格</SelectItem>
                        {voiceStyles.map((s) => (
                          <SelectItem key={s} value={s}>{styleDisplayName(s)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  }
                />
                <SetRow
                  title="语速"
                  desc={`当前 ${synth.rate > 0 ? `+${synth.rate}` : synth.rate}，范围 -100 至 +100。`}
                  control={
                    <div className="flex w-[170px] items-center gap-2.5">
                      <Slider value={[synth.rate]} min={-100} max={100} step={1}
                        onValueChange={([v]) => void saveSynth({ ...synth, rate: v })} />
                      <span className="w-[34px] text-right text-[11px] num text-foreground">{synth.rate > 0 ? `+${synth.rate}` : synth.rate}</span>
                    </div>
                  }
                />
                <SetRow
                  title="音调"
                  desc={`当前 ${synth.pitch > 0 ? `+${synth.pitch}` : synth.pitch}，范围 -100 至 +100。`}
                  control={
                    <div className="flex w-[170px] items-center gap-2.5">
                      <Slider value={[synth.pitch]} min={-100} max={100} step={1}
                        onValueChange={([v]) => void saveSynth({ ...synth, pitch: v })} />
                      <span className="w-[34px] text-right text-[11px] num text-foreground">{synth.pitch > 0 ? `+${synth.pitch}` : synth.pitch}</span>
                    </div>
                  }
                />
                <SetRow
                  title="试听"
                  desc="用上面的参数合成一句示例。"
                  control={
                    <Button variant="outline" onClick={() => void audition()}>
                      {auditioning
                        ? <><Pause className="mr-1.5 h-4 w-4" />停止</>
                        : <><Play className="mr-1.5 h-4 w-4" />试听</>}
                    </Button>
                  }
                />
              </SetCard>
            </section>
          )}

          {active === 'appearance' && (
            <section>
              <div className="mb-4">
                <h2 className="text-[17px] font-semibold tracking-[-0.01em]">外观与播放</h2>
                <p className="mt-1 text-[11.5px] text-muted-foreground">主题与默认播放行为。</p>
              </div>
              <SetCard title="主题">
                <SetRow
                  stacked
                  title="界面主题"
                  desc="深色优先，也可跟随系统自动切换。"
                  control={
                    <div className="grid w-full gap-2.5 sm:grid-cols-3">
                      {THEME_OPTIONS.map(([mode, label]) => (
                        <button
                          key={mode}
                          type="button"
                          aria-pressed={appPrefs.theme === mode}
                          onClick={() => void saveAppPrefs({ ...appPrefs, theme: mode })}
                          className={cn(
                            'rounded-[10px] border bg-surface-2 p-2 text-left text-[10.5px] transition-colors',
                            appPrefs.theme === mode
                              ? 'border-primary text-foreground shadow-[0_0_0_2px_var(--highlight)]'
                              : 'border-line text-muted-foreground hover:border-line-strong hover:text-foreground',
                          )}
                        >
                          <ThemePreview mode={mode} />
                          <span className="flex items-center justify-between gap-1">
                            {label}
                            {appPrefs.theme === mode && <Check className="h-3 w-3 text-primary" />}
                          </span>
                        </button>
                      ))}
                    </div>
                  }
                />
                <SetRow
                  stacked
                  title="界面配色"
                  desc="主色系与主题相互独立，配色不会改变明暗。"
                  control={
                    <div className="flex flex-wrap gap-2">
                      {PALETTES.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          aria-pressed={appPrefs.palette === p.id}
                          onClick={() => void saveAppPrefs({ ...appPrefs, palette: p.id })}
                          className={cn(
                            'flex items-center gap-2 rounded-[10px] border bg-surface-2 px-3 py-2 text-[11px] transition-colors',
                            appPrefs.palette === p.id
                              ? 'border-primary text-foreground shadow-[0_0_0_2px_var(--highlight)]'
                              : 'border-line text-muted-foreground hover:border-line-strong hover:text-foreground',
                          )}
                        >
                          <span className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ background: p.swatch }} />
                          {p.label}
                          {appPrefs.palette === p.id && <Check className="h-3 w-3 text-primary" />}
                        </button>
                      ))}
                    </div>
                  }
                />
                <SetRow
                  title="默认倍速"
                  desc={`当前 ${appPrefs.playbackRate}x，开始播放时使用。`}
                  control={
                    <div className="flex w-[170px] items-center gap-2.5">
                      <Slider value={[appPrefs.playbackRate]} min={0.5} max={2} step={0.25}
                        onValueChange={([v]) => void saveAppPrefs({ ...appPrefs, playbackRate: v })} />
                      <span className="w-[34px] text-right text-[11px] num text-foreground">{appPrefs.playbackRate}x</span>
                    </div>
                  }
                />
                <SetRow
                  title="默认睡眠定时"
                  desc="播放时自动倒计时，结束后暂停。"
                  control={
                    <Select
                      value={String(appPrefs.sleepMinutes)}
                      onValueChange={(v) => void saveAppPrefs({ ...appPrefs, sleepMinutes: Number(v) })}
                    >
                      <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SLEEP_MINUTES_OPTIONS.map((m) => (
                          <SelectItem key={m} value={String(m)}>{m === 0 ? '关闭' : `${m} 分钟`}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  }
                />
                <SetRow
                  title="自动续听"
                  desc="启动后显示上次的朗读或听书入口。"
                  control={
                    <Switch
                      label="自动续听"
                      checked={appPrefs.resumeLast}
                      onCheckedChange={(v) => void saveAppPrefs({ ...appPrefs, resumeLast: v })}
                    />
                  }
                />
              </SetCard>
            </section>
          )}

          {active === 'schedule' && (
            <section>
              <div className="mb-4">
                <h2 className="text-[17px] font-semibold tracking-[-0.01em]">调度与探测</h2>
                <p className="mt-1 text-[11.5px] text-muted-foreground">失败冷却策略与节点探测行为。</p>
              </div>
              <SetCard title="失败处理">
                <SetRow
                  title="失败阈值"
                  desc="连续失败达到次数后切换到下一个节点。"
                  control={
                    <Select
                      value={String(appPrefs.failThreshold)}
                      onValueChange={(v) => void saveAppPrefs({ ...appPrefs, failThreshold: Number(v) })}
                    >
                      <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FAIL_THRESHOLD_OPTIONS.map((n) => (
                          <SelectItem key={n} value={String(n)}>{n} 次</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  }
                />
                <SetRow
                  title="冷却时长"
                  desc="失败节点在多长时间内不再参与调度。"
                  control={
                    <Select
                      value={String(appPrefs.cooldownMinutes)}
                      onValueChange={(v) => void saveAppPrefs({ ...appPrefs, cooldownMinutes: Number(v) })}
                    >
                      <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {COOLDOWN_MINUTES_OPTIONS.map((n) => (
                          <SelectItem key={n} value={String(n)}>{n} 分钟</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  }
                />
                <SetRow
                  title="探测并发"
                  desc="同时探测的节点数量，范围 1–8。"
                  control={
                    <Input type="number" min={1} max={8} className="w-[70px] text-center"
                      value={appPrefs.probeConcurrency}
                      onChange={(e) => void saveAppPrefs({
                        ...appPrefs,
                        probeConcurrency: Math.max(1, Math.min(8, Number(e.target.value) || 1)),
                      })} />
                  }
                />
                <SetRow
                  title="启动时自动测试"
                  desc="应用启动后立即探测全部节点。"
                  control={
                    <Switch
                      label="启动时自动测试"
                      checked={appPrefs.autoTestOnLaunch}
                      onCheckedChange={(v) => void saveAppPrefs({ ...appPrefs, autoTestOnLaunch: v })}
                    />
                  }
                />
                <SetRow
                  title="立即测试"
                  desc="手动触发一次全量探测。"
                  control={
                    <Button variant="outline" disabled={probing} onClick={() => void useNodesStore.getState().probeAll()}>
                      <RefreshCw className={cn('mr-1.5 h-4 w-4', probing && 'animate-spin')} />
                      {probing ? '探测中…' : '测试全部'}
                    </Button>
                  }
                />
              </SetCard>
            </section>
          )}

          {active === 'data' && <DataSection />}

        </div>
      </div>
    </div>
  );
}

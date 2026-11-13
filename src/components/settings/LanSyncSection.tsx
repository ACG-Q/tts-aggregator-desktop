import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Check, Copy, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SetCard, SetRow, Switch } from '@/components/settings/SetBits';
import { PairingQr } from '@/components/PairingQr';
import { buildPairingString, parsePairingString, toSyncedNodes } from '@/lib/lanSync';
import { pairInfo, useLanSyncStore } from '@/store/lanSyncStore';
import { useNodesStore } from '@/store/nodesStore';

export function LanSyncSection() {
  const phase = useLanSyncStore((s) => s.phase);
  const status = useLanSyncStore((s) => s.status);
  const message = useLanSyncStore((s) => s.message);
  const result = useLanSyncStore((s) => s.result);
  const deviceName = useLanSyncStore((s) => s.deviceName);
  const start = useLanSyncStore((s) => s.start);
  const refresh = useLanSyncStore((s) => s.refresh);
  const stop = useLanSyncStore((s) => s.stop);
  const syncTo = useLanSyncStore((s) => s.syncTo);
  const autoAllow = useLanSyncStore((s) => s.autoAllow);
  const setAutoAllow = useLanSyncStore((s) => s.setAutoAllow);
  const nodes = useNodesStore((s) => s.nodes);
  const [pairing, setPairing] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const running = Boolean(status?.running);

  useEffect(() => {
    if (!running) return;
    void invoke('lan_sync_set_nodes', { nodes: toSyncedNodes(nodes) }).catch(() => undefined);
  }, [nodes, running]);

  const peer = pairInfo(status, deviceName);
  const link = peer ? buildPairingString(peer) : '';

  async function connect(): Promise<void> {
    const parsed = parsePairingString(pairing);
    if (!parsed) {
      useLanSyncStore.setState({ message: '配对串无效' });
      return;
    }
    await syncTo(parsed);
  }

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-[17px] font-semibold tracking-[-0.01em]">局域网同步</h2>
        <p className="mt-1 text-[11.5px] text-muted-foreground">
          同一 Wi-Fi 下的手机可以发现这台电脑，一键双向合并节点。只同步节点，不传密钥。
        </p>
      </div>

      <SetCard title="同步服务">
        <SetRow
          title="服务状态"
          desc={running ? `监听 ${status?.localIp}:${status?.port}` : '当前未开启。'}
          control={
            <Switch
              label="局域网同步"
              checked={running}
              onCheckedChange={(v) => { if (v) void start(deviceName); else void stop(); }}
            />
          }
        />

        <SetRow
          title="自动允许同步请求"
          desc="开启后不再弹窗确认，仅建议在可信任的网络中使用。"
          control={
            <Switch
              label="自动允许同步请求"
              checked={autoAllow}
              onCheckedChange={(v) => void setAutoAllow(v)}
            />
          }
        />

        {running && peer && (
          <>
            <SetRow
              stacked
              title="手机扫码"
              desc="用系统相机扫码即可发起同步；也可以把下面的配对串发到手机粘贴。"
              control={
                <div className="flex w-full flex-col items-start gap-3">
                  <PairingQr value={link} />
                  <div className="flex w-full gap-2">
                    <Input
                      className="grow font-mono text-[10.5px]"
                      readOnly
                      value={link}
                      onFocus={(e) => e.target.select()}
                    />
                    <Button
                      variant="outline"
                      onClick={() => {
                        void navigator.clipboard.writeText(link);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      }}
                    >
                      {copied ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}
                      {copied ? '已复制' : '复制'}
                    </Button>
                  </div>
                </div>
              }
            />
            <SetRow
              stacked
              title="连接手机"
              desc="粘贴手机端显示的配对串。"
              control={
                <div className="flex w-full gap-2">
                  <Input
                    className="grow font-mono text-[11px]"
                    placeholder="pulsetts://sync?host=…"
                    value={pairing}
                    onChange={(e) => setPairing(e.target.value)}
                  />
                  <Button onClick={() => void connect()} disabled={!pairing.trim() || phase === 'syncing'}>
                    {phase === 'syncing' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                    连接
                  </Button>
                </div>
              }
            />
            <SetRow
              title="本机节点"
              desc="开启同步后，节点的健康与音色信息会随广播刷新。"
              control={<span className="text-[12px] text-muted-foreground">{nodes.length} 个</span>}
            />
          </>
        )}
      </SetCard>

      {result && (
        <div className="mb-3.5 rounded-[10px] border border-line bg-card px-4 py-3 text-[11.5px]">
          同步完成：新增 {result.added}，更新 {result.updated}，跳过 {result.skipped}。
        </div>
      )}
      {message && (
        <div
          className={
            phase === 'error'
              ? 'mb-3.5 rounded-[10px] border border-destructive/30 bg-destructive/8 px-4 py-3 text-[11.5px] text-destructive'
              : 'mb-3.5 rounded-[10px] border border-line bg-card px-4 py-3 text-[11.5px] text-muted-foreground'
          }
        >
          {message}
        </div>
      )}
    </section>
  );
}

import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { voiceDisplayName } from '../lib/voices';
import { useSettingsStore } from '../store/settingsStore';
import { useVoicesStore } from '../store/voicesStore';
import { notifyShare } from '../store/shareSync';

export function SettingsPage() {
  const { synth, saveSynth, appPrefs, saveAppPrefs, share, saveShare } = useSettingsStore();
  const { voices } = useVoicesStore();
  const [copied, setCopied] = useState(false);
  const [ip, setIp] = useState('');
  const [running, setRunning] = useState(false);

  const curVoice = voices.find((v) => v.id === synth.voice);

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
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  function shareUrl(): string {
    const host = share.localhostOnly ? '127.0.0.1' : ip || '127.0.0.1';
    return `http://${host}:${share.port}/nodes.json?token=${share.token}`;
  }

  return (
    <div>
      <div className="page-title">设置</div>

      <div className="card">
        <div className="row between" style={{ marginBottom: 10 }}>
          <strong>默认语音参数</strong>
          <span className="muted">作用于朗读与试听</span>
        </div>
        <div className="row">
          <div className="field grow" style={{ marginBottom: 0 }}>
            <label>默认音色</label>
            <input className="input mono" value={curVoice ? `${voiceDisplayName(curVoice)}（${synth.voice}）` : synth.voice || '节点默认'}
              onChange={(e) => {
                const raw = e.target.value;
                const m = raw.match(/（(.+)）$/);
                void saveSynth({ ...synth, voice: m ? m[1] : raw });
              }} />
          </div>
          <div className="field" style={{ marginBottom: 0, minWidth: 180 }}>
            <label>语速 {synth.rate}</label>
            <input type="range" min={-100} max={100} value={synth.rate}
              onChange={(e) => void saveSynth({ ...synth, rate: Number(e.target.value) })} />
          </div>
          <div className="field" style={{ marginBottom: 0, minWidth: 180 }}>
            <label>音调 {synth.pitch}</label>
            <input type="range" min={-100} max={100} value={synth.pitch}
              onChange={(e) => void saveSynth({ ...synth, pitch: Number(e.target.value) })} />
          </div>
        </div>
      </div>

      <div className="card">
        <strong>探测</strong>
        <div className="row" style={{ marginTop: 10 }}>
          <label className="muted">并发数</label>
          <input className="input" style={{ width: 70 }} type="number" min={1} max={8}
            value={appPrefs.probeConcurrency}
            onChange={(e) => void saveAppPrefs({ ...appPrefs, probeConcurrency: Math.max(1, Math.min(8, Number(e.target.value) || 1)) })} />
          <span className="muted">全部探测时同时发起的请求数（1-8）</span>
        </div>
      </div>

      <div className="card">
        <div className="row between" style={{ marginBottom: 10 }}>
          <strong>局域网分享</strong>
          <button className={`btn ${running ? 'danger' : 'primary'}`} onClick={() => void toggleShare()}>
            {running ? '停止分享' : '开启分享'}
          </button>
        </div>
        <div className="row" style={{ marginBottom: 8 }}>
          <label className="muted">端口</label>
          <input className="input" style={{ width: 80 }} type="number" min={1} max={65535}
            value={share.port}
            onChange={(e) => void saveShare({ ...share, port: Number(e.target.value) || 8787 })} />
          <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={share.localhostOnly}
              onChange={(e) => void saveShare({ ...share, localhostOnly: e.target.checked })} /> 仅本机 (127.0.0.1)
          </label>
          <button className="btn" onClick={() => void saveShare({ ...share, token: crypto.randomUUID() })}>重置 Token</button>
        </div>
        <div className="row">
          <input className="input mono grow" readOnly value={shareUrl()} onFocus={(e) => e.target.select()} />
          <button className="btn" onClick={() => { void navigator.clipboard.writeText(shareUrl()); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
            {copied ? '已复制' : '复制'}
          </button>
        </div>
        <div className="muted" style={{ marginTop: 6 }}>
          同一局域网的设备访问该地址即可拉取节点列表（只读，需 token）。{running ? `当前监听 0.0.0.0:${share.port}` : '未开启'}
        </div>
      </div>
    </div>
  );
}

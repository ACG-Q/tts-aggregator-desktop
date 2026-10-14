import { voiceDisplayName } from '../lib/voices';
import { useSettingsStore } from '../store/settingsStore';
import { useVoicesStore } from '../store/voicesStore';

export function SettingsPage() {
  const { synth, saveSynth, appPrefs, saveAppPrefs } = useSettingsStore();
  const { voices } = useVoicesStore();

  const curVoice = voices.find((v) => v.id === synth.voice);

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

      {/* 任务 13：局域网分享卡片插入此处 */}
    </div>
  );
}

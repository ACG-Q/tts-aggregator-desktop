import { useRef, useState } from 'react';
import { readTextFile } from '../lib/encoding';
import { voiceDisplayName } from '../lib/voices';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import { useVoicesStore } from '../store/voicesStore';

export function ReadPage() {
  const [text, setText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const player = usePlayerStore();
  const { synth, saveSynth } = useSettingsStore();
  const { voices, load } = useVoicesStore();

  const playing = player.status === 'running' || player.status === 'paused';

  return (
    <div>
      <div className="page-title">朗读</div>

      <div className="card">
        <textarea
          className="input"
          placeholder="粘贴或输入要朗读的文本，或导入 TXT…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn" onClick={() => fileRef.current?.click()}>导入 TXT</button>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,text/plain"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) setText(await readTextFile(file));
              e.target.value = '';
            }}
          />
          <div className="grow" />
          <span className="muted">{text.length} 字</span>
        </div>
      </div>

      <div className="card">
        <div className="row">
          <div className="field grow" style={{ marginBottom: 0 }}>
            <label>音色</label>
            <select
              className="input"
              value={synth.voice}
              onFocus={() => void load()}
              onChange={(e) => void saveSynth({ ...synth, voice: e.target.value })}
            >
              <option value="">节点默认音色</option>
              {voices.map((v) => (
                <option key={v.id} value={v.id}>{voiceDisplayName(v)}（{v.id}）</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0, minWidth: 160 }}>
            <label>语速 {synth.rate}</label>
            <div className="slider-row">
              <input
                type="range" min={-100} max={100} value={synth.rate}
                onChange={(e) => void saveSynth({ ...synth, rate: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="field" style={{ marginBottom: 0, minWidth: 160 }}>
            <label>音调 {synth.pitch}</label>
            <div className="slider-row">
              <input
                type="range" min={-100} max={100} value={synth.pitch}
                onChange={(e) => void saveSynth({ ...synth, pitch: Number(e.target.value) })}
              />
            </div>
          </div>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          {player.status !== 'running' && player.status !== 'paused' ? (
            <button className="btn primary" onClick={() => void player.start(text)}>开始朗读</button>
          ) : player.status === 'running' ? (
            <button className="btn" onClick={player.pause}>暂停</button>
          ) : (
            <button className="btn primary" onClick={() => void player.resume()}>继续</button>
          )}
          <button className="btn" onClick={player.skipNext} disabled={player.status === 'idle'}>下一段</button>
          <button className="btn danger" onClick={player.stop} disabled={!playing}>停止</button>
          <div className="grow" />
          {player.segs.length > 0 && (
            <span className="muted">
              进度 {Math.min(player.index + 1, player.segs.length)}/{player.segs.length} 段
              {player.duration > 0 && ` · ${Math.floor(player.currentTime)}s / ${Math.floor(player.duration)}s`}
            </span>
          )}
        </div>
        {player.error && <div className="muted" style={{ color: 'var(--danger)', marginTop: 8 }}>{player.error}</div>}
      </div>

      {player.segs.length > 0 && (
        <div className="card">
          <div className="seg-list">
            {player.segs.map((seg, i) => (
              <div key={i} className={`seg ${seg.status}`}>{i + 1}. {seg.text}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

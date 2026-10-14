import { useEffect, useMemo, useState } from 'react';
import { voiceDisplayName } from '../lib/voices';
import { synthesizeText } from '../store/poolDeps';
import { useSettingsStore } from '../store/settingsStore';
import { useVoicesStore } from '../store/voicesStore';

export function VoicesPage() {
  const { voices, loading, error, load } = useVoicesStore();
  const { synth, saveSynth } = useSettingsStore();
  const [q, setQ] = useState('');
  const [gender, setGender] = useState('');
  const [locale, setLocale] = useState('');
  const [auditioning, setAuditioning] = useState<string | null>(null);

  useEffect(() => { void load(); }, []);

  const locales = useMemo(() => [...new Set(voices.map((v) => v.locale).filter(Boolean))], [voices]);
  const shown = voices.filter((v) =>
    (!gender || v.gender === gender)
    && (!locale || v.locale === locale)
    && (!q || voiceDisplayName(v).includes(q) || v.id.toLowerCase().includes(q.toLowerCase())));

  async function audition(id: string) {
    setAuditioning(id);
    try {
      const { bytes } = await synthesizeText('你好，这是一段试听。', { voice: id, rate: synth.rate, pitch: synth.pitch, style: '' });
      const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
      const a = new Audio(url);
      a.onended = () => URL.revokeObjectURL(url);
      await a.play();
    } catch (e) {
      alert(`试听失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAuditioning(null);
    }
  }

  return (
    <div>
      <div className="page-title">音色</div>
      <div className="card">
        <div className="row">
          <button className="btn primary" onClick={() => void load(true)} disabled={loading}>
            {loading ? '拉取中…' : '重新拉取'}
          </button>
          <input className="input grow" placeholder="搜索音色名 / ID" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input" value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="">全部性别</option>
            <option value="Female">女</option>
            <option value="Male">男</option>
          </select>
          <select className="input" value={locale} onChange={(e) => setLocale(e.target.value)}>
            <option value="">全部语言</option>
            {locales.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        {error && <div className="muted" style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</div>}
      </div>

      <div className="card">
        <table className="table">
          <thead><tr><th>名称</th><th>ID</th><th>性别</th><th>语言</th><th>风格</th><th style={{ width: 160 }}>操作</th></tr></thead>
          <tbody>
            {shown.map((v) => (
              <tr key={v.id}>
                <td style={{ fontWeight: 600 }}>{voiceDisplayName(v)}</td>
                <td className="mono muted">{v.id}</td>
                <td>{v.gender === 'Female' ? '女' : v.gender === 'Male' ? '男' : v.gender || '—'}</td>
                <td>{v.locale || '—'}</td>
                <td className="muted">{v.styles?.length ? v.styles.join(' / ') : '—'}</td>
                <td>
                  <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                    <button className="btn" disabled={auditioning === v.id} onClick={() => void audition(v.id)}>
                      {auditioning === v.id ? '试听中…' : '试听'}
                    </button>
                    <button className="btn" onClick={() => void saveSynth({ ...synth, voice: v.id })}>
                      {synth.voice === v.id ? '当前默认' : '设为默认'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 24 }}>
                {voices.length ? '没有匹配的音色' : '还没有音色，请先添加节点并探测'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useNodesStore } from '../store/nodesStore';
import { useSettingsStore } from '../store/settingsStore';
import { isCoolingDown, type CallMode, type TtsNode } from '../types/models';

const MODES: [CallMode, string, string][] = [
  ['AUTO', '自动', '按健康度依次尝试，失败自动切换'],
  ['GROUP', '组', '组内轮询，成功后换下一个'],
  ['MANUAL', '手选', '只用选中节点，连败 3 次后停止'],
];

function healthBadge(n: TtsNode) {
  if (n.disabled) return <span className="badge unknown">已禁用</span>;
  if (isCoolingDown(n, Date.now())) return <span className="badge warn">冷却中</span>;
  if (n.health === 'OK') return <span className="badge ok">正常</span>;
  if (n.health === 'FAIL') return <span className="badge fail">失败</span>;
  return <span className="badge unknown">未测</span>;
}

const emptyForm = { baseUrl: '', label: '', apiKey: '' };

export function NodesPage() {
  const st = useNodesStore();
  const { pool, updatePool, appPrefs, saveAppPrefs } = useSettingsStore();
  const [showForm, setShowForm] = useState<null | 'add' | 'edit'>(null);
  const [editOrig, setEditOrig] = useState<string>('');
  const [form, setForm] = useState(emptyForm);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { void st.load(); }, []);

  function openAdd() {
    setForm(emptyForm);
    setEditOrig('');
    setErr(null);
    setShowForm('add');
  }

  function openEdit(n: TtsNode) {
    setForm({ baseUrl: n.baseUrl, label: n.label, apiKey: n.apiKey ?? '' });
    setEditOrig(n.baseUrl);
    setErr(null);
    setShowForm('edit');
  }

  async function submit() {
    if (!form.baseUrl.trim()) { setErr('URL 不能为空'); return; }
    setErr(null);
    try {
      if (showForm === 'add') {
        await st.add({ baseUrl: form.baseUrl, label: form.label, apiKey: form.apiKey || null });
      } else {
        const orig = st.nodes.find((n) => n.baseUrl === editOrig);
        if (!orig) throw new Error('节点不存在');
        await st.update(
          { ...orig, baseUrl: form.baseUrl.trim(), label: form.label, apiKey: form.apiKey || null },
          editOrig,
        );
      }
      setShowForm(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div>
      <div className="page-title">节点</div>

      <div className="card">
        <div className="row between">
          <div className="row">
            <button className="btn primary" onClick={openAdd}>添加节点</button>
            <button className="btn" onClick={() => void st.probeAll()} disabled={st.probing}>
              {st.probing ? (st.probeProgress ?? '探测中…') : '全部探测'}
            </button>
            <span className="muted">共 {st.nodes.length} 个</span>
          </div>
          <div className="row">
            <label className="muted">探测并发</label>
            <input
              className="input" style={{ width: 64 }} type="number" min={1} max={8}
              value={appPrefs.probeConcurrency}
              onChange={(e) => void saveAppPrefs({ ...appPrefs, probeConcurrency: Math.max(1, Math.min(8, Number(e.target.value) || 1)) })}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ marginBottom: 8 }}>
          {MODES.map(([mode, label, desc]) => (
            <button
              key={mode}
              className={`btn ${pool.mode === mode ? 'primary' : ''}`}
              title={desc}
              onClick={() => void updatePool((c) => ({ ...c, mode }))}
            >
              {label}
            </button>
          ))}
          <span className="muted">{MODES.find(([m]) => m === pool.mode)?.[2]}</span>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>状态</th><th>节点</th><th>API</th><th>音色</th><th>组</th><th>手选</th><th>来源</th><th style={{ width: 220 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {st.nodes.map((n) => (
              <tr key={n.id}>
                <td>{healthBadge(n)}</td>
                <td>
                  <div style={{ fontWeight: 600 }}>{n.label || '—'}</div>
                  <div className="muted mono">{n.baseUrl}</div>
                </td>
                <td><span className="badge accent">{n.apiVersion}</span>{n.keyless && <> <span className="badge ok">免Key</span></>}</td>
                <td>{n.voiceCount || '—'}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={pool.groupIds.includes(n.id)}
                    onChange={() => void updatePool((c) => ({
                      ...c,
                      groupIds: c.groupIds.includes(n.id)
                        ? c.groupIds.filter((x) => x !== n.id)
                        : [...c.groupIds, n.id],
                    }))}
                  />
                </td>
                <td>
                  <input
                    type="radio" name="manual" checked={pool.manualId === n.id}
                    onChange={() => void updatePool((c) => ({ ...c, manualId: n.id, manualFailCount: 0 }))}
                  />
                </td>
                <td className="muted">{n.source}</td>
                <td>
                  <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                    <button className="btn" onClick={() => void st.reprobe(n)}>测试</button>
                    <button className="btn" onClick={() => openEdit(n)}>编辑</button>
                    <button className="btn" onClick={() => void st.setDisabled([n.id], !n.disabled)}>
                      {n.disabled ? '启用' : '禁用'}
                    </button>
                    <button className="btn danger" onClick={() => { if (confirm(`删除 ${n.baseUrl}？`)) void st.remove([n.id]); }}>删</button>
                  </div>
                </td>
              </tr>
            ))}
            {st.nodes.length === 0 && (
              <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 24 }}>还没有节点，点击“添加节点”</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="dialog-mask" onClick={() => setShowForm(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>{showForm === 'add' ? '添加节点' : '编辑节点'}</h3>
            <div className="field">
              <label>节点 URL</label>
              <input className="input" placeholder="https://tts.example.com" value={form.baseUrl}
                onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} />
            </div>
            <div className="field">
              <label>备注名</label>
              <input className="input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            </div>
            <div className="field">
              <label>API Key（免 Key 节点留空）</label>
              <input className="input" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} />
            </div>
            {err && <div className="muted" style={{ color: 'var(--danger)', marginBottom: 8 }}>{err}</div>}
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setShowForm(null)}>取消</button>
              <button className="btn primary" onClick={() => void submit()}>保存并探测</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

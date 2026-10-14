import { useEffect } from 'react';
import { useLogsStore } from '../store/logsStore';
import type { LogFilter } from '../types/models';

const FILTERS: [LogFilter, string][] = [
  ['ALL', '全部'], ['OK', '成功'], ['FAIL', '失败'], ['SWITCH', '切换'],
];

function fmtTime(t: number): string {
  return new Date(t).toLocaleTimeString('zh-CN', { hour12: false });
}

export function LogsPage() {
  const { logs, filter, loading, load, clear } = useLogsStore();

  useEffect(() => { void load(); }, []);

  return (
    <div>
      <div className="page-title">调用日志</div>
      <div className="card">
        <div className="row between">
          <div className="tabs" style={{ marginBottom: 0 }}>
            {FILTERS.map(([f, label]) => (
              <button key={f} className={filter === f ? 'active' : ''} onClick={() => void load(f)}>{label}</button>
            ))}
          </div>
          <div className="row">
            <button className="btn" onClick={() => void load()} disabled={loading}>{loading ? '刷新中…' : '刷新'}</button>
            <button className="btn danger" onClick={() => { if (confirm('清空全部日志？')) void clear(); }}>清空</button>
          </div>
        </div>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr><th>时间</th><th>结果</th><th>节点</th><th>模式</th><th>尝试</th><th>耗时</th><th>长度</th><th>内容预览</th></tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="muted">{fmtTime(l.time)}</td>
                <td>
                  {l.success
                    ? <span className="badge ok">成功</span>
                    : <span className="badge fail">失败</span>}
                  {l.triggeredCooldown && <> <span className="badge warn">触发冷却</span></>}
                </td>
                <td className="mono muted">{l.nodeUrl}</td>
                <td>{l.mode}</td>
                <td>{l.attempt}</td>
                <td>{l.latencyMs}ms</td>
                <td>{l.textLen}</td>
                <td title={l.error ?? undefined} className="muted">
                  {l.error ? `⚠ ${l.error} · ` : ''}{l.textPreview}{l.fromNode ? `（从 ${l.fromNode} 切换）` : ''}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 24 }}>暂无日志</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

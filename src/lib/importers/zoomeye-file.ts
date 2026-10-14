import type { HostRecord } from './hosts';

interface ZoomEyeMatch {
  ip_str?: unknown;
  port?: unknown;
  protocol?: unknown;
  title?: unknown;
  site?: unknown;
}

function titleOf(m: ZoomEyeMatch): string {
  if (typeof m.title === 'string' && m.title) return m.title;
  if (typeof m.site === 'string') return m.site;
  return '';
}

export function parseZoomeyeJson(text: string): HostRecord[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`ZoomEye 文件不是合法 JSON：${e instanceof Error ? e.message : String(e)}`);
  }
  const matches = (data as { matches?: unknown }).matches;
  if (!Array.isArray(matches)) throw new Error('ZoomEye JSON 中未找到 matches 数组');
  const out: HostRecord[] = [];
  for (const raw of matches) {
    if (!raw || typeof raw !== 'object') continue;
    const m = raw as ZoomEyeMatch;
    const ip = typeof m.ip_str === 'string' ? m.ip_str : '';
    const port = Number(m.port);
    if (!ip || !Number.isFinite(port) || port <= 0) continue;
    out.push({
      ip,
      port,
      protocol: typeof m.protocol === 'string' ? m.protocol : '',
      title: titleOf(m),
    });
  }
  return out;
}

import type { HostRecord } from './hosts';

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch (e) {
    throw new Error(`FOFA 文件不是合法 JSON：${e instanceof Error ? e.message : String(e)}`);
  }
}

function toPort(v: string | number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function parseFofaCsv(csv: string): HostRecord[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const idx = (name: string): number => header.indexOf(name);
  const [iIp, iPort, iProto, iTitle] = [idx('ip'), idx('port'), idx('protocol'), idx('title')];
  if (iIp < 0 || iPort < 0) throw new Error('FOFA CSV 缺少 ip/port 列');
  const out: HostRecord[] = [];
  for (const line of lines.slice(1)) {
    try {
      const cells = line.split(',');
      const port = toPort((cells[iPort] ?? '').trim());
      const ip = (cells[iIp] ?? '').trim();
      if (!ip || !port) continue;
      out.push({
        ip,
        port,
        protocol: iProto >= 0 ? (cells[iProto] ?? '').trim() : '',
        title: iTitle >= 0 ? (cells[iTitle] ?? '').trim() : '',
      });
    } catch {
      console.warn(`FOFA CSV 单行损坏已跳过：${line}`);
    }
  }
  return out;
}

export function parseFofaJson(text: string): HostRecord[] {
  const data = safeParse(text);
  if (Array.isArray(data)) return fromResults(data);
  if (data && typeof data === 'object') {
    const obj = data as { results?: unknown };
    if (Array.isArray(obj.results)) return fromResults(obj.results);
  }
  throw new Error('FOFA JSON 中未找到 results 数组');
}

function fromResults(rows: unknown[]): HostRecord[] {
  const out: HostRecord[] = [];
  for (const row of rows) {
    if (Array.isArray(row)) {
      const [ip, port, protocol, title] = row;
      if (typeof ip !== 'string') continue;
      const p = toPort(port as string | number);
      if (!p) continue;
      out.push({ ip, port: p, protocol: String(protocol ?? ''), title: String(title ?? '') });
    } else if (row && typeof row === 'object') {
      const o = row as Record<string, unknown>;
      const ip = typeof o.ip === 'string' ? o.ip : '';
      const p = toPort((o.port ?? 0) as string | number);
      if (!ip || !p) continue;
      out.push({
        ip,
        port: p,
        protocol: String(o.protocol ?? ''),
        title: String(o.title ?? ''),
      });
    }
  }
  return out;
}

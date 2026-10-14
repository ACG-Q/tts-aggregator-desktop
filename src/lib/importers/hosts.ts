import type { NodeSource, TtsNode } from '../../types/models';
import { normalizeBaseUrl } from '../../types/models';

export interface HostRecord {
  ip: string;
  port: number;
  protocol: string;
  title: string;
}

export function buildBaseUrl(r: HostRecord): string {
  const proto = r.protocol === 'http' ? 'http' : 'https';
  const defaultPort = proto === 'https' ? 443 : 80;
  const host = r.ip.includes(':') ? `[${r.ip}]` : r.ip;
  return r.port === defaultPort ? `${proto}://${host}` : `${proto}://${host}:${r.port}`;
}

export function dedupeByBaseUrl(records: HostRecord[]): HostRecord[] {
  const seen = new Set<string>();
  const out: HostRecord[] = [];
  for (const r of records) {
    const url = buildBaseUrl(r);
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(r);
  }
  return out;
}

const KEYWORDS = ['tts', 'speech', 'voice', 'azure', 'piper', 'coqui', 'edge'];

export function rankRelevance(r: HostRecord): number {
  const s = `${r.title} ${r.protocol}`.toLowerCase();
  return KEYWORDS.reduce((score, k) => (s.includes(k) ? score + 1 : score), 0);
}

export function recordsToNodes(records: HostRecord[], source: NodeSource): Omit<TtsNode, 'id'>[] {
  return [...records]
    .sort((a, b) => rankRelevance(b) - rankRelevance(a))
    .map((r) => ({
      baseUrl: normalizeBaseUrl(buildBaseUrl(r)),
      label: r.title || r.ip,
      keyless: false,
      apiKey: null,
      health: 'UNKNOWN' as const,
      lastChecked: 0,
      defaultVoice: '',
      voiceCount: 0,
      failCount: 0,
      cooldownUntil: 0,
      disabled: false,
      apiVersion: 'UNKNOWN' as const,
      source,
    }));
}

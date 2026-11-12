import { newId, type ApiVersion, type Health, type TtsNode } from '../types/models';

export interface SyncedNode {
  url: string;
  label?: string;
  health?: string;
  apiVersion?: string;
  defaultVoice?: string;
  voiceCount?: number;
  group?: string;
  keyless?: boolean;
}

export interface Peer {
  host: string;
  port: number;
  sid: string;
  name: string;
  platform: 'desktop' | 'android';
}

export interface SyncStats {
  added: number;
  updated: number;
  skipped: number;
  total: number;
}

export interface SyncNodeResult {
  nodes: TtsNode[];
  result: SyncStats;
}

const HEALTHS: Health[] = ['OK', 'FAIL', 'UNKNOWN'];
const API_VERSIONS: ApiVersion[] = ['V1', 'LEGACY', 'UNKNOWN'];

export function normalizeUrl(raw: string): string | null {
  const s = raw.trim();
  if (!/^https?:\/\//i.test(s)) return null;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname) return null;
  const defaultPort = url.protocol === 'http:' ? '80' : '443';
  const port = url.port && url.port !== defaultPort ? `:${url.port}` : '';
  const path = url.pathname.replace(/\/+$/, '');
  return `${url.protocol}//${url.hostname}${port}${path}`;
}

export function toSyncedNodes(nodes: TtsNode[]): SyncedNode[] {
  return nodes.map((n) => ({
    url: n.baseUrl,
    label: n.label,
    health: n.health,
    apiVersion: n.apiVersion,
    defaultVoice: n.defaultVoice,
    voiceCount: n.voiceCount,
  }));
}

function asHealth(v: string | undefined): Health {
  return HEALTHS.includes(v as Health) ? (v as Health) : 'UNKNOWN';
}

function asApiVersion(v: string | undefined): ApiVersion {
  return API_VERSIONS.includes(v as ApiVersion) ? (v as ApiVersion) : 'UNKNOWN';
}

export function mergeNodes(local: TtsNode[], remote: SyncedNode[]): SyncNodeResult {
  const byUrl = new Map<string, TtsNode>();
  for (const n of local) byUrl.set(normalizeUrl(n.baseUrl) ?? n.baseUrl, n);

  const remoteByUrl = new Map<string, SyncedNode>();
  let skipped = 0;
  for (const r of remote) {
    const key = normalizeUrl(r.url);
    if (!key) {
      skipped++;
      continue;
    }
    remoteByUrl.set(key, r);
  }

  const next = [...local];
  let added = 0;
  let updated = 0;

  for (const [key, r] of remoteByUrl) {
    const existing = byUrl.get(key);
    if (existing) {
      const index = next.findIndex((n) => n.id === existing.id);
      next[index] = {
        ...existing,
        label: r.label ?? existing.label,
        health: asHealth(r.health),
        apiVersion: asApiVersion(r.apiVersion),
        defaultVoice: r.defaultVoice ?? existing.defaultVoice,
        voiceCount: r.voiceCount ?? existing.voiceCount,
      };
      updated++;
      continue;
    }
    const fresh: TtsNode = {
      id: newId(),
      baseUrl: key,
      label: r.label ?? '',
      keyless: r.keyless ?? false,
      apiKey: null,
      health: asHealth(r.health),
      lastChecked: 0,
      defaultVoice: r.defaultVoice ?? '',
      voiceCount: r.voiceCount ?? 0,
      failCount: 0,
      cooldownUntil: 0,
      disabled: false,
      apiVersion: asApiVersion(r.apiVersion),
      source: 'manual',
    };
    next.push(fresh);
    byUrl.set(key, fresh);
    added++;
  }

  return {
    nodes: next,
    result: { added, updated, skipped, total: added + updated },
  };
}

export function buildPairingString(peer: Peer): string {
  const params = new URLSearchParams({
    host: peer.host,
    port: String(peer.port),
    sid: peer.sid,
    name: peer.name,
    platform: peer.platform,
  });
  return `pulsetts://sync?${params.toString()}`;
}

export function parsePairingString(raw: string): Peer | null {
  const text = raw.trim();
  if (!text.toLowerCase().startsWith('pulsetts://sync')) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'pulsetts:') return null;
  const host = url.searchParams.get('host')?.trim();
  const sid = url.searchParams.get('sid')?.trim();
  const name = url.searchParams.get('name')?.trim() || '对端设备';
  const platform = url.searchParams.get('platform') === 'android' ? 'android' : 'desktop';
  const port = Number(url.searchParams.get('port'));
  if (!host || !sid) return null;
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host, port, sid, name, platform };
}

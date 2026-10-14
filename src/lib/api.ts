import {
  newId, normalizeBaseUrl, type ApiVersion, type SynthPrefs, type TtsNode, type Voice,
} from '../types/models';

export const DEFAULT_VOICE = 'zh-CN-XiaoxiaoNeural';
const SHORT_TIMEOUT = 6000;
const SYNTH_TIMEOUT = 60000;
const JSON_TYPE = 'application/json; charset=utf-8';

export type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;
export type DelayFn = (ms: number) => Promise<void>;

export interface Api {
  probe(baseUrl: string, label?: string, apiKey?: string | null): Promise<TtsNode>;
  fetchVoices(baseUrl: string): Promise<Voice[] | null>;
  synthesize(node: TtsNode, text: string, prefs: SynthPrefs, retries?: number): Promise<ArrayBuffer | null>;
}

const defaultFetch: FetchImpl = (url, init) =>
  import('@tauri-apps/plugin-http').then((m) => m.fetch(url, init));

export function createApi(
  fetchImpl: FetchImpl = defaultFetch,
  delay: DelayFn = (ms) => new Promise((r) => setTimeout(r, ms)),
): Api {
  async function get(url: string, timeoutMs: number): Promise<Response | null> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetchImpl(url, { method: 'GET', signal: ctrl.signal });
    } catch (e) {
      console.warn(`GET 失败: ${url}`, e);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function getOk(url: string, timeoutMs: number): Promise<boolean | null> {
    const r = await get(url, timeoutMs);
    return r ? r.ok : null;
  }

  async function voicesCount(url: string, timeoutMs: number, times = 1): Promise<number | null> {
    for (let i = 0; i < times; i++) {
      const r = await get(url, timeoutMs);
      if (r && r.ok) {
        try {
          const arr: unknown = await r.json();
          return Array.isArray(arr) ? arr.length : 0;
        } catch {
          return 0;
        }
      }
      if (i < times - 1) await delay(300);
    }
    return null;
  }

  interface Meta { voiceCount: number; defaultVoice: string; version: ApiVersion }

  async function fetchMeta(base: string): Promise<Meta | null> {
    const isV1 = await getOk(`${base}/api/v1/health`, SHORT_TIMEOUT);
    if (isV1 === null) return null;
    if (isV1) {
      const count = await voicesCount(`${base}/api/v1/voices`, SHORT_TIMEOUT * 2);
      return { voiceCount: count ?? 0, defaultVoice: DEFAULT_VOICE, version: 'V1' };
    }
    const count = await voicesCount(`${base}/voices`, SHORT_TIMEOUT, 2);
    return { voiceCount: count ?? 0, defaultVoice: DEFAULT_VOICE, version: 'LEGACY' };
  }

  async function probe(baseUrl: string, label = '', apiKey: string | null = null): Promise<TtsNode> {
    const base = normalizeBaseUrl(baseUrl);
    const keylessResp = await get(`${base}/tts`, SHORT_TIMEOUT);
    let keyless = false;
    if (keylessResp) {
      try {
        const body = await keylessResp.text();
        keyless = keylessResp.status === 400 && body.includes('必须提供文本参数');
      } catch {
        keyless = false;
      }
    }
    const meta = await fetchMeta(base);
    return {
      id: newId(), baseUrl: base, label, keyless, apiKey,
      health: meta || keyless ? 'OK' : 'FAIL', lastChecked: Date.now(),
      defaultVoice: meta?.defaultVoice ?? DEFAULT_VOICE, voiceCount: meta?.voiceCount ?? 0,
      failCount: 0, cooldownUntil: 0, disabled: false,
      apiVersion: meta?.version ?? 'UNKNOWN', source: 'manual',
    };
  }

  async function fetchVoices(baseUrl: string): Promise<Voice[] | null> {
    const base = normalizeBaseUrl(baseUrl);
    const urls = [`${base}/api/v1/voices`, `${base}/voices`];
    for (const url of urls) {
      const r = await get(url, url.endsWith('/voices') && !url.includes('/api/') ? SHORT_TIMEOUT : SYNTH_TIMEOUT);
      if (r && r.ok) {
        try {
          const arr: unknown = await r.json();
          if (Array.isArray(arr) && arr.length) return arr.map(toVoice).filter((v): v is Voice => v !== null);
        } catch {
          /* 解析失败 → 尝试下一个端点 */
        }
      }
    }
    return null;
  }

  function jsonBody(text: string, prefs: SynthPrefs, defaultVoice: string): string {
    const voice = prefs.voice || defaultVoice;
    const obj: Record<string, unknown> = { text, rate: prefs.rate, pitch: prefs.pitch };
    if (voice) obj.voice = voice;
    if (prefs.style) obj.style = prefs.style;
    return JSON.stringify(obj);
  }

  function withApiKey(url: string, node: TtsNode): string {
    if (!node.keyless && node.apiKey) {
      return `${url}${url.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(node.apiKey)}`;
    }
    return url;
  }

  async function postTo(node: TtsNode, url: string, body: string): Promise<ArrayBuffer | null> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), SYNTH_TIMEOUT);
    try {
      const r = await fetchImpl(withApiKey(url, node), {
        method: 'POST',
        headers: { 'Content-Type': JSON_TYPE },
        body,
        signal: ctrl.signal,
      });
      return r.ok ? await r.arrayBuffer() : null;
    } catch (e) {
      console.warn(`POST 失败: ${url}`, e);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function getCompat(node: TtsNode, text: string, p: SynthPrefs): Promise<ArrayBuffer | null> {
    const u = new URL(`${node.baseUrl}/tts`);
    u.searchParams.set('text', text);
    u.searchParams.set('t', text);
    u.searchParams.set('v', p.voice || node.defaultVoice);
    u.searchParams.set('r', String(p.rate));
    u.searchParams.set('p', String(p.pitch));
    if (p.style) u.searchParams.set('s', p.style);
    if (!node.keyless && node.apiKey) u.searchParams.set('api_key', node.apiKey);
    const r = await get(u.toString(), SYNTH_TIMEOUT);
    if (!r || !r.ok) return null;
    try {
      return await r.arrayBuffer();
    } catch {
      return null;
    }
  }

  async function synthesizeOnce(node: TtsNode, text: string, p: SynthPrefs): Promise<ArrayBuffer | null> {
    const body = jsonBody(text, p, node.defaultVoice);
    const post1 = await postTo(node, `${node.baseUrl}/api/v1/tts`, body);
    if (post1) return post1;
    const post2 = await postTo(node, `${node.baseUrl}/tts`, body);
    if (post2) return post2;
    return getCompat(node, text, p);
  }

  async function synthesize(node: TtsNode, text: string, prefs: SynthPrefs, retries = 3): Promise<ArrayBuffer | null> {
    for (let i = 0; i < retries; i++) {
      const bytes = await synthesizeOnce(node, text, prefs);
      if (bytes) return bytes;
      if (i < retries - 1) await delay(400 * (i + 1));
    }
    console.warn(`synthesize failed: ${node.baseUrl}`);
    return null;
  }

  return { probe, fetchVoices, synthesize };
}

function toVoice(raw: unknown): Voice | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.short_name === 'string' ? o.short_name : '';
  if (!id) return null;
  const styles = Array.isArray(o.style_list) ? o.style_list.map(String) : null;
  return {
    id,
    name: typeof o.display_name === 'string' ? o.display_name : '',
    localName: typeof o.local_name === 'string' ? o.local_name : '',
    gender: typeof o.gender === 'string' ? o.gender : '',
    locale: typeof o.locale === 'string' ? o.locale : '',
    styles,
  };
}

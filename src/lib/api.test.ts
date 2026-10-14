import { describe, expect, it } from 'vitest';
import { createApi, type FetchImpl } from './api';
import type { SynthPrefs } from '../types/models';

const BASE = 'https://node.example.com';
const prefs: SynthPrefs = { voice: '', rate: 0, pitch: 0, style: '' };

function router(routes: Record<string, () => Response | never>): { impl: FetchImpl; calls: string[] } {
  const calls: string[] = [];
  const impl: FetchImpl = async (url) => {
    calls.push(url);
    const hit = routes[url];
    if (!hit) throw new Error(`unexpected url: ${url}`);
    return hit();
  };
  return { impl, calls };
}

describe('probe', () => {
  it('老版 keyless：/tts 400 + /api/v1/health 404 + /voices 200 → LEGACY', async () => {
    const { impl, calls } = router({
      [`${BASE}/tts`]: () => new Response('必须提供文本参数', { status: 400 }),
      [`${BASE}/api/v1/health`]: () => new Response('not found', { status: 404 }),
      [`${BASE}/voices`]: () => new Response(JSON.stringify([{ short_name: 'a' }, { short_name: 'b' }]), { status: 200 }),
    });
    const api = createApi(impl, async () => {});
    const node = await api.probe(`${BASE}/`, 'N1');
    expect(node.baseUrl).toBe(BASE);
    expect(node.keyless).toBe(true);
    expect(node.health).toBe('OK');
    expect(node.apiVersion).toBe('LEGACY');
    expect(node.voiceCount).toBe(2);
    expect(node.label).toBe('N1');
    expect(calls[0]).toBe(`${BASE}/tts`);
  });

  it('新版 V1：health 200 + /api/v1/voices 3 个', async () => {
    const { impl } = router({
      [`${BASE}/tts`]: () => new Response('bad request', { status: 400 }),
      [`${BASE}/api/v1/health`]: () => new Response('ok', { status: 200 }),
      [`${BASE}/api/v1/voices`]: () => new Response(JSON.stringify([{ short_name: 'x' }, { short_name: 'y' }, { short_name: 'z' }]), { status: 200 }),
    });
    const api = createApi(impl, async () => {});
    const node = await api.probe(BASE);
    expect(node.apiVersion).toBe('V1');
    expect(node.voiceCount).toBe(3);
    expect(node.health).toBe('OK');
  });

  it('完全不通 → FAIL / UNKNOWN / keyless=false', async () => {
    const impl: FetchImpl = async () => { throw new Error('network down'); };
    const api = createApi(impl, async () => {});
    const node = await api.probe(BASE);
    expect(node.health).toBe('FAIL');
    expect(node.apiVersion).toBe('UNKNOWN');
    expect(node.keyless).toBe(false);
  });
});

describe('synthesize 三级端点回退', () => {
  it('v1 POST 404 → 兼容 POST 404 → GET 200：按序调用并返回字节', async () => {
    const { impl, calls } = router({
      [`${BASE}/api/v1/tts`]: () => new Response('', { status: 404 }),
      [`${BASE}/tts`]: () => new Response('', { status: 404 }),
      [`${BASE}/tts?text=hi&t=hi&v=&r=0&p=0`]: () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    });
    const api = createApi(impl, async () => {});
    const bytes = await api.synthesize(
      { id: 'n', baseUrl: BASE, label: '', keyless: true, apiKey: null, health: 'OK',
        lastChecked: 0, defaultVoice: '', voiceCount: 0, failCount: 0, cooldownUntil: 0,
        disabled: false, apiVersion: 'LEGACY', source: 'manual' },
      'hi', prefs, 1,
    );
    expect(bytes).toBeInstanceOf(ArrayBuffer);
    expect(calls).toEqual([
      `${BASE}/api/v1/tts`,
      `${BASE}/tts`,
      `${BASE}/tts?text=hi&t=hi&v=&r=0&p=0`,
    ]);
  });

  it('非免 Key 节点：所有端点都带 api_key 查询参数', async () => {
    const urls: string[] = [];
    const impl: FetchImpl = async (url) => {
      urls.push(url);
      return new Response('', { status: 404 });
    };
    const api = createApi(impl, async () => {});
    await api.synthesize(
      { id: 'n', baseUrl: BASE, label: '', keyless: false, apiKey: 'SECRET', health: 'OK',
        lastChecked: 0, defaultVoice: 'v1', voiceCount: 0, failCount: 0, cooldownUntil: 0,
        disabled: false, apiVersion: 'LEGACY', source: 'manual' },
      'hi', prefs, 1,
    );
    expect(urls.length).toBe(3);
    for (const u of urls) expect(u).toContain('api_key=SECRET');
  });

  it('重试次数耗尽返回 null，并按 400ms 递增延迟', async () => {
    const delays: number[] = [];
    const impl: FetchImpl = async () => { throw new Error('down'); };
    const api = createApi(impl, async (ms) => { delays.push(ms); });
    const bytes = await api.synthesize(
      { id: 'n', baseUrl: BASE, label: '', keyless: true, apiKey: null, health: 'OK',
        lastChecked: 0, defaultVoice: '', voiceCount: 0, failCount: 0, cooldownUntil: 0,
        disabled: false, apiVersion: 'V1', source: 'manual' },
      'hi', prefs, 3,
    );
    expect(bytes).toBeNull();
    expect(delays).toEqual([400, 800]);
  });
});

describe('fetchVoices', () => {
  it('v1 失败回退老版 /voices 并解析字段', async () => {
    const { impl } = router({
      [`${BASE}/api/v1/voices`]: () => new Response('', { status: 404 }),
      [`${BASE}/voices`]: () => new Response(JSON.stringify([
        { short_name: 'zh-CN-XiaoxiaoNeural', display_name: 'Xiaoxiao', local_name: '晓晓', gender: 'Female', locale: 'zh-CN', style_list: ['cheerful'] },
      ]), { status: 200 }),
    });
    const api = createApi(impl, async () => {});
    const list = await api.fetchVoices(BASE);
    expect(list).not.toBeNull();
    expect(list![0]).toMatchObject({ id: 'zh-CN-XiaoxiaoNeural', localName: '晓晓', styles: ['cheerful'] });
  });
});

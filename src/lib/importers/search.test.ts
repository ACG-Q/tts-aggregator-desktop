import { describe, expect, it } from 'vitest';
import { searchFofa, searchZoomeye, type FetchImpl } from './search';

describe('searchFofa', () => {
  it('GET /api/v1/search/all?email&key&q&size，解析 results', async () => {
    const calls: string[] = [];
    const fetchImpl: FetchImpl = async (url) => {
      calls.push(url);
      return new Response(JSON.stringify({ results: [['1.1.1.1', 443, 'https', 'tts']] }), { status: 200 });
    };
    const out = await searchFofa(fetchImpl, {
      email: 'a@b.c', key: 'KEY', query: 'title="tts"', size: 50,
    });
    expect(calls[0]).toContain('email=a%40b.c');
    expect(calls[0]).toContain('q=');
    expect(calls[0]).toContain('size=50');
    expect(out).toHaveLength(1);
    expect(out[0].ip).toBe('1.1.1.1');
  });

  it('非 2xx 抛出明确错误（不吞异常）', async () => {
    const fetchImpl: FetchImpl = async () => new Response('{"errmsg":"x"}', { status: 401 });
    await expect(searchFofa(fetchImpl, { email: 'e', key: 'k', query: 'q', size: 10 }))
      .rejects.toThrow(/401/);
  });
});

describe('searchZoomeye', () => {
  it('GET /host/search/query?q&page，带 API-KEY 头，解析 matches', async () => {
    let sawHeader = '';
    const fetchImpl: FetchImpl = async (_url, init) => {
      const h = new Headers(init?.headers);
      sawHeader = h.get('API-KEY') ?? '';
      return new Response(JSON.stringify({
        matches: [{ ip_str: '5.5.5.5', port: 443, title: 'tts' }],
      }), { status: 200 });
    };
    const out = await searchZoomeye(fetchImpl, { apiKey: 'ZZ', query: 'tts', page: 1 });
    expect(sawHeader).toBe('ZZ');
    expect(out).toHaveLength(1);
    expect(out[0].port).toBe(443);
  });

  it('非 2xx 抛出明确错误', async () => {
    const fetchImpl: FetchImpl = async () => new Response('', { status: 429 });
    await expect(searchZoomeye(fetchImpl, { apiKey: 'k', query: 'q', page: 1 }))
      .rejects.toThrow(/429/);
  });
});

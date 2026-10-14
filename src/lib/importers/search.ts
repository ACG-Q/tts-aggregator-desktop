import type { FetchImpl } from '../api';
import { parseFofaJson } from './fofa-file';
import type { HostRecord } from './hosts';
import { parseZoomeyeJson } from './zoomeye-file';

export type { FetchImpl };

export interface FofaCreds { email: string; key: string; query: string; size: number }
export interface ZoomeyeCreds { apiKey: string; query: string; page: number }

async function expectOk(res: Response, what: string): Promise<void> {
  if (!res.ok) throw new Error(`${what} 请求失败：HTTP ${res.status}`);
}

export async function searchFofa(fetchImpl: FetchImpl, c: FofaCreds): Promise<HostRecord[]> {
  const url = 'https://fofa.info/api/v1/search/all'
    + `?email=${encodeURIComponent(c.email)}&key=${encodeURIComponent(c.key)}`
    + `&q=${encodeURIComponent(c.query)}&size=${c.size}&fields=ip,port,protocol,title`;
  const res = await fetchImpl(url);
  await expectOk(res, 'FOFA');
  return parseFofaJson(await res.text());
}

export async function searchZoomeye(fetchImpl: FetchImpl, c: ZoomeyeCreds): Promise<HostRecord[]> {
  const url = `https://api.zoomeye.org/host/search/query?q=${encodeURIComponent(c.query)}&page=${c.page}`;
  const res = await fetchImpl(url, { headers: { 'API-KEY': c.apiKey } });
  await expectOk(res, 'ZoomEye');
  return parseZoomeyeJson(await res.text());
}

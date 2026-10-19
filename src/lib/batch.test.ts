import { describe, expect, it } from 'vitest';
import { parseBatchLines } from './batch';

describe('parseBatchLines', () => {
  it('每行一个 URL，无标签与 Key 时标签取域名', () => {
    const r = parseBatchLines('https://a.example.com\nhttps://b.example.com', []);
    expect(r.items).toEqual([
      { baseUrl: 'https://a.example.com', label: 'a.example.com', apiKey: null },
      { baseUrl: 'https://b.example.com', label: 'b.example.com', apiKey: null },
    ]);
    expect(r.duplicates).toEqual([]);
    expect(r.invalid).toEqual([]);
  });

  it('URL+标签+Key 空格分隔', () => {
    const r = parseBatchLines('https://a.example.com 我的节点 sk-123', []);
    expect(r.items).toEqual([{ baseUrl: 'https://a.example.com', label: '我的节点', apiKey: 'sk-123' }]);
  });

  it('URL+标签无 Key，Tab 分隔', () => {
    const r = parseBatchLines('https://a.example.com\t标签A', []);
    expect(r.items).toEqual([{ baseUrl: 'https://a.example.com', label: '标签A', apiKey: null }]);
  });

  it('跳过空行并忽略行内多余空白', () => {
    const r = parseBatchLines('\n\nhttps://a.example.com  标签   key \n\n', []);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].label).toBe('标签');
    expect(r.items[0].apiKey).toBe('key');
  });

  it('重复 URL（含尾斜杠差异）归入 duplicates', () => {
    const r = parseBatchLines('https://a.example.com\nhttps://a.example.com/\nhttps://a.example.com', []);
    expect(r.items).toHaveLength(1);
    expect(r.duplicates).toEqual(['https://a.example.com', 'https://a.example.com']);
  });

  it('已存在的节点 URL 归入 duplicates', () => {
    const r = parseBatchLines('https://a.example.com\nhttps://c.example.com', ['https://a.example.com']);
    expect(r.items.map((i) => i.baseUrl)).toEqual(['https://c.example.com']);
    expect(r.duplicates).toEqual(['https://a.example.com']);
  });

  it('无协议或非 http(s) 的行归入 invalid', () => {
    const r = parseBatchLines('a.example.com\nftp://x.example.com\nhttps://ok.example.com', []);
    expect(r.invalid).toEqual(['a.example.com', 'ftp://x.example.com']);
    expect(r.items).toHaveLength(1);
  });
});

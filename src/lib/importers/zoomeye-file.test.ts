import { describe, expect, it } from 'vitest';
import { parseZoomeyeJson } from './zoomeye-file';

describe('parseZoomeyeJson', () => {
  it('解析 matches[].port 与 ip_str、title/site 线索', () => {
    const json = JSON.stringify({
      matches: [
        { ip_str: '5.5.5.5', port: 443, protocol: 'https', title: 'TTS' },
        { ip_str: '6.6.6.6', port: 80, site: 'http://x.com' },
      ],
    });
    const out = parseZoomeyeJson(json);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ ip: '5.5.5.5', port: 443, title: 'TTS' });
    expect(out[1].port).toBe(80);
  });

  it('port 字符串形式转数字，缺失跳过', () => {
    const json = JSON.stringify({
      matches: [
        { ip_str: '7.7.7.7', port: '8080' },
        { ip_str: '8.8.8.8' },
      ],
    });
    const out = parseZoomeyeJson(json);
    expect(out).toHaveLength(1);
    expect(out[0].port).toBe(8080);
  });

  it('非法 JSON 抛出明确错误', () => {
    expect(() => parseZoomeyeJson('{oops')).toThrow(/JSON/);
  });
});

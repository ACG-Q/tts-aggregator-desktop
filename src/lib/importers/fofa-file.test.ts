import { describe, expect, it } from 'vitest';
import { parseFofaCsv, parseFofaJson } from './fofa-file';

describe('parseFofaCsv', () => {
  it('解析 export=1 格式（表头 ip,port,protocol,title）', () => {
    const csv = 'ip,port,protocol,title\n1.1.1.1,443,https,TTS gateway\n2.2.2.2,80,http,nginx\n';
    const out = parseFofaCsv(csv);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ ip: '1.1.1.1', port: 443, protocol: 'https', title: 'TTS gateway' });
  });

  it('列顺序可变（按表头定位），跳过坏行不吞错误', () => {
    const csv = 'port,ip,protocol,title\n8080,3.3.3.3,http,x\nbad,row\n';
    const out = parseFofaCsv(csv);
    expect(out).toHaveLength(1);
    expect(out[0].ip).toBe('3.3.3.3');
    expect(out[0].port).toBe(8080);
  });

  it('空输入返回空数组', () => {
    expect(parseFofaCsv('')).toEqual([]);
  });
});

describe('parseFofaJson', () => {
  it('解析 results 数组（FOFA API / export JSON）', () => {
    const json = JSON.stringify({ results: [['1.1.1.1', 443, 'https', 'tts']] });
    const out = parseFofaJson(json);
    expect(out).toEqual([{ ip: '1.1.1.1', port: 443, protocol: 'https', title: 'tts' }]);
  });

  it('解析对象数组形态', () => {
    const json = JSON.stringify([{ ip: '4.4.4.4', port: 8443, protocol: 'https', title: 'voice' }]);
    const out = parseFofaJson(json);
    expect(out[0].port).toBe(8443);
  });

  it('非法 JSON 抛出明确错误', () => {
    expect(() => parseFofaJson('not json')).toThrow(/JSON/);
  });
});

import { describe, expect, it } from 'vitest';
import { decodeTextBuffer } from './encoding';

describe('decodeTextBuffer', () => {
  it('UTF-8 正常解码', () => {
    const buf = new TextEncoder().encode('你好，世界').buffer;
    expect(decodeTextBuffer(buf)).toBe('你好，世界');
  });

  it('非法 UTF-8 回退 gb18030', () => {
    // GBK 编码的 "中文"：0xD6D0 0xCEC4
    const gbk = new Uint8Array([0xd6, 0xd0, 0xce, 0xc4]);
    expect(decodeTextBuffer(gbk.buffer)).toBe('中文');
  });
});

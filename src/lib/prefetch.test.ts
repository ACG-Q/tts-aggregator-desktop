import { describe, expect, it } from 'vitest';
import { PrefetchWindow } from './prefetch';

function bytes(n: number): ArrayBuffer {
  return new Uint8Array([n]).buffer;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

describe('PrefetchWindow', () => {
  it('按顺序预取窗口内的后续段', async () => {
    const calls: string[] = [];
    const w = new PrefetchWindow({
      size: 3,
      synth: async (text) => {
        calls.push(text);
        return bytes(text.length);
      },
    });
    w.ensure(0, [{ text: 'a' }, { text: 'b' }, { text: 'c' }, { text: 'd' }, { text: 'e' }]);
    await w.whenIdle();
    expect(calls).toEqual(['b', 'c', 'd']);
  });

  it('take 命中后移除，第二次返回 null', async () => {
    const w = new PrefetchWindow({ size: 2, synth: async () => bytes(1) });
    w.ensure(0, [{ text: 'a' }, { text: 'b' }, { text: 'c' }]);
    const first = w.take(1);
    expect(first).not.toBeNull();
    expect(w.take(1)).toBeNull();
    await expect(first!).resolves.toBeInstanceOf(ArrayBuffer);
  });

  it('不重复预取同一索引', async () => {
    const calls: string[] = [];
    const w = new PrefetchWindow({
      size: 2,
      synth: async (text) => { calls.push(text); return bytes(1); },
    });
    w.ensure(0, [{ text: 'a' }, { text: 'b' }, { text: 'c' }]);
    w.ensure(0, [{ text: 'a' }, { text: 'b' }, { text: 'c' }]);
    await w.whenIdle();
    expect(calls).toEqual(['b', 'c']);
  });

  it('失败时移除缓存并回调 fail', async () => {
    const states: string[] = [];
    const w = new PrefetchWindow({
      size: 1,
      synth: async () => { throw new Error('boom'); },
      onState: (index, state) => states.push(`${index}:${state}`),
    });
    w.ensure(0, [{ text: 'a' }, { text: 'b' }]);
    await w.whenIdle();
    expect(states).toEqual(['1:start', '1:fail']);
    expect(w.take(1)).toBeNull();
  });

  it('clear 后丢弃旧任务结果', async () => {
    let release: (b: ArrayBuffer) => void = () => {};
    const w = new PrefetchWindow({
      size: 1,
      synth: () => new Promise((resolve) => { release = resolve; }),
    });
    w.ensure(0, [{ text: 'a' }, { text: 'b' }]);
    await flush();
    w.clear();
    release(bytes(1));
    await flush();
    expect(w.take(1)).toBeNull();
  });
});

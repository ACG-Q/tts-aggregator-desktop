import { describe, expect, it } from 'vitest';
import { mapLimit } from './async';

describe('mapLimit', () => {
  it('按序返回结果且并发数不超限', async () => {
    let active = 0;
    let peak = 0;
    const items = [1, 2, 3, 4, 5, 6];
    const out = await mapLimit(items, 2, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10, 12]);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('空数组返回空', async () => {
    expect(await mapLimit([], 4, async () => 1)).toEqual([]);
  });
});

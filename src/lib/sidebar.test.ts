import { describe, expect, it } from 'vitest';
import { resolveCollapsed } from './sidebar';

describe('resolveCollapsed', () => {
  it('宽窗口 + 无手动偏好 → 展开', () => {
    expect(resolveCollapsed(1200, null, 768)).toBe(false);
  });

  it('窄窗口 + 无手动偏好 → 自动折叠', () => {
    expect(resolveCollapsed(700, null, 768)).toBe(true);
  });

  it('窄窗口 + 手动展开 → 手动优先，展开', () => {
    expect(resolveCollapsed(700, false, 768)).toBe(false);
  });

  it('宽窗口 + 手动折叠 → 手动优先，折叠', () => {
    expect(resolveCollapsed(1200, true, 768)).toBe(true);
  });

  it('正好等于阈值 → 不折叠', () => {
    expect(resolveCollapsed(768, null, 768)).toBe(false);
  });
});

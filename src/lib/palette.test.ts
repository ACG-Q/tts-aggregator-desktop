import { describe, expect, it } from 'vitest';
import { PALETTES, applyPalette, isPaletteId } from './palette';

describe('palette', () => {
  it('三套配色元数据完整', () => {
    expect(PALETTES.map((p) => p.id)).toEqual(['ink', 'celadon', 'walnut']);
    for (const p of PALETTES) {
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.swatch).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('isPaletteId 只接受白名单', () => {
    expect(isPaletteId('ink')).toBe(true);
    expect(isPaletteId('celadon')).toBe(true);
    expect(isPaletteId('walnut')).toBe(true);
    expect(isPaletteId('blue')).toBe(false);
    expect(isPaletteId(null)).toBe(false);
  });

  it('applyPalette 写入 data-palette', () => {
    const root = { dataset: {} } as unknown as HTMLElement;
    applyPalette('walnut', root);
    expect(root.dataset.palette).toBe('walnut');
  });
});

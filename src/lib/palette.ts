import type { PaletteId } from '../types/models';

export interface PaletteMeta {
  id: PaletteId;
  label: string;
  hint: string;
  swatch: string;
}

export const PALETTES: PaletteMeta[] = [
  { id: 'ink', label: '墨绿', hint: '墨绿 · 纸白', swatch: '#4f7259' },
  { id: 'celadon', label: '青瓷', hint: '青瓷 · 瓷青', swatch: '#3f726b' },
  { id: 'walnut', label: '胡桃', hint: '胡桃 · 书房', swatch: '#7b5c3b' },
];

const IDS = new Set<string>(PALETTES.map((p) => p.id));

export function isPaletteId(value: unknown): value is PaletteId {
  return typeof value === 'string' && IDS.has(value);
}

export function applyPalette(palette: PaletteId, root: HTMLElement = document.documentElement): void {
  root.dataset.palette = palette;
}

import { describe, expect, it } from 'vitest';

import { SECTORES_INICIALES } from '../../../domain/entities';
import { colorDeSector } from '../crmUi';

describe('colorDeSector', () => {
  it('gives the six initial sectors the colors of the approved design, in order', () => {
    expect(SECTORES_INICIALES.map((s) => colorDeSector(s))).toEqual([
      'bg-amber-100 text-amber-800',
      'bg-slate-200 text-slate-700',
      'bg-blue-100 text-blue-800',
      'bg-teal-100 text-teal-800',
      'bg-pink-100 text-pink-800',
      'bg-violet-100 text-violet-800',
    ]);
  });

  it('matches the initial sectors whatever the case, and keeps "Sin sector" grey', () => {
    expect(colorDeSector('CONSTRUCCIÓN')).toBe(colorDeSector('Construcción'));
    expect(colorDeSector(null)).toBe('bg-slate-200 text-slate-700');
  });

  it('a sector created later never reuses the color of an initial sector, so the two cannot be confused', () => {
    const iniciales = new Set(SECTORES_INICIALES.map((x) => colorDeSector(x)));
    for (const nombre of ['Educación', 'Salud', 'Agro', 'Pesca', 'Turismo', 'Banca', 'Logística', 'Textil']) {
      expect(iniciales.has(colorDeSector(nombre))).toBe(false);
    }
  });

  it('a sector created later gets a stable color that never changes when other sectors are added', () => {
    const antes = colorDeSector('Educación');
    expect(colorDeSector('Educación')).toBe(antes);
    expect(antes).toMatch(/^bg-[a-z]+-(100|200) text-[a-z]+-(700|800)$/);
  });
});

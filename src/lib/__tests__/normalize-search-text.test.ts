import { describe, it, expect } from 'vitest';
import { normalizeSearchText } from '../normalize-search-text';

/**
 * historial-envios-consolidados PR1 — the canonical search space.
 * Both the precomputed write-side columns and the query-side term run
 * through this function, so "Perú" matches "peru" and vice versa.
 */
describe('normalizeSearchText', () => {
  it('strips accents and lowercases accented input', () => {
    expect(normalizeSearchText('Perú')).toBe('peru');
    expect(normalizeSearchText('María')).toBe('maria');
    expect(normalizeSearchText('Ítalo Ñuñez')).toBe('italo nunez');
  });

  it('lowercases already-unaccented input (passthrough)', () => {
    expect(normalizeSearchText('Holomedic S.A.C.')).toBe('holomedic s.a.c.');
    expect(normalizeSearchText('RESULTADOS')).toBe('resultados');
  });

  it('returns empty string for null, undefined and empty input', () => {
    expect(normalizeSearchText(null)).toBe('');
    expect(normalizeSearchText(undefined)).toBe('');
    expect(normalizeSearchText('')).toBe('');
  });

  it('is idempotent — normalizing twice yields the same value', () => {
    const once = normalizeSearchText('Comunicación y Gestión S.A.');
    expect(normalizeSearchText(once)).toBe(once);
  });

  it('preserves digits and punctuation (DNI search axis)', () => {
    expect(normalizeSearchText('12345678')).toBe('12345678');
    expect(normalizeSearchText('cliente+TAG@Mail.COM')).toBe('cliente+tag@mail.com');
  });
});

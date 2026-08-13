import { describe, expect, it } from 'vitest';
import { normalizeTipoExamen } from '../normalizeTipoExamen';

/**
 * WU-1.2 (nomenclatura-adicionales) — signal-boundary normalization.
 *
 * The routes/UI receive raw signals (`DesTCh` like `'ADICIONALES'` or a
 * `tipoExamen` query value) and MUST map them to the domain union before
 * touching the rename helpers. Garbage MUST yield `undefined` so callers
 * can reject it with a 400 or fall back to legacy behavior.
 */
describe('normalizeTipoExamen', () => {
  it.each([
    ['ADICIONALES', 'ADICIONAL'],
    ['ADICIONAL', 'ADICIONAL'],
    ['CAMO', 'CAMO'],
    ['EMO', 'EMO'],
  ])('normalizes "%s" → "%s"', (input, expected) => {
    expect(normalizeTipoExamen(input)).toBe(expected);
  });

  it('is case-insensitive and trims surrounding whitespace', () => {
    expect(normalizeTipoExamen(' adicionales ')).toBe('ADICIONAL');
    expect(normalizeTipoExamen('ADICIONAL')).toBe('ADICIONAL');
    expect(normalizeTipoExamen('camo')).toBe('CAMO');
    expect(normalizeTipoExamen('emo')).toBe('EMO');
  });

  it.each([
    undefined,
    '',
    '   ',
    'RAYOS X',
    'PREOCUPACIONAL',
    'PERIODICO',
    'OTRO EXAMEN',
    '123',
    'ADICIONALEX',
  ])('returns undefined for garbage signals (%s)', (input) => {
    expect(normalizeTipoExamen(input)).toBeUndefined();
  });
});

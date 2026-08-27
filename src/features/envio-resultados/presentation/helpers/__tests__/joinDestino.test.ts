/**
 * `joinDestino` composes the email-level `destino` for the wizard
 * handoff (REQ-105, design D5): the distinct trimmed non-empty
 * `proyecto` values of the refs ACTUALLY INCLUDED in the send, in
 * first-appearance order, joined with `", "`, capped at 200 chars
 * (the history column is NVARCHAR(200) — overflow truncates to
 * 197 chars + `'...'`). When NO ref carries a proyecto, the
 * request-level fallback (today's derivation) is returned unchanged.
 *
 * Spec coverage:
 *  - S-105.1 — dedupe + first-appearance order (UNACEM twice).
 *  - S-105.2 — single-proyecto send = bare proyecto.
 *  - S-105.3 — 200-char cap ending in `'...'`.
 */
import { describe, expect, it } from 'vitest';

import { joinDestino } from '../joinDestino';
import type { SelectedFileRef } from '../../../domain/entities';

function ref(proyecto?: string): SelectedFileRef {
  return {
    ruc: '20123456789',
    dni: '00250391',
    idAten: 'AT-1',
    path: 'LEGAJOS',
    name: '00250391CERT.pdf',
    ...(proyecto === undefined ? {} : { proyecto }),
  };
}

describe('joinDestino (REQ-105, D5)', () => {
  it('joins distinct proyectos in first-appearance order, deduped (S-105.1: UNACEM twice)', () => {
    const refs = [
      ref('NEXA RESOURCES CAJAMARQUILLA'),
      ref('UNACEM'),
      ref('MINSUR'),
      ref('UNACEM'),
    ];
    expect(joinDestino(refs, 'FALLBACK')).toBe(
      'NEXA RESOURCES CAJAMARQUILLA, UNACEM, MINSUR',
    );
  });

  it('single-proyecto send yields the bare proyecto (S-105.2)', () => {
    expect(joinDestino([ref('UNACEM'), ref('UNACEM')], 'FALLBACK')).toBe('UNACEM');
  });

  it('caps the join at 200 chars ending in "..." (S-105.3)', () => {
    const refs = Array.from(
      { length: 12 },
      (_, i) => ref(`PROYECTO-LARGO-${String(i).padStart(2, '0')}-SECTOR MINERO`),
    );
    const result = joinDestino(refs, 'FALLBACK');
    expect(result.length).toBe(200);
    expect(result.endsWith('...')).toBe(true);
  });

  it('returns the fallback when no ref carries proyecto', () => {
    expect(joinDestino([ref(), ref()], 'METRO LIMA')).toBe('METRO LIMA');
  });

  it('returns the fallback when every proyecto is empty or whitespace', () => {
    expect(joinDestino([ref(''), ref('   ')], 'FALLBACK')).toBe('FALLBACK');
  });

  it('trims proyectos and dedupes on the trimmed value', () => {
    const refs = [ref(' UNACEM '), ref('UNACEM'), ref('  MINSUR')];
    expect(joinDestino(refs, 'FALLBACK')).toBe('UNACEM, MINSUR');
  });

  it('empty refs list yields the fallback', () => {
    expect(joinDestino([], 'FALLBACK')).toBe('FALLBACK');
  });
});

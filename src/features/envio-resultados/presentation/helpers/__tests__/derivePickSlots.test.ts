/**
 * `derivePickSlots` maps a patient's fichas into per-ficha CAMO/EMO
 * pick slots. Only fichas with a non-empty `idAten` become slots
 * (the FilesModal needs the attendance id). Each slot carries its
 * composite `pickKey`, its ficha, and a display label: the ficha's
 * proyecto, falling back to `Atención <idAten>` when empty.
 *
 * Spec coverage (envio-resultados-multi-proyecto):
 *  - REQ-102 — one slot per (patient, ficha with non-empty idAten),
 *    proyecto label, fallback label.
 */
import { describe, expect, it } from 'vitest';

import { derivePickSlots } from '../derivePickSlots';
import type { UnifiedPerson } from '@/types/sp-result';

// ---- Fixtures ----

function makePerson(overrides: Partial<UnifiedPerson> = {}): UnifiedPerson {
  return {
    dni: '12345678',
    nombre: 'JUAN PEREZ',
    empresa: 'ACME S.A.C.',
    tipoExamen: 'CAMO',
    proyecto: 'METRO LIMA',
    condic: '',
    fichas: [],
    ...overrides,
  };
}

function makeFicha(idAten: string, proyecto: string): UnifiedPerson['fichas'][number] {
  return {
    idAten,
    nroRuc: '20123456789',
    nomCFa: 'ACME S.A.C.',
    proyecto,
    tipoExamen: 'CAMO',
    condic: '',
    fecAte: '17/06/2026',
  };
}

// ================================================================

describe('derivePickSlots', () => {
  it('returns one slot per idAten-bearing ficha, in ficha order, keyed by dni::idAten (REQ-102)', () => {
    const person = makePerson({
      dni: '11111111',
      fichas: [
        makeFicha('AT-1', 'NEXA RESOURCES CAJAMARQUILLA'),
        makeFicha('AT-2', 'UNACEM'),
        makeFicha('AT-3', 'MINSUR'),
      ],
    });
    const slots = derivePickSlots(person);
    expect(slots).toHaveLength(3);
    expect(slots.map((s) => s.key)).toEqual([
      '11111111::AT-1',
      '11111111::AT-2',
      '11111111::AT-3',
    ]);
    expect(slots.map((s) => s.label)).toEqual([
      'NEXA RESOURCES CAJAMARQUILLA',
      'UNACEM',
      'MINSUR',
    ]);
    // The ficha travels with the slot so the UI can bind
    // nroRuc/fecAte/tipoExamen per atención.
    expect(slots[0]?.ficha.idAten).toBe('AT-1');
    expect(slots[2]?.ficha.fecAte).toBe('17/06/2026');
  });

  it('falls back to "Atención <idAten>" when the ficha proyecto is empty', () => {
    const person = makePerson({
      dni: '22222222',
      fichas: [makeFicha('AT-9', '')],
    });
    const slots = derivePickSlots(person);
    expect(slots).toHaveLength(1);
    expect(slots[0]?.label).toBe('Atención AT-9');
  });

  it('excludes fichas with an empty idAten (no FilesModal coordinates)', () => {
    const person = makePerson({
      dni: '33333333',
      fichas: [
        makeFicha('', 'SIN ATENCION'),
        makeFicha('AT-5', 'UNACEM'),
      ],
    });
    const slots = derivePickSlots(person);
    expect(slots).toHaveLength(1);
    expect(slots[0]?.key).toBe('33333333::AT-5');
  });

  it('returns the single slot for a single-ficha patient (caller decides legacy render)', () => {
    const person = makePerson({
      dni: '44444444',
      fichas: [makeFicha('AT-7', 'METRO LIMA')],
    });
    const slots = derivePickSlots(person);
    expect(slots).toHaveLength(1);
    expect(slots[0]?.key).toBe('44444444::AT-7');
    expect(slots[0]?.label).toBe('METRO LIMA');
  });

  it('returns an empty list for a patient with no idAten-bearing fichas', () => {
    const person = makePerson({
      dni: '55555555',
      fichas: [makeFicha('', 'X'), makeFicha('', 'Y')],
    });
    expect(derivePickSlots(person)).toEqual([]);
  });
});

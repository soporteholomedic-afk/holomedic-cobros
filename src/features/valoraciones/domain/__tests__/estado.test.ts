import { describe, expect, it } from 'vitest';

import { ESTADO_SIN_DATOS, ESTADOS_EMPRESA, estadoFromEstCob } from '../estado';

describe('estadoFromEstCob — SP code matrix (spec D1)', () => {
  it("maps 'C' to PAGO CONFORME", () => {
    expect(estadoFromEstCob('C')).toBe('PAGO CONFORME');
  });

  it("maps 'PP' to PAGO POR CONFIRMAR", () => {
    expect(estadoFromEstCob('PP')).toBe('PAGO POR CONFIRMAR');
  });

  it("maps 'P' to CREDITO", () => {
    expect(estadoFromEstCob('P')).toBe('CREDITO');
  });
});

describe('estadoFromEstCob — total fallback (spec D2)', () => {
  const SIN_DATOS = '\u2014'; // U+2014 EM DASH, exact

  it.each([null, undefined, '', '   ', 'X'])(
    'maps %# (null/blank/unknown) to the U+2014 fallback',
    (raw) => {
      const estado = estadoFromEstCob(raw);
      expect(estado).toBe(SIN_DATOS);
      expect(estado).toBe(ESTADO_SIN_DATOS);
      expect(estado).not.toBe('X'); // unknown raw code never leaks
    },
  );

  it("trims padded codes before matching: ' P ' → CREDITO", () => {
    expect(estadoFromEstCob(' P ')).toBe('CREDITO');
  });
});

describe('ESTADOS_EMPRESA — runtime whitelist', () => {
  it('contains exactly the 4 union members: 3 labels + fallback', () => {
    expect(ESTADOS_EMPRESA).toHaveLength(4);
    expect([...ESTADOS_EMPRESA]).toEqual([
      'PAGO CONFORME',
      'PAGO POR CONFIRMAR',
      'CREDITO',
      '\u2014',
    ]);
  });
});

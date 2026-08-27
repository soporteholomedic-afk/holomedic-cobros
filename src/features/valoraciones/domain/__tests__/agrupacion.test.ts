import { describe, it, expect } from 'vitest';

import { agruparPorEmpresa, round2, ventaPorMoneda, IGV_PORCENTAJE } from '../agrupacion';
import { makeRepFacturacion } from '../fixtures';

describe('round2', () => {
  it('rounds to two decimals (floating-point safe)', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(10.005)).toBe(10.01);
    expect(round2(10.004)).toBe(10);
    expect(round2(-3.14159)).toBe(-3.14);
  });
});

describe('ventaPorMoneda — CodMon selects *MN vs *MO', () => {
  it('returns VVtaMN for SOLES (codMon 1)', () => {
    const row = makeRepFacturacion({ VVtaMN: 100.5, VVtaMO: 999 });
    expect(ventaPorMoneda(row, 1)).toBe(100.5);
  });

  it('returns VVtaMO for DOLARES (codMon 2)', () => {
    const row = makeRepFacturacion({ VVtaMN: 100.5, VVtaMO: 28.7 });
    expect(ventaPorMoneda(row, 2)).toBe(28.7);
  });
});

describe('agruparPorEmpresa', () => {
  it('returns an empty array for no rows', () => {
    expect(agruparPorEmpresa([], 1)).toEqual([]);
  });

  it('groups rows by facturar-a (NomCFa), not by NomCli', () => {
    const rows = [
      makeRepFacturacion({ NomCFa: 'EMPRESA A', NomCli: 'CLIENTE X', VVtaMN: 10 }),
      makeRepFacturacion({ NomCFa: 'EMPRESA B', NomCli: 'CLIENTE X', VVtaMN: 5 }),
      makeRepFacturacion({ NomCFa: 'EMPRESA A', NomCli: 'CLIENTE Y', VVtaMN: 20.25 }),
    ];

    const grupos = agruparPorEmpresa(rows, 1);

    expect(grupos).toHaveLength(2);
    const a = grupos.find((g) => g.empresa === 'EMPRESA A');
    const b = grupos.find((g) => g.empresa === 'EMPRESA B');
    expect(a?.cantidad).toBe(2);
    expect(a?.subtotal).toBe(30.25);
    expect(b?.subtotal).toBe(5);
  });

  it('sums *MO amounts when codMon is 2 (DOLARES)', () => {
    const rows = [
      makeRepFacturacion({ NomCFa: 'EMPRESA A', VVtaMO: 12.34, VVtaMN: 999 }),
      makeRepFacturacion({ NomCFa: 'EMPRESA A', VVtaMO: 1.11, VVtaMN: 999 }),
    ];

    const [grupo] = agruparPorEmpresa(rows, 2);

    expect(grupo.subtotal).toBe(13.45);
  });

  it('computes IGV at 18% of the subtotal and the grand total, all round2', () => {
    const rows = [
      makeRepFacturacion({ NomCFa: 'EMPRESA A', VVtaMN: 10.1 }),
      makeRepFacturacion({ NomCFa: 'EMPRESA A', VVtaMN: 20.2 }),
    ];

    const [grupo] = agruparPorEmpresa(rows, 1);

    expect(IGV_PORCENTAJE).toBe(18);
    expect(grupo.subtotal).toBe(30.3);
    expect(grupo.igv).toBe(round2(30.3 * 0.18));
    expect(grupo.igv).toBe(5.45);
    expect(grupo.total).toBe(35.75);
  });

  it('falls back to NomCli when NomCFa is empty, and to a placeholder when both are empty', () => {
    const rows = [
      makeRepFacturacion({ NomCFa: '', NomCli: 'CLIENTE FALLBACK', VVtaMN: 1 }),
      makeRepFacturacion({ NomCFa: '   ', NomCli: '  ', VVtaMN: 2 }),
    ];

    const grupos = agruparPorEmpresa(rows, 1);

    expect(grupos).toHaveLength(2);
    expect(grupos.map((g) => g.empresa)).toEqual(['CLIENTE FALLBACK', 'SIN EMPRESA']);
  });

  it('keeps the currency symbol of the group and preserves row order inside the group', () => {
    const rowA = makeRepFacturacion({ NomCFa: 'EMPRESA A', IdAten: '111', Simbol: 's/.' });
    const rowB = makeRepFacturacion({ NomCFa: 'EMPRESA A', IdAten: '222', Simbol: 's/.' });

    const [grupo] = agruparPorEmpresa([rowA, rowB], 1);

    expect(grupo.simbol).toBe('s/.');
    expect(grupo.rows).toEqual([rowA, rowB]);
  });

  it('sorts groups alphabetically by empresa for a stable table', () => {
    const rows = [
      makeRepFacturacion({ NomCFa: 'ZETA' }),
      makeRepFacturacion({ NomCFa: 'ALFA' }),
      makeRepFacturacion({ NomCFa: 'MEDIO' }),
    ];

    expect(agruparPorEmpresa(rows, 1).map((g) => g.empresa)).toEqual(['ALFA', 'MEDIO', 'ZETA']);
  });
});

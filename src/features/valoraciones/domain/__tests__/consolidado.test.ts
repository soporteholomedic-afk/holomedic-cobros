import { describe, expect, it } from 'vitest';

import {
  aplicarAjusteAdicionales,
  consolidarPorDestino,
  type ConsolidadoAdicional,
  type ConsolidadoRow,
} from '../consolidado';

/**
 * Parity fixtures mirroring SIGLA's `RptFacturacionForm.ConsFacturacion`
 * (lines 144–291): the SP main list, the Adicionales list, the exact
 * client-side adjustment, and the per-destino totals table.
 */

function makeMainRow(overrides: Partial<ConsolidadoRow> = {}): ConsolidadoRow {
  return {
    CodCli: 55,
    NomCom: 'EMPRESA DEMO S.A.C.',
    CodDes: 101,
    DesDes: 'SEDE NORTE',
    IdeTCh: 510001,
    DesTCh: 'PREOCUPACIONAL',
    CanEva: 10,
    VImpMN: 1180,
    VImpMO: 0,
    VVtaMN: 1000,
    VVtaMO: 0,
    ...overrides,
  };
}

function makeAdicional(overrides: Partial<ConsolidadoAdicional> = {}): ConsolidadoAdicional {
  return {
    CodCli: 55,
    NomCom: 'EMPRESA DEMO S.A.C.',
    CodDes: 101,
    DesDes: 'SEDE NORTE',
    NomSer: 'EXAMEN ADICIONAL',
    CanEva: 1,
    ValImp: 118,
    ValVta: 100,
    ...overrides,
  };
}

describe('aplicarAjusteAdicionales', () => {
  it('applies the SIGLA parity case: preocupacional subtracts, adicionales replace, importe always subtracts', () => {
    const main = [
      // Preocupacional: VVta accumulates subtractions; VImp accumulates.
      makeMainRow({ IdeTCh: 510001, DesTCh: 'PREOCUPACIONAL', VVtaMN: 1000, VImpMN: 1180 }),
      // "Adicionales" header row: VVta is REPLACED from the original each adicional.
      makeMainRow({ IdeTCh: 510011, DesTCh: 'ADICIONALES', VVtaMN: 500, VImpMN: 590 }),
    ];
    const adicionales = [
      makeAdicional({ NomSer: 'ADI UNO', ValVta: 100, ValImp: 118 }),
      makeAdicional({ NomSer: 'ADI DOS', ValVta: 50, ValImp: 59 }),
    ];

    const filas = aplicarAjusteAdicionales(main, adicionales);

    // Main rows first (SIGLA order), adjusted values rounded to 2.
    expect(filas).toHaveLength(4);
    expect(filas[0]).toMatchObject({ desTCh: 'PREOCUPACIONAL', venta: 850, importe: 1003 });
    expect(filas[1]).toMatchObject({ desTCh: 'ADICIONALES', venta: 450, importe: 413 });
    // Then the adicionales appended as printable rows (NomSer as description).
    expect(filas[2]).toMatchObject({ desTCh: 'ADI UNO', venta: 100, importe: 118 });
    expect(filas[3]).toMatchObject({ desTCh: 'ADI DOS', venta: 50, importe: 59 });
  });

  it('leaves rows untouched when no adicional shares the destino (but still appends the adicional row)', () => {
    const main = [makeMainRow({ IdeTCh: 510008, DesTCh: 'PERIODICO', VVtaMN: 200.5, VImpMN: 236.59 })];
    const adicionales = [makeAdicional({ CodDes: 102, DesDes: 'SEDE SUR', NomSer: 'ADI OTRO' })];

    const filas = aplicarAjusteAdicionales(main, adicionales);

    // SIGLA appends every adicional as a printable row even when it adjusted
    // nothing (C# lines 186–207 append the whole list unconditionally).
    expect(filas).toHaveLength(2);
    expect(filas[0]).toMatchObject({ desTCh: 'PERIODICO', venta: 200.5, importe: 236.59 });
    expect(filas[1]).toMatchObject({ desTCh: 'ADI OTRO', codDes: 102, desDes: 'SEDE SUR' });
  });

  it('matches adicionales to main rows by destino including null-to-null', () => {
    const main = [makeMainRow({ CodDes: null, DesDes: '', VVtaMN: 300, VImpMN: 354 })];
    const adicionales = [makeAdicional({ CodDes: null, DesDes: '', ValVta: 30, ValImp: 35.4 })];

    const filas = aplicarAjusteAdicionales(main, adicionales);

    // C# `t.CodDes == iCodDes` treats null == null as a match — mirrored.
    expect(filas[0]).toMatchObject({ venta: 270, importe: 318.6 });
  });

  it('applies each adicional once per matching main row (same destino, two main rows)', () => {
    const main = [
      makeMainRow({ IdeTCh: 510001, VVtaMN: 100, VImpMN: 118 }),
      makeMainRow({ IdeTCh: 510001, DesTCh: 'PREOCUPACIONAL B', VVtaMN: 200, VImpMN: 236 }),
    ];
    const adicionales = [makeAdicional({ ValVta: 10, ValImp: 11.8 })];

    const filas = aplicarAjusteAdicionales(main, adicionales);

    expect(filas[0]).toMatchObject({ venta: 90, importe: 106.2 });
    expect(filas[1]).toMatchObject({ venta: 190, importe: 224.2 });
  });

  it('rounds adjusted amounts to two decimals like the SIGLA DataTable write', () => {
    const main = [makeMainRow({ IdeTCh: 510001, VVtaMN: 100.123456, VImpMN: 118.999999 })];
    const adicionales = [makeAdicional({ ValVta: 0.009, ValImp: 0.004 })];

    const filas = aplicarAjusteAdicionales(main, adicionales);

    // Start rounded (round2(100.123456) = 100.12), subtract raw, round at write.
    expect(filas[0].venta).toBe(100.11); // round2(100.12 - 0.009)
    expect(filas[0].importe).toBe(119); // round2(round2(118.999999) - 0.004)
  });
});

describe('consolidarPorDestino', () => {
  it('builds per-destino SubTotal / IGV 18% / Total matching the SIGLA totals table', () => {
    const main = [
      makeMainRow({ IdeTCh: 510001, VVtaMN: 1000, VImpMN: 1180 }),
      makeMainRow({ IdeTCh: 510011, DesTCh: 'ADICIONALES', VVtaMN: 500, VImpMN: 590 }),
      makeMainRow({
        CodDes: 102,
        DesDes: 'SEDE SUR',
        IdeTCh: 510008,
        DesTCh: 'PERIODICO',
        VVtaMN: 200,
        VImpMN: 236,
      }),
    ];
    const adicionales = [
      makeAdicional({ NomSer: 'ADI UNO', ValVta: 100, ValImp: 118 }),
      makeAdicional({ NomSer: 'ADI DOS', ValVta: 50, ValImp: 59 }),
    ];

    const totales = consolidarPorDestino(aplicarAjusteAdicionales(main, adicionales));

    expect(totales).toHaveLength(2);
    // SEDE NORTE: 850 + 450 + 100 + 50 = 1450 → IGV 261 → Total 1711.
    expect(totales[0]).toMatchObject({
      desDes: 'SEDE NORTE',
      subtotal: 1450,
      igv: 261,
      total: 1711,
    });
    // SEDE SUR: 200 → IGV 36 → Total 236.
    expect(totales[1]).toMatchObject({
      desDes: 'SEDE SUR',
      subtotal: 200,
      igv: 36,
      total: 236,
    });
  });

  it('excludes null-destino rows from the totals (SIGLA matches against the destino list)', () => {
    const filas = aplicarAjusteAdicionales(
      [makeMainRow({ CodDes: null, DesDes: '', VVtaMN: 300 })],
      [],
    );

    const totales = consolidarPorDestino(filas);

    expect(totales).toHaveLength(0);
  });

  it('rounds every total to two decimals', () => {
    const main = [
      makeMainRow({ VVtaMN: 100.129, IdeTCh: 510008, DesTCh: 'PERIODICO' }),
      makeMainRow({
        CodDes: 102,
        DesDes: 'SEDE SUR',
        IdeTCh: 510008,
        DesTCh: 'PERIODICO',
        VVtaMN: 200.456,
      }),
    ];

    const totales = consolidarPorDestino(aplicarAjusteAdicionales(main, []));

    expect(totales[0]).toMatchObject({ subtotal: 100.13, igv: 18.02, total: 118.15 });
    expect(totales[1]).toMatchObject({ subtotal: 200.46, igv: 36.08, total: 236.54 });
  });
});

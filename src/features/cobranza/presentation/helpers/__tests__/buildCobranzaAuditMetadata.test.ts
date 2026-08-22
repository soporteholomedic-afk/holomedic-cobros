/**
 * Tests for `buildCobranzaAuditMetadata(client)` (REQ-02, task 6.3/6.4).
 *
 * Spec R6 (metadata transport, decision D3): the cobranza send payload
 * carries `ruc`, `razonSocial`, `montoReclamado`, `moneda`,
 * `comprobantesCount` where:
 *  - `ruc`/`razonSocial` are trimmed;
 *  - `montoReclamado`/`moneda` reflect the demanded amount in the
 *    client's MAIN currency (highest saldo, tie → 'S/' — the SAME
 *    `selectMainCurrency` definition used by the interpolation flow,
 *    design §4.4 single source);
 *  - `montoReclamado` is the RAW number (not the formatted
 *    `montoTotal` string) so it feeds DECIMAL(18,2) directly;
 *  - `comprobantesCount` counts documents with saldo > 0.01;
 *  - an empty-debt client (no currencies) sends null moneda/monto
 *    (stored NULL server-side).
 *
 * Pure unit tests — no mocks needed (extract-before-mock rule).
 */
import { describe, expect, it } from 'vitest';

import { buildCobranzaAuditMetadata } from '../buildCobranzaAuditMetadata';
import type { ClienteGroup } from '../../../../../types';

function buildClient(overrides: Partial<ClienteGroup> = {}): ClienteGroup {
  return {
    clienteId: ' 20601234567 ',
    razonSocial: '  HOLOMEDIC S.A.C.  ',
    documentos: [
      {
        tipoDoc: 'FE',
        serie: 'F001',
        numero: '101',
        fechaDoc: '01/05/2026',
        fechaVen: '20/05/2026',
        cuenta: '121201',
        moneda: 'S/',
        debe: 1200,
        haber: 200,
        saldo: 1000, // pending → counted
      },
      {
        tipoDoc: 'BO',
        serie: 'B001',
        numero: '77',
        fechaDoc: '11/05/2026',
        fechaVen: '20/05/2026',
        cuenta: '121301',
        moneda: 'S/',
        debe: 400,
        haber: 400,
        saldo: 0, // settled → NOT counted
      },
      {
        tipoDoc: 'NC',
        serie: 'N001',
        numero: '9',
        fechaDoc: '12/05/2026',
        fechaVen: '20/05/2026',
        cuenta: '121301',
        moneda: 'S/',
        debe: 0.01,
        haber: 0,
        saldo: 0.01, // boundary: NOT > 0.01 → NOT counted
      },
    ],
    saldosPorMoneda: {
      'S/': { debe: 1600.01, haber: 600, saldo: 1000.01 },
      $: { debe: 0, haber: 300, saldo: 500 },
    },
    tieneDeuda: true,
    tieneCredito: false,
    tieneSaldoFavor: false,
    saldoPrincipalTexto: 'Debe S/ 1,000.01',
    facturasCredito: 0,
    facturasAFavor: 1,
    facturasVencidas: 2,
    ...overrides,
  };
}

describe('buildCobranzaAuditMetadata', () => {
  it('maps the client to trimmed audit metadata with the raw main-currency saldo (R6.1)', () => {
    const meta = buildCobranzaAuditMetadata(buildClient());

    // S/ (1000.01) > $ (500) → PEN is the main currency.
    expect(meta).toEqual({
      ruc: '20601234567',
      razonSocial: 'HOLOMEDIC S.A.C.',
      moneda: 'S/',
      // RAW number, NOT the formatted 'S/ 1,000.01' string.
      montoReclamado: 1000.01,
      // Only F001-101 counts: saldo 0 and the 0.01 boundary are excluded.
      comprobantesCount: 1,
    });
  });

  it('selects USD as the main currency when it holds the largest saldo', () => {
    const meta = buildCobranzaAuditMetadata(
      buildClient({
        saldosPorMoneda: {
          'S/': { debe: 100, haber: 0, saldo: 100 },
          $: { debe: 900, haber: 0, saldo: 900 },
        },
      }),
    );

    expect(meta.moneda).toBe('$');
    expect(meta.montoReclamado).toBe(900);
  });

  it('breaks a saldo tie in favor of S/ via the shared selectMainCurrency definition', () => {
    const meta = buildCobranzaAuditMetadata(
      buildClient({
        saldosPorMoneda: {
          $: { debe: 500, haber: 0, saldo: 500 },
          'S/': { debe: 500, haber: 0, saldo: 500 },
        },
      }),
    );

    expect(meta.moneda).toBe('S/');
    expect(meta.montoReclamado).toBe(500);
  });

  it('sends null moneda/montoReclamado for an empty-debt client (stored NULL)', () => {
    const meta = buildCobranzaAuditMetadata(
      buildClient({ documentos: [], saldosPorMoneda: {} }),
    );

    expect(meta.moneda).toBeNull();
    expect(meta.montoReclamado).toBeNull();
    expect(meta.ruc).toBe('20601234567');
    expect(meta.comprobantesCount).toBe(0);
  });

  it('counts every document with saldo > 0.01, not just the main currency leg', () => {
    const meta = buildCobranzaAuditMetadata(
      buildClient({
        documentos: [
          {
            tipoDoc: 'FE',
            serie: 'F001',
            numero: '101',
            fechaDoc: '01/05/2026',
            fechaVen: '20/05/2026',
            cuenta: '121201',
            moneda: 'S/',
            debe: 100,
            haber: 0,
            saldo: 100,
          },
          {
            tipoDoc: 'FE',
            serie: 'F001',
            numero: '102',
            fechaDoc: '02/05/2026',
            fechaVen: '20/05/2026',
            cuenta: '121201',
            moneda: '$',
            debe: 200,
            haber: 0,
            saldo: 200,
          },
          {
            tipoDoc: 'FE',
            serie: 'F001',
            numero: '103',
            fechaDoc: '03/05/2026',
            fechaVen: '20/05/2026',
            cuenta: '121201',
            moneda: '$',
            debe: 50,
            haber: 50,
            saldo: 0,
          },
        ],
      }),
    );

    expect(meta.comprobantesCount).toBe(2);
  });
});

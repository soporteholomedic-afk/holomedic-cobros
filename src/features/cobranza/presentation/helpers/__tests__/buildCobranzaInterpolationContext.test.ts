/**
 * Tests for `buildCobranzaInterpolationContext(client, firmaHtml)`
 * (REQ-01 T2.2/T4.4).
 *
 * Spec: REQ-01-DIR-06 — summary tokens use the MAIN currency (largest
 * outstanding saldo, tie → PEN per design D9) while the
 * `documentosPendientes` rows carry each document's own currency.
 * All numeric fields are PRE-FORMATTED strings (resolvers stay dumb).
 *
 * Pure unit tests — the only nondeterminism is `new Date()` (today +
 * overdue-day computation), pinned with fake timers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildCobranzaInterpolationContext } from '../buildCobranzaInterpolationContext';
import type { ClienteGroup } from '../../../../../types';
import { buildCuentasBancariasHtml } from '../../../../../utils/paymentInfo';

/** Fixed "now": 2026-06-15T12:00:00 local — midday avoids TZ day-flips. */
const FAKE_NOW = new Date(2026, 5, 15, 12, 0, 0);

function buildClient(overrides: Partial<ClienteGroup> = {}): ClienteGroup {
  return {
    clienteId: '20601234567',
    razonSocial: 'HOLOMEDIC S.A.C.',
    documentos: [
      {
        tipoDoc: 'FE',
        serie: 'F001',
        numero: '101',
        fechaDoc: '01/05/2026',
        fechaVen: '20/05/2026', // 26 days overdue at FAKE_NOW
        cuenta: '121201',
        moneda: 'S/',
        debe: 1200,
        haber: 200,
        saldo: 1000,
      },
      {
        tipoDoc: 'FE',
        serie: 'F001',
        numero: '102',
        fechaDoc: '10/05/2026',
        fechaVen: '10/06/2026', // 5 days overdue at FAKE_NOW
        cuenta: '121201',
        moneda: '$',
        debe: 0,
        haber: 300,
        saldo: 500,
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
        saldo: 0, // settled — excluded from rows and overdue math
      },
    ],
    saldosPorMoneda: {
      'S/': { debe: 1600, haber: 600, saldo: 1000 },
      $: { debe: 0, haber: 300, saldo: 500 },
    },
    tieneDeuda: true,
    tieneCredito: false,
    tieneSaldoFavor: false,
    saldoPrincipalTexto: 'Debe S/ 1,000.00',
    facturasCredito: 0,
    facturasAFavor: 1,
    facturasVencidas: 2,
    ...overrides,
  };
}

describe('buildCobranzaInterpolationContext', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FAKE_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('maps identity fields: companyName, ruc, area, firma and empty patient fields', () => {
    const ctx = buildCobranzaInterpolationContext(buildClient(), '<p>FIRMA</p>');

    expect(ctx.companyName).toBe('HOLOMEDIC S.A.C.');
    expect(ctx.ruc).toBe('20601234567');
    expect(ctx.area).toBe('cobranza');
    expect(ctx.firma).toBe('<p>FIRMA</p>');
    expect(ctx.patientNames).toEqual([]);
    expect(ctx.fileNames).toEqual([]);
    expect(ctx.patients).toEqual([]);
    expect(ctx.files).toEqual([]);
    expect(ctx.destino).toBe('');
  });

  it('selects the main currency as the max-saldo currency and formats montoTotal (D9)', () => {
    const ctx = buildCobranzaInterpolationContext(buildClient(), '');

    // S/ (1000) > $ (500) → PEN wins.
    expect(ctx.moneda).toBe('S/');
    expect(ctx.montoTotal).toBe('S/ 1,000.00');
  });

  it('selects USD when it holds the largest saldo', () => {
    const client = buildClient({
      saldosPorMoneda: {
        'S/': { debe: 100, haber: 0, saldo: 100 },
        $: { debe: 900, haber: 0, saldo: 900 },
      },
    });

    const ctx = buildCobranzaInterpolationContext(client, '');

    expect(ctx.moneda).toBe('$');
    expect(ctx.montoTotal).toBe('$ 900.00');
  });

  it('breaks a saldo tie in favor of PEN (S/)', () => {
    const client = buildClient({
      saldosPorMoneda: {
        $: { debe: 500, haber: 0, saldo: 500 },
        'S/': { debe: 500, haber: 0, saldo: 500 },
      },
    });

    const ctx = buildCobranzaInterpolationContext(client, '');

    expect(ctx.moneda).toBe('S/');
    expect(ctx.montoTotal).toBe('S/ 500.00');
  });

  it('renders moneda/montoTotal as empty strings when there are no currencies', () => {
    const client = buildClient({
      documentos: [],
      saldosPorMoneda: {},
    });

    const ctx = buildCobranzaInterpolationContext(client, '');

    expect(ctx.moneda).toBe('');
    expect(ctx.montoTotal).toBe('');
  });

  it('computes diasVencidos as the max overdue days over pending docs', () => {
    const ctx = buildCobranzaInterpolationContext(buildClient(), '');

    // F001-101 → 26 days at FAKE_NOW (2026-06-15); F001-102 → 5 days.
    expect(ctx.diasVencidos).toBe('26');
  });

  it('reports diasVencidos "0" when nothing is past due', () => {
    const client = buildClient({
      documentos: [
        {
          tipoDoc: 'FE',
          serie: 'F001',
          numero: '300',
          fechaDoc: '10/06/2026',
          fechaVen: '10/08/2026', // future
          cuenta: '121201',
          moneda: 'S/',
          debe: 100,
          haber: 0,
          saldo: 100,
        },
      ],
      saldosPorMoneda: { 'S/': { debe: 100, haber: 0, saldo: 100 } },
    });

    const ctx = buildCobranzaInterpolationContext(client, '');

    expect(ctx.diasVencidos).toBe('0');
  });

  it('builds documentosPendientes rows for ALL docs with saldo > 0.01, each with its own currency', () => {
    const ctx = buildCobranzaInterpolationContext(buildClient(), '');

    expect(ctx.documentosPendientes).toEqual([
      {
        fecha: '20/05/2026',
        factura: 'FE F001-101',
        monto: 'S/ 1,200.00', // debe > 0 → debe
        saldo: 'S/ 1,000.00',
      },
      {
        fecha: '10/06/2026',
        factura: 'FE F001-102',
        monto: '$ 300.00', // debe = 0 → haber
        saldo: '$ 500.00',
      },
      // B001-77 (saldo 0) is excluded.
    ]);
  });

  it('sources cuentasBancariasHtml from buildCuentasBancariasHtml (D4 single source)', () => {
    const ctx = buildCobranzaInterpolationContext(buildClient(), '');

    expect(ctx.cuentasBancariasHtml).toBe(buildCuentasBancariasHtml());
    expect(ctx.cuentasBancariasHtml).toContain('DATOS PARA EL PAGO');
  });

  it('formats today in es-PE long form', () => {
    const ctx = buildCobranzaInterpolationContext(buildClient(), '');

    expect(ctx.today).toBe('15 de junio de 2026');
  });
});

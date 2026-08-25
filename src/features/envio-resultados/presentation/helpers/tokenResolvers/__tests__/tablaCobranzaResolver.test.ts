import { describe, it, expect } from 'vitest';
import { tablaCobranzaResolver } from '../tablaCobranzaResolver';
import type { InterpolationContext, TablaCobranzaRow } from '../types';
import { GOLDEN_CTX } from '../../__tests__/goldenFixtures';

/**
 * token-tabla-cobranza (REQ-TC-02/03/07) — the `tabla-cobranza` table
 * sub-resolver, modeled on `documentosPendientesResolver`. Renders an
 * inline-styled HTML `<table>` with ONLY the selected columns; rows come
 * pre-formatted from `ctx.tablaCobranza` (amounts carry their own row
 * currency, zeros render as '0.00'). Returns `''` on empty cols/rows so
 * the orchestrator removes the containing block.
 *
 * D9: every rendered column carries an explicit inline `width:X%` on its
 * `<th>` (never on `<td>`), renormalized per selection so any subset sums
 * to exactly 100% (last column absorbs the rounding residual). Unknown
 * columns join via an even-share base width — mirroring the
 * `COLUMN_LABELS[c] ?? c` precedent, unknown columns are NOT dropped.
 */

function cobranzaCtx(rows: TablaCobranzaRow[]): InterpolationContext {
  return {
    ...GOLDEN_CTX,
    area: 'cobranza',
    tablaCobranza: rows,
  };
}

const ROWS: TablaCobranzaRow[] = [
  {
    cliente: '20601234567',
    razonSocial: 'COMERCIAL ABC S.A.C.',
    tipoDoc: 'FE',
    serie: 'F001',
    numero: '101',
    fechaDoc: '01/11/2025',
    fechaVen: '15/11/2025',
    moneda: 'S/',
    debe: 'S/ 1,200.00',
    haber: 'S/ 0.00',
    saldo: 'S/ 1,000.00',
  },
  {
    cliente: '20601234567',
    razonSocial: 'COMERCIAL ABC S.A.C.',
    tipoDoc: 'BO',
    serie: 'B001',
    numero: '50',
    fechaDoc: '20/11/2025',
    fechaVen: '02/12/2025',
    moneda: 'S/',
    debe: 'S/ 450.00',
    haber: 'S/ 0.00',
    saldo: 'S/ 250.00',
  },
  {
    cliente: '20987654321',
    razonSocial: 'SERVICIOS XYZ S.A.C.',
    tipoDoc: 'FE',
    serie: 'F002',
    numero: '77',
    fechaDoc: '05/12/2025',
    fechaVen: '20/12/2025',
    moneda: 'US$',
    debe: 'US$ 60.00',
    haber: 'US$ 0.00',
    saldo: 'US$ 50.00',
  },
];

const ALL_COLS = [
  'cliente',
  'razonSocial',
  'tipoDoc',
  'serie',
  'numero',
  'fechaDoc',
  'fechaVen',
  'moneda',
  'debe',
  'haber',
  'saldo',
];

const ALL_LABELS = [
  'Cliente',
  'Razón Social',
  'Tipo Doc',
  'Serie',
  'Numero',
  'Fec. Doc.',
  'Fec. Ven',
  'Mon',
  'Debe',
  'Haber',
  'Saldo',
];

/** Header labels of a rendered table, in render order. */
function thLabels(html: string): string[] {
  const thead = html.match(/<thead>([\s\S]*)<\/thead>/)?.[1] ?? '';
  return [...thead.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((m) => m[1] ?? '');
}

/** Header width percentages of a rendered table, in render order. */
function thWidths(html: string): number[] {
  const thead = html.match(/<thead>([\s\S]*)<\/thead>/)?.[1] ?? '';
  return [...thead.matchAll(/width:([\d.]+)%/g)].map((m) => parseFloat(m[1] ?? '0'));
}

describe('tablaCobranzaResolver', () => {
  it('is named tabla-cobranza', () => {
    expect(tablaCobranzaResolver.name).toBe('tabla-cobranza');
  });

  it('renders a full HTML table: 11 headers in canonical order, one row per document', () => {
    const out = tablaCobranzaResolver.resolve(ALL_COLS, cobranzaCtx(ROWS));
    expect(out).toMatch(/^<table[\s>]/);
    expect(thLabels(out)).toEqual(ALL_LABELS);
    // Exactly one <tr> per document INSIDE the tbody (plus 1 header <tr>).
    const tbody = out.match(/<tbody>([\s\S]*)<\/tbody>/)?.[1] ?? '';
    expect(tbody.match(/<tr>/g)?.length).toBe(3);
  });

  it('renders a full HTML table with ONLY the selected columns', () => {
    const out = tablaCobranzaResolver.resolve(['cliente', 'saldo'], cobranzaCtx(ROWS));
    expect(thLabels(out)).toEqual(['Cliente', 'Saldo']);
    // NOT selected — their labels and cell values must NOT appear.
    expect(out).not.toContain('Razón Social');
    expect(out).not.toContain('Tipo Doc');
    expect(out).not.toContain('Fec. Doc.');
    expect(out).not.toContain('COMERCIAL ABC S.A.C.');
    expect(out).not.toContain('FE');
    expect(out).not.toContain('S/ 1,200.00');
  });

  it('preserves the column selection ORDER (first selected = first column)', () => {
    const out = tablaCobranzaResolver.resolve(['saldo', 'cliente'], cobranzaCtx(ROWS));
    expect(thLabels(out)).toEqual(['Saldo', 'Cliente']);
  });

  it('renders ALL pending rows, each with its own per-row currency (multi-currency)', () => {
    const out = tablaCobranzaResolver.resolve(ALL_COLS, cobranzaCtx(ROWS));
    // Per-row currency strings are emitted verbatim (pre-formatted upstream).
    expect(out).toContain('S/ 1,000.00');
    expect(out).toContain('S/ 250.00');
    expect(out).toContain('US$ 50.00');
    // Zeros render as '0.00', never blank.
    expect(out).toContain('S/ 0.00');
    // Dates are verbatim DD/MM/YYYY.
    expect(out).toContain('01/11/2025');
    expect(out).toContain('20/12/2025');
  });

  it('returns "" when ctx.tablaCobranza is undefined (consolidados-shaped ctx)', () => {
    const ctx: InterpolationContext = { ...GOLDEN_CTX }; // no cobranza fields
    expect(tablaCobranzaResolver.resolve(ALL_COLS, ctx)).toBe('');
  });

  it('returns "" when the rows array is empty (explicit empty — signals block removal)', () => {
    expect(tablaCobranzaResolver.resolve(ALL_COLS, cobranzaCtx([]))).toBe('');
  });

  it('returns "" when the column selection is empty', () => {
    expect(tablaCobranzaResolver.resolve([], cobranzaCtx(ROWS))).toBe('');
  });

  it('HTML-escapes cell content (injection safety)', () => {
    const evil: TablaCobranzaRow[] = [
      { ...ROWS[0]!, razonSocial: '<script>alert(1)</script>', debe: 'S/ 1 & 2' },
    ];
    const out = tablaCobranzaResolver.resolve(['razonSocial', 'debe'], cobranzaCtx(evil));
    expect(out).toContain('&lt;script&gt;');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&amp;');
  });

  it('falls back to the raw key for a column outside COLUMN_LABELS (column NOT dropped)', () => {
    const out = tablaCobranzaResolver.resolve(['cliente', 'customCol'], cobranzaCtx(ROWS));
    expect(thLabels(out)).toEqual(['Cliente', 'customCol']);
    // Unknown col renders an empty cell, not a dropped column.
    expect(out).toContain('<td style="padding:4px 8px;"></td>');
    expect(out).toContain('20601234567');
  });

  // ---- D9: proportional column widths (REQ-TC-07) ----

  it('full 11-column render pins the approved width map on each th (canonical order)', () => {
    const out = tablaCobranzaResolver.resolve(ALL_COLS, cobranzaCtx(ROWS));
    expect(thWidths(out)).toEqual([9, 18, 8, 7, 8, 9, 9, 5, 9, 9, 9]);
    // The widths are inline on the th style, appended to the existing convention.
    expect(out).toContain('<th style="text-align:left;padding:4px 8px;width:18%;">Razón Social</th>');
    expect(out).toContain('<th style="text-align:left;padding:4px 8px;width:5%;">Mon</th>');
  });

  it('D9 subset cliente,razonSocial,saldo renormalizes to 25/50/25', () => {
    const out = tablaCobranzaResolver.resolve(['cliente', 'razonSocial', 'saldo'], cobranzaCtx(ROWS));
    expect(thWidths(out)).toEqual([25, 50, 25]);
  });

  it('D9 subset debe,haber,saldo renormalizes to 33.33/33.33/33.34 — last absorbs residual, Σ=100', () => {
    const out = tablaCobranzaResolver.resolve(['debe', 'haber', 'saldo'], cobranzaCtx(ROWS));
    const widths = thWidths(out);
    expect(widths).toEqual([33.33, 33.33, 33.34]);
    const sum = widths.reduce((s, w) => s + w, 0);
    expect(sum).toBe(100);
  });

  it('D9 spec scenario: debe,serie → 56.25/43.75; single column saldo → 100', () => {
    const duo = thWidths(tablaCobranzaResolver.resolve(['debe', 'serie'], cobranzaCtx(ROWS)));
    expect(duo).toEqual([56.25, 43.75]);
    expect(duo.reduce((s, w) => s + w, 0)).toBe(100);

    const single = thWidths(tablaCobranzaResolver.resolve(['saldo'], cobranzaCtx(ROWS)));
    expect(single).toEqual([100]);
  });

  it('D9 unknown key joins the renormalization via even-share base and widths still sum to 100', () => {
    const out = tablaCobranzaResolver.resolve(['cliente', 'noExiste'], cobranzaCtx(ROWS));
    const widths = thWidths(out);
    // Bases: cliente 9, noExiste 100/2 = 50 → cliente ≈ 15.25, noExiste ≈ 84.75.
    expect(widths[0]).toBe(15.25);
    expect(widths[1]).toBe(84.75);
    expect(widths.reduce((s, w) => s + w, 0)).toBe(100);
    // The unknown column header falls back to the raw key.
    expect(thLabels(out)).toEqual(['Cliente', 'noExiste']);
  });

  it('D9: no width appears on any td — body cells keep the plain padding style', () => {
    const out = tablaCobranzaResolver.resolve(ALL_COLS, cobranzaCtx(ROWS));
    const tbody = out.match(/<tbody>([\s\S]*)<\/tbody>/)?.[1] ?? '';
    expect(tbody).not.toContain('width:');
    expect(tbody).toContain('<td style="padding:4px 8px;">20601234567</td>');
  });
});

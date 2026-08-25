import { describe, it, expect } from 'vitest';
import { tablaCobranzaResolver } from '../tablaCobranzaResolver';
import type { InterpolationContext, TablaCobranzaRow } from '../types';
import { GOLDEN_CTX } from '../../__tests__/goldenFixtures';
import { interpolate } from '../../interpolate';
import { buildTokenResolverRegistry } from '../buildTokenResolverRegistry';

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
 *
 * Styling: every `<th>` renders the blue header (background #1e40af,
 * white text) and every cell (`<th>` + `<td>`) carries the light-blue
 * `1px solid #bfdbfe` border — all inline (email/Outlook-safe), data
 * rows keep no background (white).
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
    diasVencidos: '30',
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
    diasVencidos: '13',
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
    diasVencidos: '0',
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
  'diasVencidos',
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
  'Días Venc.',
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

  it('renders a full HTML table: 12 headers in canonical order, one row per document', () => {
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
    expect(out).toContain('<td style="padding:4px 8px;border:1px solid #bfdbfe;"></td>');
    expect(out).toContain('20601234567');
  });

  // ---- D9: proportional column widths (REQ-TC-07, v2 12-column map) ----

  it('full 12-column render pins the approved width map on each th (canonical order)', () => {
    const out = tablaCobranzaResolver.resolve(ALL_COLS, cobranzaCtx(ROWS));
    expect(thWidths(out)).toEqual([9, 16, 8, 7, 8, 8, 8, 5, 8, 8, 8, 7]);
    // The widths are inline on the th style, appended to the existing convention.
    expect(out).toContain(
      '<th style="text-align:left;padding:4px 8px;width:16%;background:#1e40af;color:white;border:1px solid #bfdbfe;">Razón Social</th>',
    );
    expect(out).toContain(
      '<th style="text-align:left;padding:4px 8px;width:5%;background:#1e40af;color:white;border:1px solid #bfdbfe;">Mon</th>',
    );
    expect(out).toContain(
      '<th style="text-align:left;padding:4px 8px;width:7%;background:#1e40af;color:white;border:1px solid #bfdbfe;">Días Venc.</th>',
    );
  });

  it('D9 subset cliente,razonSocial,saldo renormalizes to 27.27/48.48/24.25 — last absorbs residual, Σ=100', () => {
    const out = tablaCobranzaResolver.resolve(['cliente', 'razonSocial', 'saldo'], cobranzaCtx(ROWS));
    const widths = thWidths(out);
    // Bases 9+16+8=33 → 27.27/48.48/24.24, last absorbs the 0.01 residual.
    expect(widths).toEqual([27.27, 48.48, 24.25]);
    expect(widths.reduce((s, w) => s + w, 0)).toBe(100);
  });

  it('D9 subset debe,haber,saldo renormalizes to 33.33/33.33/33.34 — last absorbs residual, Σ=100', () => {
    const out = tablaCobranzaResolver.resolve(['debe', 'haber', 'saldo'], cobranzaCtx(ROWS));
    const widths = thWidths(out);
    expect(widths).toEqual([33.33, 33.33, 33.34]);
    const sum = widths.reduce((s, w) => s + w, 0);
    expect(sum).toBe(100);
  });

  it('D9 spec scenario: debe,serie → 53.33/46.67; single column saldo → 100', () => {
    const duo = thWidths(tablaCobranzaResolver.resolve(['debe', 'serie'], cobranzaCtx(ROWS)));
    expect(duo).toEqual([53.33, 46.67]);
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

  it('D9: no width appears on any td — body cells keep the plain padding+border style', () => {
    const out = tablaCobranzaResolver.resolve(ALL_COLS, cobranzaCtx(ROWS));
    const tbody = out.match(/<tbody>([\s\S]*)<\/tbody>/)?.[1] ?? '';
    expect(tbody).not.toContain('width:');
    expect(tbody).toContain('<td style="padding:4px 8px;border:1px solid #bfdbfe;">20601234567</td>');
  });

  // ---- Blue header + borders (inline, email/Outlook-safe) ----

  it('styles every th with the blue background, white text and light-blue border', () => {
    const out = tablaCobranzaResolver.resolve(ALL_COLS, cobranzaCtx(ROWS));
    const thStyles = [...out.matchAll(/<th style="([^"]*)"/g)].map((m) => m[1] ?? '');
    expect(thStyles).toHaveLength(12);
    for (const style of thStyles) {
      expect(style).toContain('background:#1e40af');
      expect(style).toContain('color:white');
      expect(style).toContain('border:1px solid #bfdbfe');
    }
  });

  it('styles every td with the light-blue border but NO background (data rows stay white)', () => {
    const out = tablaCobranzaResolver.resolve(ALL_COLS, cobranzaCtx(ROWS));
    const tdStyles = [...out.matchAll(/<td style="([^"]*)"/g)].map((m) => m[1] ?? '');
    expect(tdStyles).toHaveLength(36); // 12 columns × 3 rows
    for (const style of tdStyles) {
      expect(style).toContain('border:1px solid #bfdbfe');
      expect(style).not.toContain('background-color');
    }
  });

  it('renders the 12th column "Días Venc." with each row’s overdue-days value', () => {
    const out = tablaCobranzaResolver.resolve(ALL_COLS, cobranzaCtx(ROWS));
    expect(thLabels(out)).toContain('Días Venc.');
    expect([...out.matchAll(/<th[\s>]/g)]).toHaveLength(12);
    // diasVencidos cells render the pre-formatted row values verbatim.
    expect(out).toContain('>30</td>');
    expect(out).toContain('>13</td>');
    expect(out).toContain('>0</td>');
  });

  it('header styling SURVIVES the full interpolate() pipeline (color-stripper regression)', () => {
    // interpolate() strips `color:#hex` inline declarations (theme-aware
    // rendering). A `background-color:#1e40af` would be mangled to a bogus
    // `background-` property and `color:#ffffff` removed entirely — this
    // test pins the stripper-safe syntax (`background:` shorthand, named
    // `white`) end-to-end so the blue header renders in the final email.
    const registry = buildTokenResolverRegistry('cobranza');
    const out = interpolate(
      '<p>{{tabla:tabla-cobranza:cliente,saldo}}</p>',
      'Asunto',
      cobranzaCtx(ROWS),
      registry,
    );
    expect(out.html).toContain('background:#1e40af');
    expect(out.html).toContain('color:white');
    expect(out.html).toContain('border:1px solid #bfdbfe');
    // The mangled forms must NOT appear in the final HTML.
    expect(out.html).not.toContain('background-border');
    expect(out.html).not.toContain('background-color');
  });
});

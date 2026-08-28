import { describe, expect, it } from 'vitest';

import { tablaValoracionesResolver } from '../tablaValoracionesResolver';
import type { InterpolationContext } from '../types';
import { GOLDEN_CTX } from '../../__tests__/goldenFixtures';

/**
 * `tablaValoraciones` resolver unit tests (REQ-03 M-R2) — modeled on
 * `tablaCobranzaResolver.test.ts` (the cobranza D12 precedent).
 */
const CTX: InterpolationContext = {
  ...GOLDEN_CTX,
  tablaValoraciones: [
    { empresa: 'EMPRESA DEMO S.A.C.', registros: '12', subtotal: 'S/ 10,169.49', igv: 'S/ 1,830.51', total: 'S/ 12,000.00' },
    { empresa: 'COMERCIAL ABC S.A.C.', registros: '3', subtotal: 'S/ 1,694.92', igv: 'S/ 305.08', total: 'S/ 2,000.00' },
  ],
};

const TODAS = ['empresa', 'registros', 'subtotal', 'igv', 'total'];

describe('tablaValoracionesResolver', () => {
  it('renders the full 5-column table with headers and every row value', () => {
    const html = tablaValoracionesResolver.resolve(TODAS, CTX);
    expect(html).toMatch(/^<table style="border-collapse:collapse;width:100%;">/);
    for (const header of ['Empresa', 'Registros', 'Subtotal', 'IGV', 'Total']) {
      expect(html).toContain(`>${header}</th>`);
    }
    expect(html).toContain('EMPRESA DEMO S.A.C.');
    expect(html).toContain('COMERCIAL ABC S.A.C.');
    expect(html).toContain('S/ 12,000.00');
    expect(html).toContain('>12</td>');
    // Two data rows.
    expect(html.match(/<tr>/g)?.length).toBe(2 + 1); // + header row
  });

  it('renders ONLY the selected columns (subset keeps header/data parity)', () => {
    const html = tablaValoracionesResolver.resolve(['empresa', 'total'], CTX);
    expect(html).toContain('>Empresa</th>');
    expect(html).toContain('>Total</th>');
    expect(html).not.toContain('>Subtotal</th>');
    expect(html).not.toContain('>Registros</th>');
    expect(html).not.toContain('S/ 10,169.49');
    expect(html).toContain('S/ 12,000.00');
  });

  it('emits D9 widths summing to exactly 100 on the header cells only', () => {
    const html = tablaValoracionesResolver.resolve(['empresa', 'registros', 'total'], CTX);
    // `width:X%;background` matches only <th> styles — the table wrapper's
    // own `width:100%` (no background after it) is excluded.
    const widths = [...html.matchAll(/width:([\d.]+)%;background/g)].map((m) => parseFloat(m[1]!));
    expect(widths).toHaveLength(3);
    const sum = widths.reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 100)).toBeLessThan(0.01);
    // Full selection is the identity case (map sums to 100).
    const full = tablaValoracionesResolver.resolve(TODAS, CTX);
    const fullWidths = [...full.matchAll(/width:([\d.]+)%;background/g)].map((m) => parseFloat(m[1]!));
    expect(fullWidths).toEqual([40, 12, 16, 16, 16]);
  });

  it('uses Outlook-safe inline styling identical to tabla-cobranza', () => {
    const html = tablaValoracionesResolver.resolve(TODAS, CTX);
    expect(html).toContain('background:#1e40af;color:white');
    expect(html).toContain('border:1px solid #bfdbfe');
    expect(html).not.toContain('<style');
    expect(html).not.toContain('class=');
  });

  it('HTML-escapes untrusted row values', () => {
    const evil: InterpolationContext = {
      ...CTX,
      tablaValoraciones: [
        { empresa: '<script>x</script>', registros: '1', subtotal: 'a&b', igv: '<', total: '"' },
      ],
    };
    const html = tablaValoracionesResolver.resolve(TODAS, evil);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('a&amp;b');
  });

  it('returns empty string for an empty column selection', () => {
    expect(tablaValoracionesResolver.resolve([], CTX)).toBe('');
  });

  it('returns empty string when there are no rows (block removal)', () => {
    expect(tablaValoracionesResolver.resolve(TODAS, GOLDEN_CTX)).toBe('');
    expect(tablaValoracionesResolver.resolve(TODAS, { ...CTX, tablaValoraciones: [] })).toBe('');
  });
});

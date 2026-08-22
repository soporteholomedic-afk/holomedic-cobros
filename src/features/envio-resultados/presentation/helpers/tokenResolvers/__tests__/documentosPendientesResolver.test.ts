import { describe, it, expect } from 'vitest';
import { documentosPendientesResolver } from '../documentosPendientesResolver';
import type { InterpolationContext } from '../types';
import { GOLDEN_CTX } from '../../__tests__/goldenFixtures';

/**
 * T1b.4 (REQ-01 DIR-06) — the `documentosPendientes` table sub-resolver,
 * modeled on `documentosVencidosResolver`. Renders an inline-styled HTML
 * `<table>` with ONLY the selected columns; rows come pre-formatted from
 * `ctx.documentosPendientes` (the client formats each row's monto/saldo
 * WITH its own currency — multi-currency per row). Returns `''` on empty
 * cols/rows so the orchestrator removes the containing block.
 */

function cobranzaCtx(
  rows: InterpolationContext['documentosPendientes'],
): InterpolationContext {
  return {
    ...GOLDEN_CTX,
    area: 'cobranza',
    documentosPendientes: rows,
  };
}

const TWO_CURRENCY_ROWS = [
  { fecha: '15/11/2025', factura: 'FE F001-101', monto: 'S/ 1,200.00', saldo: 'S/ 1,000.00' },
  { fecha: '02/12/2025', factura: 'BO B001-50', monto: 'S/ 450.00', saldo: 'S/ 250.00' },
  { fecha: '20/12/2025', factura: 'FE F002-77', monto: 'USD 60.00', saldo: 'USD 50.00' },
];

describe('documentosPendientesResolver', () => {
  it('is named documentosPendientes', () => {
    expect(documentosPendientesResolver.name).toBe('documentosPendientes');
  });

  it('renders a full HTML table with ONLY the selected columns', () => {
    const out = documentosPendientesResolver.resolve(
      ['fecha', 'saldo'],
      cobranzaCtx(TWO_CURRENCY_ROWS),
    );
    expect(out).toMatch(/^<table[\s>]/);
    // Selected column labels render as headers.
    expect(out).toContain('Fecha');
    expect(out).toContain('Saldo');
    // NOT selected — their labels and cell values must NOT appear.
    expect(out).not.toContain('>Factura<');
    expect(out).not.toContain('Factura');
    expect(out).not.toContain('Monto');
    expect(out).not.toContain('FE F001-101');
    expect(out).not.toContain('S/ 1,200.00');
  });

  it('preserves the column selection ORDER (first selected = first column)', () => {
    const out = documentosPendientesResolver.resolve(
      ['saldo', 'fecha'],
      cobranzaCtx(TWO_CURRENCY_ROWS),
    );
    const sIdx = out.indexOf('Saldo');
    const fIdx = out.indexOf('Fecha');
    expect(sIdx).toBeGreaterThanOrEqual(0);
    expect(fIdx).toBeGreaterThanOrEqual(0);
    expect(sIdx).toBeLessThan(fIdx);
  });

  it('renders ALL pending rows, each with its own per-row currency (multi-currency)', () => {
    const out = documentosPendientesResolver.resolve(
      ['fecha', 'factura', 'monto', 'saldo'],
      cobranzaCtx(TWO_CURRENCY_ROWS),
    );
    // Every row appears.
    expect(out).toContain('FE F001-101');
    expect(out).toContain('BO B001-50');
    expect(out).toContain('FE F002-77');
    // Per-row currency strings are emitted verbatim (pre-formatted upstream).
    expect(out).toContain('S/ 1,000.00');
    expect(out).toContain('S/ 250.00');
    expect(out).toContain('USD 50.00');
    // Exactly one <tr> per document INSIDE the tbody (plus 1 header <tr>).
    const tbody = out.match(/<tbody>([\s\S]*)<\/tbody>/)?.[1] ?? '';
    expect(tbody.match(/<tr>/g)?.length).toBe(3);
  });

  it('uses the canonical column labels Fecha/Factura/Monto/Saldo', () => {
    const out = documentosPendientesResolver.resolve(
      ['fecha', 'factura', 'monto', 'saldo'],
      cobranzaCtx(TWO_CURRENCY_ROWS),
    );
    expect(out).toContain('>Fecha</th>');
    expect(out).toContain('>Factura</th>');
    expect(out).toContain('>Monto</th>');
    expect(out).toContain('>Saldo</th>');
  });

  it('returns "" when ctx.documentosPendientes is undefined (consolidados-shaped ctx)', () => {
    const ctx: InterpolationContext = { ...GOLDEN_CTX }; // no cobranza fields
    expect(documentosPendientesResolver.resolve(['fecha', 'saldo'], ctx)).toBe('');
  });

  it('returns "" when the rows array is empty (explicit empty — signals block removal)', () => {
    expect(
      documentosPendientesResolver.resolve(['fecha', 'saldo'], cobranzaCtx([])),
    ).toBe('');
  });

  it('returns "" when the column selection is empty', () => {
    expect(
      documentosPendientesResolver.resolve([], cobranzaCtx(TWO_CURRENCY_ROWS)),
    ).toBe('');
  });

  it('HTML-escapes cell content (injection safety)', () => {
    const evil = [
      {
        fecha: '15/11/2025',
        factura: '<script>alert(1)</script>',
        monto: 'S/ 1,200.00',
        saldo: 'S/ 1,000.00',
      },
    ];
    const out = documentosPendientesResolver.resolve(
      ['factura'],
      cobranzaCtx(evil),
    );
    expect(out).toContain('&lt;script&gt;');
    expect(out).not.toContain('<script>');
  });

  it('falls back to the raw key for a column outside COLUMN_LABELS', () => {
    const ctx = cobranzaCtx([
      { fecha: '15/11/2025', factura: 'FE F001-101', monto: 'S/ 1,200.00', saldo: 'S/ 1,000.00' },
    ]);
    // Known keys render their canonical labels.
    expect(documentosPendientesResolver.resolve(['fecha', 'factura'], ctx)).toContain('Factura');
    // An unregistered key falls back to the key itself (header + empty cell).
    const fallback = documentosPendientesResolver.resolve(['fecha', 'customCol'], ctx);
    expect(fallback).toContain('customCol');
    expect(fallback).toContain('Fecha');
  });
});

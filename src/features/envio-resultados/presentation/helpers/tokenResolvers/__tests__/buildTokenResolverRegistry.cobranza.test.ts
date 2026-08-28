import { describe, it, expect } from 'vitest';

import {
  buildTokenResolverRegistry,
  FIRMA_FALLBACK_HTML,
} from '../buildTokenResolverRegistry';
import type { InterpolationContext } from '../types';
import { GOLDEN_CTX } from '../../__tests__/goldenFixtures';

/**
 * T1b.5 (REQ-01 DIR-06, D3) — the cobranza branch of
 * `buildTokenResolverRegistry`. Token map:
 *   - empresa  → escapeHtml(ctx.companyName) / raw subject
 *   - ruc, montoTotal, moneda, diasVencidos → ctx.<field> ?? '' (html+subject)
 *   - cuentasBancarias → { html: ctx.cuentasBancariasHtml ?? '', subject: '' }
 *   - firma → verbatim or `<em>[Falta configurar firma]</em>`
 *   - fecha → ctx.today
 * Table map: documentosPendientes.
 *
 * Also pins the unknown-area regression: a registry for an unregistered
 * area resolves everything to '' (documented failure mode, unchanged).
 */

const COBRANZA_CTX: InterpolationContext = {
  ...GOLDEN_CTX,
  area: 'cobranza',
  ruc: '20123456789',
  montoTotal: 'S/ 12,345.67',
  moneda: 'PEN',
  diasVencidos: '45',
  cuentasBancariasHtml: '<div style="border-left: 3px solid #003366;">DATOS PARA EL PAGO</div>',
  documentosPendientes: [
    { fecha: '15/11/2025', factura: 'FE F001-101', monto: 'S/ 1,200.00', saldo: 'S/ 1,000.00' },
  ],
  tablaCobranza: [{ cliente: '20123456789', razonSocial: 'EMPRESA DEMO S.A.C.', tipoDoc: 'FE', serie: 'F001', numero: '101', fechaDoc: '01/11/2025', fechaVen: '15/11/2025', moneda: 'S/', debe: 'S/ 1,200.00', haber: 'S/ 0.00', saldo: 'S/ 1,000.00', diasVencidos: '45' }],
};

describe('buildTokenResolverRegistry — cobranza branch (T1b.5)', () => {
  it('resolves {{empresa}} HTML-escaped for the body and raw for the subject', () => {
    const registry = buildTokenResolverRegistry('cobranza');
    const ctx = { ...COBRANZA_CTX, companyName: 'A & B <Corp> S.A.C.' };
    const out = registry.resolveToken('empresa', ctx);
    expect(out.html).toBe('A &amp; B &lt;Corp&gt; S.A.C.');
    expect(out.subject).toBe('A & B <Corp> S.A.C.');
  });

  it('resolves {{ruc}}, {{montoTotal}}, {{moneda}}, {{diasVencidos}} from the ctx fields (html + subject)', () => {
    const registry = buildTokenResolverRegistry('cobranza');
    expect(registry.resolveToken('ruc', COBRANZA_CTX)).toEqual({
      html: '20123456789',
      subject: '20123456789',
    });
    expect(registry.resolveToken('montoTotal', COBRANZA_CTX)).toEqual({
      html: 'S/ 12,345.67',
      subject: 'S/ 12,345.67',
    });
    expect(registry.resolveToken('moneda', COBRANZA_CTX)).toEqual({
      html: 'PEN',
      subject: 'PEN',
    });
    expect(registry.resolveToken('diasVencidos', COBRANZA_CTX)).toEqual({
      html: '45',
      subject: '45',
    });
  });

  it('resolves the plain cobranza tokens to "" when the optional fields are missing (block removal)', () => {
    const registry = buildTokenResolverRegistry('cobranza');
    // Consolidados-shaped ctx: none of the cobranza fields exist.
    expect(registry.resolveToken('ruc', GOLDEN_CTX)).toEqual({ html: '', subject: '' });
    expect(registry.resolveToken('montoTotal', GOLDEN_CTX)).toEqual({ html: '', subject: '' });
    expect(registry.resolveToken('moneda', GOLDEN_CTX)).toEqual({ html: '', subject: '' });
    expect(registry.resolveToken('diasVencidos', GOLDEN_CTX)).toEqual({ html: '', subject: '' });
  });

  it('resolves {{cuentasBancarias}} to the bank HTML for the body and "" for the subject', () => {
    const registry = buildTokenResolverRegistry('cobranza');
    const out = registry.resolveToken('cuentasBancarias', COBRANZA_CTX);
    expect(out.html).toBe(COBRANZA_CTX.cuentasBancariasHtml);
    expect(out.subject).toBe('');
  });

  it('resolves {{cuentasBancarias}} to "" when ctx.cuentasBancariasHtml is missing', () => {
    const registry = buildTokenResolverRegistry('cobranza');
    expect(registry.resolveToken('cuentasBancarias', GOLDEN_CTX)).toEqual({
      html: '',
      subject: '',
    });
  });

  it('resolves {{fecha}} to ctx.today (both html and subject)', () => {
    const registry = buildTokenResolverRegistry('cobranza');
    expect(registry.resolveToken('fecha', COBRANZA_CTX)).toEqual({
      html: '15 de enero de 2026',
      subject: '15 de enero de 2026',
    });
  });

  it('resolves {{firma}} verbatim when non-empty (no placeholder)', () => {
    const registry = buildTokenResolverRegistry('cobranza');
    const out = registry.resolveToken('firma', COBRANZA_CTX);
    expect(out.html).toBe('<p>Dr. Pérez — Clínica Demo S.A.</p>');
    expect(out.subject).toBe('');
  });

  it('resolves {{firma}} to the visible placeholder when ctx.firma is empty', () => {
    const registry = buildTokenResolverRegistry('cobranza');
    const out = registry.resolveToken('firma', { ...COBRANZA_CTX, firma: '' });
    expect(out.html).toContain('[Falta configurar firma]');
    expect(out.html).not.toBe('');
  });

  it('exposes FIRMA_FALLBACK_HTML as the exact bytes every area branch emits for empty ctx.firma', () => {
    // Single source of truth pin: the composers' marker-replacement
    // recovery matches this exact byte sequence against the body. If
    // the emitted fallback ever drifts, recovery silently breaks —
    // this test is the tripwire.
    expect(FIRMA_FALLBACK_HTML).toBe('<em>[Falta configurar firma]</em>');
    const emptyFirmaCtx = { ...COBRANZA_CTX, firma: '' };
    expect(
      buildTokenResolverRegistry('consolidados').resolveToken('firma', emptyFirmaCtx).html,
    ).toBe(FIRMA_FALLBACK_HTML);
    expect(
      buildTokenResolverRegistry('cobranza').resolveToken('firma', emptyFirmaCtx).html,
    ).toBe(FIRMA_FALLBACK_HTML);
    expect(
      buildTokenResolverRegistry('valoraciones').resolveToken('firma', emptyFirmaCtx).html,
    ).toBe(FIRMA_FALLBACK_HTML);
  });

  it('passes a non-empty ctx.firma through verbatim in every area branch', () => {
    const firma = '<table><tr><td>Dra. Firma Guardada</td></tr></table>';
    const ctx = { ...COBRANZA_CTX, firma };
    expect(buildTokenResolverRegistry('consolidados').resolveToken('firma', ctx).html).toBe(firma);
    expect(buildTokenResolverRegistry('cobranza').resolveToken('firma', ctx).html).toBe(firma);
    expect(buildTokenResolverRegistry('valoraciones').resolveToken('firma', ctx).html).toBe(firma);
  });

  it('delegates {{tabla:documentosPendientes:cols}} to the table resolver', () => {
    const registry = buildTokenResolverRegistry('cobranza');
    const out = registry.resolveTable(
      'documentosPendientes',
      ['fecha', 'factura', 'monto', 'saldo'],
      COBRANZA_CTX,
    );
    expect(out.html).toMatch(/^<table[\s>]/);
    expect(out.html).toContain('FE F001-101');
    expect(out.html).toContain('S/ 1,000.00');
    expect(out.subject).toBe('');
  });

  it('delegates {{tabla:tabla-cobranza:cols}} to the table resolver (token-tabla-cobranza, REQ-TC-05)', () => {
    const registry = buildTokenResolverRegistry('cobranza');
    const cols = ['cliente', 'razonSocial', 'tipoDoc', 'serie', 'numero', 'fechaDoc', 'fechaVen', 'moneda', 'debe', 'haber', 'saldo'];
    const out = registry.resolveTable('tabla-cobranza', cols, COBRANZA_CTX);
    expect(out.html).toMatch(/^<table[\s>]/);
    expect(out.html).toContain('EMPRESA DEMO S.A.C.');
    expect(out.html).toContain('S/ 1,000.00');
    expect(out.subject).toBe('');
  });

  it('does NOT leak tabla-cobranza into the consolidados registry (REQ-TC-06)', () => {
    expect(buildTokenResolverRegistry('consolidados').resolveTable('tabla-cobranza', ['cliente'], COBRANZA_CTX)).toEqual({ html: '', subject: '' });
  });

  it('resolves unknown simple keys to "" within the cobranza registry', () => {
    const registry = buildTokenResolverRegistry('cobranza');
    expect(registry.resolveToken('listaPacientes', COBRANZA_CTX)).toEqual({
      html: '',
      subject: '',
    });
  });

  it('does NOT leak consolidados-only tokens into the cobranza registry', () => {
    const registry = buildTokenResolverRegistry('cobranza');
    // These exist in consolidados but must stay unknown for cobranza,
    // even though the superset ctx carries the data.
    expect(registry.resolveToken('dni', COBRANZA_CTX)).toEqual({ html: '', subject: '' });
    expect(registry.resolveToken('destino', COBRANZA_CTX)).toEqual({ html: '', subject: '' });
    expect(registry.resolveTable('documentosVencidos', ['fecha'], COBRANZA_CTX)).toEqual({
      html: '',
      subject: '',
    });
  });
});

describe('buildTokenResolverRegistry — unknown area regression pin (unchanged failure mode)', () => {
  it('resolves every token and table to "" for an unregistered area', () => {
    const registry = buildTokenResolverRegistry('no-such-area');
    expect(registry.resolveToken('empresa', COBRANZA_CTX)).toEqual({ html: '', subject: '' });
    expect(registry.resolveToken('ruc', COBRANZA_CTX)).toEqual({ html: '', subject: '' });
    expect(registry.resolveToken('firma', COBRANZA_CTX)).toEqual({ html: '', subject: '' });
    expect(
      registry.resolveTable('documentosPendientes', ['fecha'], COBRANZA_CTX),
    ).toEqual({ html: '', subject: '' });
  });
});

import { describe, it, expect } from 'vitest';

import { AREA_CONFIGS } from '../../../../../plantillas-editor/infrastructure/areaConfigRegistry';
import { buildTokenResolverRegistry } from '../buildTokenResolverRegistry';
import { interpolate } from '../../interpolate';
import type { InterpolationContext } from '../types';
import { GOLDEN_CTX } from '../../__tests__/goldenFixtures';

/**
 * T1b.6 — Registry–resolver consistency invariant (REQ-01 DIR-05, Risk 1).
 *
 * Every area registered in `AREA_CONFIGS` MUST have a resolver branch in
 * `buildTokenResolverRegistry`. Unknown areas silently resolve every token
 * to '' and strip blocks — the top-ranked silent-failure risk. This test
 * fails naming the divergent area on any registry/resolver divergence.
 *
 * The fixture is a SUPERSET context (patient-shaped fields AND cobranza
 * fields filled) so every registered area's tokens can resolve non-empty —
 * `mockPreviewData` alone lacks `patients[]`/`files[]` arrays, which would
 * false-fail consolidados table tokens.
 */
const SUPERSET_CTX: InterpolationContext = {
  ...GOLDEN_CTX,
  // Cobranza side of the superset.
  ruc: '20123456789',
  montoTotal: 'S/ 12,345.67',
  moneda: 'PEN',
  diasVencidos: '45',
  cuentasBancariasHtml:
    '<div style="border-left: 3px solid #003366;">DATOS PARA EL PAGO — Banco Scotiabank</div>',
  documentosPendientes: [
    { fecha: '15/11/2025', factura: 'FE F001-101', monto: 'S/ 1,200.00', saldo: 'S/ 1,000.00' },
    { fecha: '02/12/2025', factura: 'BO B001-50', monto: 'USD 60.00', saldo: 'USD 50.00' },
  ],
  tablaCobranza: [{ cliente: '20601234567', razonSocial: 'COMERCIAL ABC S.A.C.', tipoDoc: 'FE', serie: 'F001', numero: '101', fechaDoc: '01/11/2025', fechaVen: '15/11/2025', moneda: 'S/', debe: 'S/ 1,200.00', haber: 'S/ 0.00', saldo: 'S/ 1,000.00' }],
};

describe('areaRegistryConsistency (REQ-01 DIR-05)', () => {
  it('every registered area resolves ALL its non-table tokens to non-empty values', () => {
    for (const [area, config] of AREA_CONFIGS) {
      const registry = buildTokenResolverRegistry(area);
      const simpleTokens = config.availableTokens
        .flatMap((c) => c.tokens)
        .filter((t) => t.isTable !== true);
      // Sanity: each area declares simple tokens — otherwise this check
      // would pass vacuously.
      expect(simpleTokens.length, `${area} must declare simple tokens`).toBeGreaterThan(0);

      for (const token of simpleTokens) {
        expect(
          registry.resolveToken(token.key, SUPERSET_CTX).html,
          `area "${area}" token "{{${token.key}}}" resolved to '' — missing resolver branch?`,
        ).not.toBe('');
      }
    }
  });

  it('every registered area resolves ALL its predefined tables to non-empty HTML', () => {
    for (const [area, config] of AREA_CONFIGS) {
      const registry = buildTokenResolverRegistry(area);
      expect(
        config.predefinedTables.length,
        `${area} must declare predefined tables`,
      ).toBeGreaterThan(0);

      for (const table of config.predefinedTables) {
        const cols = table.columns.map((c) => c.key);
        expect(
          registry.resolveTable(table.name, cols, SUPERSET_CTX).html,
          `area "${area}" table "{{tabla:${table.name}:...}}" resolved to '' — missing table resolver?`,
        ).not.toBe('');
      }
    }
  });

  it('a registered-but-branchless area is caught: the failure message names the area', () => {
    // Simulated divergence: an area present in AREA_CONFIGS with NO
    // resolver branch resolves everything to ''. The loop assertions above
    // embed the area name in the message; here we pin the mechanism itself
    // against the real unknown-area behavior of the factory.
    const registry = buildTokenResolverRegistry('valoraciones');
    const divergentToken = registry.resolveToken('empresa', SUPERSET_CTX);
    expect(divergentToken.html).toBe('');
    // This is exactly what a branchless registered area would produce —
    // and what the per-area loops above reject via the `${area}:...` names.
  });

  it('cobranza template with all registered tokens interpolates fully non-empty (DIR-05 scenario 2)', () => {
    const registry = buildTokenResolverRegistry('cobranza');
    const template =
      '<p>Estimados {{empresa}} (RUC {{ruc}}),</p>' +
      '<p>Fecha: {{fecha}}</p>' +
      '<p>Saldo total: {{montoTotal}} {{moneda}} — días vencidos: {{diasVencidos}}</p>' +
      '<div>{{cuentasBancarias}}</div>' +
      '<div>{{tabla:documentosPendientes:fecha,factura,monto,saldo}}</div>' +
      '<p>{{firma}}</p>';
    const out = interpolate(template, 'Estado de cuenta {{empresa}}', SUPERSET_CTX, registry);
    // No placeholder survives.
    expect(out.html).not.toContain('{{');
    // Every token's data is present.
    expect(out.html).toContain('Clínica Demo S.A.');
    expect(out.html).toContain('20123456789');
    expect(out.html).toContain('15 de enero de 2026');
    expect(out.html).toContain('S/ 12,345.67');
    expect(out.html).toContain('PEN');
    expect(out.html).toContain('45');
    expect(out.html).toContain('DATOS PARA EL PAGO');
    expect(out.html).toMatch(/<table[\s>]/);
    expect(out.html).toContain('FE F001-101');
    expect(out.html).toContain('<p>Dr. Pérez — Clínica Demo S.A.</p>');
    // Subject interpolation works too.
    expect(out.subject).toBe('Estado de cuenta Clínica Demo S.A.');
  });

  it('cobranza template with the tabla-cobranza token interpolates fully non-empty (token-tabla-cobranza, REQ-TC-05)', () => {
    const out = interpolate(
      '<div>{{tabla:tabla-cobranza:cliente,razonSocial,tipoDoc,serie,numero,fechaDoc,fechaVen,moneda,debe,haber,saldo}}</div>',
      'Cuenta {{empresa}}',
      SUPERSET_CTX,
      buildTokenResolverRegistry('cobranza'),
    );
    // No placeholder survives; the real table renders with its row data
    // (tipoDoc/serie/numero are separate columns — no composed factura label).
    expect(out.html).not.toContain('{{');
    expect(out.html).toMatch(/<table[\s>]/);
    expect(out.html).toContain('COMERCIAL ABC S.A.C.');
    expect(out.subject).toBe('Cuenta Clínica Demo S.A.');
  });
});

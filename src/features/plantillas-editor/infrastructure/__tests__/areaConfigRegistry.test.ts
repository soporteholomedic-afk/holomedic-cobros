import { describe, expect, it } from 'vitest';

import { AREA_CONFIGS, getAreaConfig } from '../areaConfigRegistry';

/**
 * Registry tests for the `areaConfig` code registry.
 *
 * Spec `area-template-config`:
 *  - "Consolidados config present" → getAreaConfig('consolidados') returns
 *    an AreaConfig with a label, at least one token category, and mock
 *    preview data.
 *  - "Unregistered area returns undefined" → reserved areas not yet
 *    populated (valoraciones) return undefined.
 *
 * REQ-01 DIR-04 adds the cobranza registration:
 *  - COBRANZA_CONFIG present with the cobranza token palette
 *    (empresa/ruc/fecha/montoTotal/moneda/diasVencidos/cuentasBancarias/firma)
 *    and the documentosPendientes table [fecha, factura, monto, saldo].
 *  - mockPreviewData carries realistic optional cobranza fields (back-compat:
 *    the fields are optional so consolidados mocks are unaffected).
 *
 * `AREA_CONFIGS` is a RUNTIME import (a Map value) so this file fails to
 * load if the registry module is absent — a real RED, not a trivial pass.
 */
describe('areaConfigRegistry', () => {
  describe('AREA_CONFIGS', () => {
    it('registers consolidados and cobranza', () => {
      expect(AREA_CONFIGS.size).toBe(2);
      expect(AREA_CONFIGS.has('consolidados')).toBe(true);
      expect(AREA_CONFIGS.has('cobranza')).toBe(true);
      expect(AREA_CONFIGS.has('valoraciones')).toBe(false);
    });
  });

  describe('getAreaConfig', () => {
    it("returns the consolidados AreaConfig (label, tokens, mock data)", () => {
      const cfg = getAreaConfig('consolidados');
      expect(cfg).toBeDefined();
      expect(cfg?.area).toBe('consolidados');
      expect(typeof cfg?.label).toBe('string');
      expect(cfg!.label.length).toBeGreaterThan(0);
      // At least one token category with at least one token.
      expect(cfg!.availableTokens.length).toBeGreaterThanOrEqual(1);
      const firstCategory = cfg!.availableTokens[0]!;
      expect(firstCategory.tokens.length).toBeGreaterThanOrEqual(1);
      // Mock preview data is populated so the editor preview can render.
      expect(cfg!.mockPreviewData).toBeDefined();
      expect(typeof cfg!.mockPreviewData.companyName).toBe('string');
      expect(cfg!.mockPreviewData.companyName.length).toBeGreaterThan(0);
    });

    it('exposes the Paciente token `destino` labelled "Proyecto / Destino" (spec: Palette exposes destination token)', () => {
      const cfg = getAreaConfig('consolidados');
      expect(cfg).toBeDefined();
      const pacienteCategory = cfg!.availableTokens.find((c) => c.category === 'Paciente');
      expect(pacienteCategory).toBeDefined();
      const destinoToken = pacienteCategory!.tokens.find((t) => t.key === 'destino');
      expect(destinoToken).toBeDefined();
      expect(destinoToken!.label).toBe('Proyecto / Destino');
      // Inserting the token must persist the canonical placeholder.
      expect(destinoToken!.key).toBe('destino');
      // The mock preview value must be non-empty so the preview renders it.
      expect(cfg!.mockPreviewData.destino.length).toBeGreaterThan(0);
    });

    it('returns the cobranza AreaConfig (REQ-01 DIR-04 registration)', () => {
      const cfg = getAreaConfig('cobranza');
      expect(cfg).toBeDefined();
      expect(cfg?.area).toBe('cobranza');
      expect(cfg?.label).toBe('Cobranza');
    });

    it('returns undefined for the reserved-but-unpopulated area (valoraciones)', () => {
      expect(getAreaConfig('valoraciones')).toBeUndefined();
    });

    it('returns undefined for a totally unknown area', () => {
      expect(getAreaConfig('does-not-exist')).toBeUndefined();
    });
  });

  describe('data integrity: table tokens resolve to a predefined table', () => {
    it("every table token's tableRef points to a registered predefined table", () => {
      const cfg = getAreaConfig('consolidados');
      expect(cfg).toBeDefined();
      const tableTokens = cfg!.availableTokens
        .flatMap((c) => c.tokens)
        .filter((t) => t.isTable === true);
      // There must be at least one table token to make this check meaningful.
      expect(tableTokens.length).toBeGreaterThanOrEqual(1);

      for (const token of tableTokens) {
        expect(token.tableRef).toBeTruthy();
        const table = cfg!.predefinedTables.find(
          (t) => t.name === token.tableRef,
        );
        expect(table).toBeDefined();
        expect(table!.columns.length).toBeGreaterThanOrEqual(1);
      }
    });

    it("cobranza table tokens' tableRef points to the registered documentosPendientes table (DIR-04)", () => {
      const cfg = getAreaConfig('cobranza');
      expect(cfg).toBeDefined();
      const tableTokens = cfg!.availableTokens
        .flatMap((c) => c.tokens)
        .filter((t) => t.isTable === true);
      expect(tableTokens.length).toBeGreaterThanOrEqual(1);

      for (const token of tableTokens) {
        expect(token.tableRef).toBeTruthy();
        const table = cfg!.predefinedTables.find(
          (t) => t.name === token.tableRef,
        );
        expect(table).toBeDefined();
        expect(table!.columns.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('cobranza config shape (REQ-01 DIR-04)', () => {
    it('exposes the cobranza token palette: empresa, ruc, fecha, montoTotal, moneda, diasVencidos, cuentasBancarias, firma', () => {
      const cfg = getAreaConfig('cobranza');
      expect(cfg).toBeDefined();
      const keys = cfg!.availableTokens.flatMap((c) => c.tokens).map((t) => t.key);
      for (const key of [
        'empresa',
        'ruc',
        'fecha',
        'montoTotal',
        'moneda',
        'diasVencidos',
        'cuentasBancarias',
        'firma',
      ]) {
        expect(keys, `token ${key} must be in the cobranza palette`).toContain(key);
      }
    });

    it('registers the documentosPendientes table with columns fecha/factura/monto/saldo', () => {
      const cfg = getAreaConfig('cobranza');
      expect(cfg).toBeDefined();
      const table = cfg!.predefinedTables.find((t) => t.name === 'documentosPendientes');
      expect(table).toBeDefined();
      expect(table!.label).toBe('Documentos pendientes');
      const colKeys = table!.columns.map((c) => c.key);
      expect(colKeys).toEqual(['fecha', 'factura', 'monto', 'saldo']);
      const colLabels = table!.columns.map((c) => c.label);
      expect(colLabels).toEqual(['Fecha', 'Factura', 'Monto', 'Saldo']);
    });

    it('mockPreviewData carries realistic cobranza values (ruc, montoTotal, moneda, diasVencidos, cuentasBancariasHtml, documentosPendientes)', () => {
      const cfg = getAreaConfig('cobranza');
      expect(cfg).toBeDefined();
      const mock = cfg!.mockPreviewData;
      expect(mock.ruc).toBe('20123456789');
      expect(mock.montoTotal).toBe('S/ 12,345.67');
      expect(mock.moneda).toBe('PEN');
      expect(mock.diasVencidos).toBe('45');
      // Bank HTML is realistic: title + at least one bank line.
      expect(mock.cuentasBancariasHtml).toContain('DATOS PARA EL PAGO');
      expect(mock.cuentasBancariasHtml).toContain('Scotiabank');
      // Two realistic pending-document rows, each with all four fields filled.
      expect(mock.documentosPendientes).toHaveLength(2);
      for (const row of mock.documentosPendientes ?? []) {
        expect(row.fecha.length).toBeGreaterThan(0);
        expect(row.factura.length).toBeGreaterThan(0);
        expect(row.monto.length).toBeGreaterThan(0);
        expect(row.saldo.length).toBeGreaterThan(0);
      }
    });

    it('cobranza mockPreviewData keeps the patient-shaped base fields (back-compat MockPreviewData contract)', () => {
      const cfg = getAreaConfig('cobranza');
      expect(cfg).toBeDefined();
      const mock = cfg!.mockPreviewData;
      // Base MockPreviewData fields are all present (strings/arrays), even
      // though cobranza templates never use the patient tokens.
      expect(typeof mock.companyName).toBe('string');
      expect(mock.companyName.length).toBeGreaterThan(0);
      expect(Array.isArray(mock.patientNames)).toBe(true);
      expect(Array.isArray(mock.fileNames)).toBe(true);
      expect(typeof mock.firma).toBe('string');
      expect(mock.area).toBe('cobranza');
      expect(typeof mock.today).toBe('string');
    });

    it('consolidados mockPreviewData is unaffected by the optional cobranza widening', () => {
      const cfg = getAreaConfig('consolidados');
      expect(cfg).toBeDefined();
      // Optional fields stay unset for consolidados — widening is additive.
      expect(cfg!.mockPreviewData.ruc).toBeUndefined();
      expect(cfg!.mockPreviewData.documentosPendientes).toBeUndefined();
    });

    it('registers tabla-cobranza: 12 canonical columns, chip wiring, realistic mocks, no width leak (token-tabla-cobranza, REQ-TC-01)', () => {
      const cfg = getAreaConfig('cobranza');
      expect(cfg).toBeDefined();
      const table = cfg!.predefinedTables.find((t) => t.name === 'tabla-cobranza');
      expect(table).toBeDefined();
      expect(table!.columns.map((c) => c.key)).toEqual([
        'cliente', 'razonSocial', 'tipoDoc', 'serie', 'numero', 'fechaDoc', 'fechaVen', 'moneda', 'debe', 'haber', 'saldo', 'diasVencidos',
      ]);
      expect(table!.columns.map((c) => c.label)).toEqual([
        'Cliente', 'Razón Social', 'Tipo Doc', 'Serie', 'Numero', 'Fec. Doc.', 'Fec. Ven', 'Mon', 'Debe', 'Haber', 'Saldo', 'Días Venc.',
      ]);
      // D9 widths are resolver-local — no width data may leak into the editor config.
      expect(JSON.stringify(table)).not.toContain('width');
      // A second Tablas chip is wired to the new table via tableRef.
      expect(
        cfg!.availableTokens.flatMap((c) => c.tokens).find((t) => t.isTable === true && t.tableRef === 'tabla-cobranza'),
      ).toBeDefined();
      // Mock rows: realistic identities (FE F001-101 S/, BO B001-50 S/, one USD row), every field filled.
      const rows = cfg!.mockPreviewData.tablaCobranza;
      expect(rows).toHaveLength(3);
      expect(rows![0]!.moneda).toBe('S/');
      expect(rows!.some((r) => r.moneda === 'US$')).toBe(true);
      expect(rows!.every((row) => Object.values(row).every((v) => v.length > 0))).toBe(true);
      // Per-row overdue-days story (as of ~15/12/2025): month overdue, ~two
      // weeks, and a not-yet-due row rendering '0'.
      expect(rows!.map((r) => r.diasVencidos)).toEqual(['30', '13', '0']);
    });
  });
});

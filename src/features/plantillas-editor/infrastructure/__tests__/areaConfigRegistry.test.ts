import { describe, expect, it } from 'vitest';

import { AREA_CONFIGS, getAreaConfig } from '../areaConfigRegistry';

/**
 * Registry tests for the `areaConfig` code registry.
 *
 * Spec `area-template-config`:
 *  - "Consolidados config present" → getAreaConfig('consolidados') returns
 *    an AreaConfig with a label, at least one token category, and mock
 *    preview data.
 *  - "Unregistered area returns undefined" → getAreaConfig('cobranza') is
 *    undefined.
 *  - "Reserved area not registered" → cobranza AND valoraciones undefined.
 *
 * `AREA_CONFIGS` is a RUNTIME import (a Map value) so this file fails to
 * load if the registry module is absent — a real RED, not a trivial pass.
 */
describe('areaConfigRegistry', () => {
  describe('AREA_CONFIGS', () => {
    it('registers only consolidados in v1', () => {
      expect(AREA_CONFIGS.size).toBe(1);
      expect(AREA_CONFIGS.has('consolidados')).toBe(true);
      expect(AREA_CONFIGS.has('cobranza')).toBe(false);
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

    it('returns undefined for an unregistered area (cobranza)', () => {
      expect(getAreaConfig('cobranza')).toBeUndefined();
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
  });
});

import { describe, expect, it } from 'vitest';

import { RAZON_SOCIAL_JUNK, RUC_PATTERN, esClaveDirectorioValida } from '../entities';
import type { EmpresaContacto, SaveContactInput } from '../entities';

/**
 * Entity-shape tests for the cobranza contact directory domain.
 *
 * `RUC_PATTERN`, `RAZON_SOCIAL_JUNK` and `esClaveDirectorioValida` are
 * RUNTIME imports — if `entities.ts` does not exist or does not export
 * them, this file fails to load (a real RED, not a trivial pass). The
 * interface field-set checks are compile-time gated: the
 * `: EmpresaContacto` / `: SaveContactInput` annotations make `tsc`
 * enforce that the literals match the declared shapes, and the
 * `Object.keys` assertions pin the expected runtime shape as
 * documentation. The full OQ2 junk-key matrix lives in
 * `esClaveDirectorioValida.test.ts`; here we pin the core semantics.
 */
describe('cobranza domain entities', () => {
  describe('RUC_PATTERN (directory key shape)', () => {
    it('accepts 11-digit RUC and 8-digit DNI keys', () => {
      expect(RUC_PATTERN.test('20123456789')).toBe(true);
      expect(RUC_PATTERN.test('12345678')).toBe(true);
    });

    it('rejects 7-digit, 12-digit and non-numeric keys', () => {
      expect(RUC_PATTERN.test('1234567')).toBe(false);
      expect(RUC_PATTERN.test('123456789012')).toBe(false);
      expect(RUC_PATTERN.test('20123456A89')).toBe(false);
      expect(RUC_PATTERN.test('')).toBe(false);
    });
  });

  describe('EmpresaContacto', () => {
    it('carries the six directory row fields', () => {
      const contacto: EmpresaContacto = {
        ruc: '20123456789',
        razonSocial: 'EMPRESA SAC',
        emailPrincipal: 'contacto@empresa.com',
        emailCopia: null,
        updatedAt: '2026-01-01T00:00:00.000Z',
        updatedBy: null,
      };
      // Compile-time: `: EmpresaContacto` enforces every required field.
      // Runtime: pin the expected key set so a future field addition is
      // a conscious update (the test literal must be updated too).
      expect(Object.keys(contacto).sort()).toEqual([
        'emailCopia',
        'emailPrincipal',
        'razonSocial',
        'ruc',
        'updatedAt',
        'updatedBy',
      ]);
      expect(contacto.emailCopia).toBeNull();
      expect(contacto.updatedBy).toBeNull();
    });

    it('accepts a populated copia, updatedBy and ISO updatedAt', () => {
      const contacto: EmpresaContacto = {
        ruc: '20123456789',
        razonSocial: 'EMPRESA SAC',
        emailPrincipal: 'contacto@empresa.com',
        emailCopia: 'gerencia@empresa.com',
        updatedAt: '2026-08-21T12:00:00.000Z',
        updatedBy: 'Dra. House',
      };
      expect(contacto.emailCopia).toBe('gerencia@empresa.com');
      expect(contacto.updatedBy).toBe('Dra. House');
      // ISO-8601 with milliseconds — the boundary contract the repo maps
      // SQL Server DATETIME2 Date objects into.
      expect(contacto.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('SaveContactInput', () => {
    it('carries the upsert fields the route resolves — no updatedAt (the repo stamps it)', () => {
      const input: SaveContactInput = {
        ruc: '20123456789',
        razonSocial: 'EMPRESA SAC',
        emailPrincipal: 'contacto@empresa.com',
        emailCopia: 'gerencia@empresa.com',
        updatedBy: 'Dra. House',
      };
      expect(Object.keys(input).sort()).toEqual([
        'emailCopia',
        'emailPrincipal',
        'razonSocial',
        'ruc',
        'updatedBy',
      ]);
    });
  });

  describe('esClaveDirectorioValida (core semantics — full matrix in esClaveDirectorioValida.test.ts)', () => {
    it('accepts a numeric key with a real company name', () => {
      expect(esClaveDirectorioValida('20123456789', 'EMPRESA SAC')).toBe(true);
    });

    it('rejects the junk fallback razonSocial after trimming', () => {
      expect(esClaveDirectorioValida('20123456789', '  CLIENTE SIN NOMBRE  ')).toBe(false);
    });

    it('treats case variants as real names (excelParser exact-match semantics)', () => {
      expect(esClaveDirectorioValida('20123456789', 'Cliente Sin Nombre')).toBe(true);
    });

    it('rejects a real name when the key is malformed', () => {
      expect(esClaveDirectorioValida('1234567', 'EMPRESA SAC')).toBe(false);
    });

    it('exposes the junk literal the parser generates', () => {
      expect(RAZON_SOCIAL_JUNK).toBe('CLIENTE SIN NOMBRE');
    });
  });
});

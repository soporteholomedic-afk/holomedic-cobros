import { describe, expect, it } from 'vitest';

import { esClaveDirectorioValida } from '../entities';

/**
 * OQ2 junk-key matrix for `esClaveDirectorioValida` (REQ-01-DIR-01,
 * design D2).
 *
 * `excelParser` builds `razonSocial` as
 * `String(cell || ... || 'CLIENTE SIN NOMBRE').trim()` and its own junk
 * check (line 138) uses EXACT post-trim equality. The guard mirrors
 * those semantics:
 *  - `ruc.trim()` must match `/^\d{8,11}$/` (RUC 11 / DNI 8).
 *  - `razonSocial.trim()` must NOT equal 'CLIENTE SIN NOMBRE' exactly.
 *  - `razonSocial.trim() === ''` is also junk (defensive — cannot occur
 *    post-parse).
 *  - Case variants ('Cliente Sin Nombre') are REAL names: blocking them
 *    would diverge from the parser and risk blocking a real (oddly
 *    cased) company.
 */
describe('esClaveDirectorioValida — OQ2 matrix', () => {
  describe('razonSocial junk detection (exact post-trim match)', () => {
    it('rejects the exact junk literal', () => {
      expect(esClaveDirectorioValida('20123456789', 'CLIENTE SIN NOMBRE')).toBe(false);
    });

    it('rejects the junk literal with surrounding whitespace (trimmed first)', () => {
      expect(esClaveDirectorioValida('20123456789', '  CLIENTE SIN NOMBRE  ')).toBe(false);
    });

    it('rejects an empty razonSocial (defensive)', () => {
      expect(esClaveDirectorioValida('20123456789', '')).toBe(false);
      expect(esClaveDirectorioValida('20123456789', '    ')).toBe(false);
    });

    it('accepts the case variant as a real name (parser semantics)', () => {
      expect(esClaveDirectorioValida('20123456789', 'Cliente Sin Nombre')).toBe(true);
    });

    it('accepts a real company name with surrounding whitespace (trimmed)', () => {
      expect(esClaveDirectorioValida('20123456789', '  EMPRESA SAC  ')).toBe(true);
    });
  });

  describe('ruc shape (8 or 11 digits)', () => {
    it('accepts an 11-digit RUC', () => {
      expect(esClaveDirectorioValida('20123456789', 'EMPRESA SAC')).toBe(true);
    });

    it('accepts an 8-digit DNI', () => {
      expect(esClaveDirectorioValida('12345678', 'JUAN PEREZ')).toBe(true);
    });

    it('accepts a key with surrounding whitespace (trimmed first)', () => {
      expect(esClaveDirectorioValida(' 20123456789 ', 'EMPRESA SAC')).toBe(true);
    });

    it('rejects a 7-digit key', () => {
      expect(esClaveDirectorioValida('1234567', 'EMPRESA SAC')).toBe(false);
    });

    it('rejects a 12-digit key', () => {
      expect(esClaveDirectorioValida('123456789012', 'EMPRESA SAC')).toBe(false);
    });

    it('rejects an alphabetic key', () => {
      expect(esClaveDirectorioValida('abcdefghijk', 'EMPRESA SAC')).toBe(false);
    });

    it('rejects an empty key', () => {
      expect(esClaveDirectorioValida('', 'EMPRESA SAC')).toBe(false);
    });
  });

  describe('combined matrix (junk key must not be memorized)', () => {
    it('junk name + junk key → invalid', () => {
      expect(esClaveDirectorioValida('abc', 'CLIENTE SIN NOMBRE')).toBe(false);
    });

    it('valid name + valid key → valid (the memorizable pair)', () => {
      expect(esClaveDirectorioValida('20123456789', 'EMPRESA SAC')).toBe(true);
    });
  });
});

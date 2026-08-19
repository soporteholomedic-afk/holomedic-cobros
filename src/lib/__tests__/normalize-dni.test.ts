import { describe, it, expect } from 'vitest';
import { normalizeDni, isSafeDocumentKey } from '../normalize-dni';

describe('normalizeDni', () => {
  // ---- Happy path: "DNI " prefix (most common real-world format) ----

  it('should strip "DNI " prefix and return bare digits', () => {
    expect(normalizeDni('DNI 25721424')).toBe('25721424');
  });

  it('should handle "DNI " prefix with extra whitespace between prefix and digits', () => {
    expect(normalizeDni('DNI  25721424')).toBe('25721424');
  });

  // ---- Already bare digits (no prefix) ----

  it('should return bare digits unchanged', () => {
    expect(normalizeDni('25721424')).toBe('25721424');
  });

  // ---- Edge cases per spec ----

  it('should strip "DNI:" colon-separated prefix', () => {
    expect(normalizeDni('DNI:12345')).toBe('12345');
  });

  it('should strip "DNI-" hyphen-separated prefix and inner formatting', () => {
    expect(normalizeDni('DNI-12345-6')).toBe('123456');
  });

  it('should handle whitespace-only input', () => {
    expect(normalizeDni('   ')).toBe('');
  });

  it('should handle empty string', () => {
    expect(normalizeDni('')).toBe('');
  });

  it('should strip all formatting (dots, dashes) from numeric DNIs', () => {
    expect(normalizeDni('DNI 12.345.678-9')).toBe('123456789');
  });

  // ---- Very long DNI strings (edge case) ----

  it('should handle very long numeric strings', () => {
    const longDni = 'DNI ' + '1'.repeat(50);
    expect(normalizeDni(longDni)).toBe('1'.repeat(50));
  });

  it('should handle a bare document-type label (empty document)', () => {
    expect(normalizeDni('DNI')).toBe('');
  });

  // ---- Foreign (extranjero) documents: PRESERVE letters ----

  it('should keep the letter prefix of a passport prefixed with its type label', () => {
    expect(normalizeDni('PASAPORTE EB7192642')).toBe('EB7192642');
  });

  it('should keep the letter prefix of a bare alphanumeric passport', () => {
    expect(normalizeDni('EB7192642')).toBe('EB7192642');
  });

  it('should keep the letter prefix of an alphanumeric document', () => {
    expect(normalizeDni('R05481670')).toBe('R05481670');
  });

  it('should strip the "CARNET DE EXTRANJERIA" label but keep letters in the document', () => {
    expect(normalizeDni('CARNET DE EXTRANJERIA 18.362.427-K')).toBe('18362427K');
    expect(normalizeDni('CARNET DE EXTRANJERIA 10561145-5')).toBe('105611455');
  });

  it('should preserve letters but strip formatting in mixed input', () => {
    expect(normalizeDni('DNI ABC-XYZ')).toBe('ABCXYZ');
  });
});

describe('isSafeDocumentKey', () => {
  it('should accept numeric DNIs', () => {
    expect(isSafeDocumentKey('25721424')).toBe(true);
  });

  it('should accept alphanumeric foreign documents', () => {
    expect(isSafeDocumentKey('EB7192642')).toBe(true);
    expect(isSafeDocumentKey('R05481670')).toBe(true);
  });

  it('should reject empty and non-alphanumeric values', () => {
    expect(isSafeDocumentKey('')).toBe(false);
    expect(isSafeDocumentKey('12.345')).toBe(false);
    expect(isSafeDocumentKey('12-345')).toBe(false);
    expect(isSafeDocumentKey('a/b')).toBe(false);
    expect(isSafeDocumentKey('a\\b')).toBe(false);
    expect(isSafeDocumentKey('..')).toBe(false);
    expect(isSafeDocumentKey('a b')).toBe(false);
  });
});
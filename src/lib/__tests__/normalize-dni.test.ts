import { describe, it, expect } from 'vitest';
import { normalizeDni } from '../normalize-dni';

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

  it('should handle DNIs with special characters and return only digits', () => {
    expect(normalizeDni('DNI-12345-6')).toBe('123456');
  });

  it('should handle whitespace-only input', () => {
    expect(normalizeDni('   ')).toBe('');
  });

  it('should handle empty string', () => {
    expect(normalizeDni('')).toBe('');
  });

  it('should strip all non-numeric characters (strict mode)', () => {
    expect(normalizeDni('DNI 12.345.678-9')).toBe('123456789');
  });

  // ---- Very long DNI strings (edge case) ----

  it('should handle very long numeric strings', () => {
    const longDni = 'DNI ' + '1'.repeat(50);
    expect(normalizeDni(longDni)).toBe('1'.repeat(50));
  });

  it('should handle string with only non-numeric characters', () => {
    expect(normalizeDni('DNI ABC-XYZ')).toBe('');
  });
});

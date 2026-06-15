import { describe, it, expect } from 'vitest';
import { normalizeCondic } from '../condic';

describe('normalizeCondic', () => {
  // ---- Nullish + empty ----

  it('should return "" for null', () => {
    expect(normalizeCondic(null)).toBe('');
  });

  it('should return "" for undefined', () => {
    expect(normalizeCondic(undefined)).toBe('');
  });

  it('should return "" for empty string', () => {
    expect(normalizeCondic('')).toBe('');
  });

  it('should return "" for whitespace-only string', () => {
    expect(normalizeCondic('   ')).toBe('');
  });

  // ---- NULL literal (any case) → empty ----

  it('should return "" for literal "NULL"', () => {
    expect(normalizeCondic('NULL')).toBe('');
  });

  it('should return "" for lowercase "null"', () => {
    expect(normalizeCondic('null')).toBe('');
  });

  it('should return "" for mixed-case "Null"', () => {
    expect(normalizeCondic('Null')).toBe('');
  });

  // ---- Non-NULL values pass through trimmed ----

  it('should trim surrounding whitespace for non-NULL values', () => {
    expect(normalizeCondic(' APTO ')).toBe('APTO');
  });

  it('should return trimmed value for non-NULL value without whitespace', () => {
    expect(normalizeCondic('APTO')).toBe('APTO');
  });

  it('should return trimmed value for "NO APTO"', () => {
    expect(normalizeCondic('  NO APTO  ')).toBe('NO APTO');
  });
});

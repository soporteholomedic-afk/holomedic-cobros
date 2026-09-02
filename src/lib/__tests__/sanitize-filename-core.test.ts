import { describe, expect, it } from 'vitest';
import { sanitizeComponent, sanitizeZipName } from '@/lib/sanitize-filename-core';

/**
 * Behavior-preservation suite for the browser-safe core split (design D3).
 *
 * `sanitizeComponent`/`sanitizeZipName` moved verbatim out of
 * `sanitize-filename.ts` (which keeps the `node:path`-dependent helpers)
 * so client bundles can import them without pulling `node:*` builtins.
 * These rows are the characterization contract: the moved functions must
 * behave EXACTLY as before the split — any divergence here is a
 * regression, not a refactor.
 */
describe('sanitizeComponent', () => {
  it('replaces Windows-illegal slash with underscore', () => {
    expect(sanitizeComponent('Juan/Pérez')).toBe('Juan_Pérez');
  });

  it('replaces every Windows-illegal character with underscore', () => {
    expect(sanitizeComponent('a<b>c:d"e|f?g*h')).toBe('a_b_c_d_e_f_g_h');
  });

  it('replaces backslash with underscore', () => {
    expect(sanitizeComponent('back\\slash')).toBe('back_slash');
  });

  it('replaces C0 control characters with underscore', () => {
    expect(sanitizeComponent('a\x00b\x1fc')).toBe('a_b_c');
  });

  it('replaces tabs/newlines with underscore (C0 range hits the illegal pass first)', () => {
    expect(sanitizeComponent('a\tb\nc')).toBe('a_b_c');
  });

  it('collapses runs of whitespace and trims', () => {
    expect(sanitizeComponent('  Hola   mundo  ')).toBe('Hola mundo');
  });
});

describe('sanitizeZipName', () => {
  it('joins three components with " - "', () => {
    expect(sanitizeZipName('Juan', '12345678', 'Acme S.A.C.')).toBe(
      'Juan - 12345678 - Acme S.A.C.',
    );
  });

  it('omits empty leading component and its " - " separator', () => {
    expect(sanitizeZipName('', '12345678', 'Acme')).toBe('12345678 - Acme');
  });

  it('returns empty string when all components are empty (caller appends .zip)', () => {
    expect(sanitizeZipName('', '', '')).toBe('');
  });

  it('returns empty string when all components are whitespace-only (spaces)', () => {
    expect(sanitizeZipName(' ', ' ', ' ')).toBe('');
  });

  it('sanitizes illegal chars inside any component', () => {
    expect(sanitizeZipName('Juan/Pérez', '12345678', 'Acme<>Corp')).toBe(
      'Juan_Pérez - 12345678 - Acme__Corp',
    );
  });

  it('drops sanitized-to-empty middle components with their separators', () => {
    expect(sanitizeZipName('Juan', '  ', 'Acme')).toBe('Juan - Acme');
  });
});

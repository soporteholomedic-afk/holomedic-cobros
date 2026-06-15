import { describe, expect, it } from 'vitest';
import {
  sanitizeComponent,
  sanitizeDownloadName,
  sanitizeFolderPath,
  sanitizeZipName,
} from '@/lib/sanitize-filename';

/**
 * Truth table for `sanitize-filename` (see design.md observation 109).
 *
 * `sanitize-filename` is a pure module with no side effects, so a
 * pure-function test file is the highest available layer (no DOM,
 * no fetch, no fs). Each row in the design's truth table becomes
 * one `it` here so a regression breaks the exact behavior that
 * regressed.
 */
describe('sanitizeComponent', () => {
  it('replaces Windows-illegal slash with underscore', () => {
    expect(sanitizeComponent('Juan/Pérez')).toBe('Juan_Pérez');
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

  it('sanitizes illegal chars inside any component', () => {
    expect(sanitizeZipName('Juan/Pérez', '12345678', 'Acme<>Corp')).toBe(
      'Juan_Pérez - 12345678 - Acme__Corp',
    );
  });
});

describe('sanitizeDownloadName', () => {
  it('passes through a safe filename unchanged', () => {
    expect(sanitizeDownloadName('informe.pdf')).toBe('informe.pdf');
  });

  it('throws on Windows-style path traversal', () => {
    expect(() => sanitizeDownloadName('..\\..\\windows\\sam')).toThrow(
      /inválido/i,
    );
  });

  it('throws on POSIX-style path traversal', () => {
    expect(() => sanitizeDownloadName('foo/bar.pdf')).toThrow(/inválido/i);
  });
});

describe('sanitizeFolderPath', () => {
  it('returns empty string unchanged (patient root)', () => {
    expect(sanitizeFolderPath('')).toBe('');
  });

  it('passes through a simple subfolder name', () => {
    expect(sanitizeFolderPath('subfolder')).toBe('subfolder');
  });

  it('passes through a nested forward-slash path', () => {
    expect(sanitizeFolderPath('subfolder/inner')).toBe('subfolder/inner');
  });

  it('throws on `..` (POSIX-style traversal)', () => {
    expect(() => sanitizeFolderPath('..')).toThrow(/inválido/i);
  });

  it('throws on `../etc` (POSIX-style traversal)', () => {
    expect(() => sanitizeFolderPath('../etc')).toThrow(/inválido/i);
  });

  it('throws on `subfolder/../etc` (embedded traversal)', () => {
    expect(() => sanitizeFolderPath('subfolder/../etc')).toThrow(/inválido/i);
  });

  it('throws on a leading forward slash (absolute POSIX path)', () => {
    expect(() => sanitizeFolderPath('/etc/passwd')).toThrow(/inválido/i);
  });

  it('throws on a leading backslash (absolute Windows path)', () => {
    expect(() => sanitizeFolderPath('..\\..\\..\\Windows')).toThrow(/inválido/i);
  });

  it('throws on URL-encoded `../etc` (decodes then rejects)', () => {
    expect(() => sanitizeFolderPath('%2E%2E%2Fetc')).toThrow(/inválido/i);
  });
});

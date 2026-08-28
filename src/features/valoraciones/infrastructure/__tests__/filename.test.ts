import { describe, expect, it } from 'vitest';

import {
  dispositionAttachment,
  nombreArchivoExportacion,
  sanitizeEmpresaFilename,
} from '../filename';

/**
 * Export filename contract (REQ-03 U6 user fix): both downloads are named
 * `[NombreEmpresa]_[fecIni ISO].[ext]`, with the empresa name sanitized for
 * Windows-invalid characters; Content-Disposition carries an ASCII fallback
 * plus `filename*` UTF-8 so accented company names survive the round trip.
 */
describe('sanitizeEmpresaFilename', () => {
  it('keeps a plain company name untouched', () => {
    expect(sanitizeEmpresaFilename('EMPRESA DEMO S.A.C.')).toBe('EMPRESA DEMO S.A.C.');
  });

  it('replaces every Windows-invalid filename character with an underscore', () => {
    expect(sanitizeEmpresaFilename('A/B\\C:D*E?F"G<H>I|J')).toBe('A_B_C_D_E_F_G_H_I_J');
  });

  it('preserves trailing dots (S.A.C. names) — the _<date> suffix keeps the final filename valid', () => {
    expect(sanitizeEmpresaFilename('EMPRESA DEMO S.A.C.')).toBe('EMPRESA DEMO S.A.C.');
    expect(sanitizeEmpresaFilename('  MINERA   SUR  ')).toBe('MINERA SUR');
  });

  it('replaces pure-punctuation names with underscores (spec-literal replace, still a legal filename)', () => {
    expect(sanitizeEmpresaFilename('???')).toBe('___');
  });

  it('falls back to "empresa" for whitespace-only input', () => {
    expect(sanitizeEmpresaFilename('   ')).toBe('empresa');
  });

  it('collapses internal whitespace runs to a single space', () => {
    expect(sanitizeEmpresaFilename('CONSTRUCTORA   DEL   SUR')).toBe('CONSTRUCTORA DEL SUR');
  });
});

describe('nombreArchivoExportacion', () => {
  it('builds [Empresa]_[fecIni].[ext] for an empresa-scoped export', () => {
    expect(nombreArchivoExportacion('EMPRESA DEMO S.A.C.', '2026-01-01', 'pdf')).toBe(
      'EMPRESA DEMO S.A.C._2026-01-01.pdf',
    );
    expect(nombreArchivoExportacion('MINERA LOS ANDES', '2026-01-01', 'xlsx')).toBe(
      'MINERA LOS ANDES_2026-01-01.xlsx',
    );
  });

  it('sanitizes the empresa name inside the filename', () => {
    expect(nombreArchivoExportacion('ACME: S.A/C', '2026-01-01', 'pdf')).toBe(
      'ACME_ S.A_C_2026-01-01.pdf',
    );
  });

  it('keeps the legacy valoraciones name for clientless exports', () => {
    expect(nombreArchivoExportacion(undefined, '2026-01-01', 'pdf', '2026-01-31')).toBe(
      'valoraciones_2026-01-01_2026-01-31.pdf',
    );
  });
});

describe('dispositionAttachment', () => {
  it('marks the response as an attachment with the exact filename', () => {
    const disposition = dispositionAttachment('EMPRESA DEMO S.A.C._2026-01-01.pdf');
    expect(disposition).toContain('attachment');
    expect(disposition).toContain('filename="EMPRESA DEMO S.A.C._2026-01-01.pdf"');
  });

  it('adds an ASCII fallback plus RFC 5987 filename* for accented names', () => {
    const disposition = dispositionAttachment('CONSTRUCCIÓN S.A.C._2026-01-01.xlsx');
    expect(disposition).toContain('filename="CONSTRUCCION S.A.C._2026-01-01.xlsx"');
    expect(disposition).toContain(
      "filename*=UTF-8''CONSTRUCCI%C3%93N%20S.A.C._2026-01-01.xlsx",
    );
  });

  it('percent-encodes RFC 5987 attribute-reserved characters', () => {
    const disposition = dispositionAttachment("O'BRIEN (SUR)_2026-01-01.pdf");
    expect(disposition).toContain("filename*=UTF-8''O%27BRIEN%20%28SUR%29_2026-01-01.pdf");
    // The quoted ASCII fallback stays a valid quoted-string (no raw quote).
    expect(disposition).toContain('filename="O\'BRIEN (SUR)_2026-01-01.pdf"');
  });
});

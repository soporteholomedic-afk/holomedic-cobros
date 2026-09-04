import { describe, expect, it } from 'vitest';
import {
  looksLikeGeneratedCertificate,
  renameGeneratedCertificate,
} from '../renameGeneratedCertificate';

/**
 * CLI generated certificates (PR envio-resultados — CAMO download naming).
 *
 * The .NET CLI (`SIGLA.PdfCli.exe`) writes PDFs to the LAN share with
 * names `{idAten}_{idePMe}_{arcPla}.pdf`. Only certificate templates
 * (`arcPla` contains "CERTIFICADO") are renamed to
 * `CAMO_{nombreCompleto}.pdf`. Everything else passes through unchanged.
 */
describe('renameGeneratedCertificate', () => {
  it('renames a CLI certificate to CAMO format with the patient name', () => {
    const result = renameGeneratedCertificate({
      rawName: '012110597_39183_CERTIFICADO MEDICO DE APTITUD (GEMO Y ANEXO 16).pdf',
      nombreCompleto: 'JUAN PEREZ',
    });
    expect(result).toBe('CAMO_JUAN PEREZ.pdf');
  });

  it('renames a CLI certificate with a hyphenated arcPla to CAMO format', () => {
    const result = renameGeneratedCertificate({
      rawName: '012110149_390417_CERTIFICADO APTITUD - METRO LIMA 2.pdf',
      nombreCompleto: 'MARIA GARCIA',
    });
    expect(result).toBe('CAMO_MARIA GARCIA.pdf');
  });

  it('does NOT rename a CLI non-certificate file', () => {
    const result = renameGeneratedCertificate({
      rawName: '012110597_39053_EVALUACION OFTALMOLOGICA.pdf',
      nombreCompleto: 'JUAN PEREZ',
    });
    expect(result).toBe('012110597_39053_EVALUACION OFTALMOLOGICA.pdf');
  });

  it('does NOT rename a ready-style file (that is renameReadyFile\x27s job)', () => {
    const result = renameGeneratedCertificate({
      rawName: '75618561CERT.pdf',
      nombreCompleto: 'JUAN PEREZ',
    });
    expect(result).toBe('75618561CERT.pdf');
  });

  it('returns the raw name unchanged when nombreCompleto is empty', () => {
    const result = renameGeneratedCertificate({
      rawName: '012110597_39183_CERTIFICADO MEDICO DE APTITUD (GEMO Y ANEXO 16).pdf',
      nombreCompleto: '',
    });
    expect(result).toBe('012110597_39183_CERTIFICADO MEDICO DE APTITUD (GEMO Y ANEXO 16).pdf');
  });

  it('returns the raw name unchanged when nombreCompleto is whitespace-only', () => {
    const result = renameGeneratedCertificate({
      rawName: '012110597_39183_CERTIFICADO MEDICO DE APTITUD (GEMO Y ANEXO 16).pdf',
      nombreCompleto: '   ',
    });
    expect(result).toBe('012110597_39183_CERTIFICADO MEDICO DE APTITUD (GEMO Y ANEXO 16).pdf');
  });

  it('sanitizes Windows-illegal characters in the patient name via sanitizeComponent', () => {
    const result = renameGeneratedCertificate({
      rawName: '012110597_39183_CERTIFICADO MEDICO DE APTITUD (GEMO Y ANEXO 16).pdf',
      nombreCompleto: 'JUAN/PEREZ\\OTRO:*',
    });
    expect(result).toBe('CAMO_JUAN_PEREZ_OTRO__.pdf');
  });

  it('collapses whitespace runs and trims the patient name', () => {
    const result = renameGeneratedCertificate({
      rawName: '012110597_39183_CERTIFICADO MEDICO DE APTITUD (GEMO Y ANEXO 16).pdf',
      nombreCompleto: '  JUAN   PEREZ  ',
    });
    expect(result).toBe('CAMO_JUAN PEREZ.pdf');
  });

  it('handles accented and ñ characters in the patient name', () => {
    const result = renameGeneratedCertificate({
      rawName: '012110597_39183_CERTIFICADO MEDICO DE APTITUD (GEMO Y ANEXO 16).pdf',
      nombreCompleto: 'JOSÉ PEÑA',
    });
    expect(result).toBe('CAMO_JOSÉ PEÑA.pdf');
  });

  it('does NOT rename an arbitrary user file', () => {
    const result = renameGeneratedCertificate({
      rawName: 'informe.pdf',
      nombreCompleto: 'JUAN PEREZ',
    });
    expect(result).toBe('informe.pdf');
  });

  // WU-1.5 (nomenclatura-adicionales, spec S-3): an explicit
  // `tipoExamen: 'ADICIONAL'` switches the prefix to `ADICIONAL_` and
  // takes precedence over the raw-name CAMO inference. No input (or
  // CAMO/EMO input) keeps `CAMO_` exactly as before.
  it('renames a CLI certificate to ADICIONAL_<nombre>.pdf when tipoExamen="ADICIONAL" (S-3)', () => {
    const result = renameGeneratedCertificate({
      rawName: '012110336_390417_CERTIFICADO MEDICO DE APTITUD (GEMO Y ANEXO 16).pdf',
      nombreCompleto: 'JUAN PEREZ',
      tipoExamen: 'ADICIONAL',
    });
    expect(result).toBe('ADICIONAL_JUAN PEREZ.pdf');
  });

  it('ADICIONAL input takes precedence over the raw-name CAMO inference (never CAMO_)', () => {
    const result = renameGeneratedCertificate({
      rawName: '012110336_390417_CERTIFICADO MEDICO DE APTITUD (GEMO Y ANEXO 16).pdf',
      nombreCompleto: 'JUAN PEREZ',
      tipoExamen: 'ADICIONAL',
    });
    expect(result).not.toContain('CAMO_');
    expect(result).toBe('ADICIONAL_JUAN PEREZ.pdf');
  });

  it('keeps CAMO_ output when tipoExamen is "CAMO" (only ADICIONAL changes the prefix)', () => {
    const result = renameGeneratedCertificate({
      rawName: '012110597_39183_CERTIFICADO MEDICO DE APTITUD (GEMO Y ANEXO 16).pdf',
      nombreCompleto: 'JUAN PEREZ',
      tipoExamen: 'CAMO',
    });
    expect(result).toBe('CAMO_JUAN PEREZ.pdf');
  });

  it('keeps CAMO_ output when tipoExamen is "EMO" (generated certs are CAMO-only)', () => {
    const result = renameGeneratedCertificate({
      rawName: '012110597_39183_CERTIFICADO MEDICO DE APTITUD (GEMO Y ANEXO 16).pdf',
      nombreCompleto: 'JUAN PEREZ',
      tipoExamen: 'EMO',
    });
    expect(result).toBe('CAMO_JUAN PEREZ.pdf');
  });

  it('still requires a CLI certificate name for the ADICIONAL branch (non-cert passes through)', () => {
    const result = renameGeneratedCertificate({
      rawName: '012110597_39053_EVALUACION OFTALMOLOGICA.pdf',
      nombreCompleto: 'JUAN PEREZ',
      tipoExamen: 'ADICIONAL',
    });
    expect(result).toBe('012110597_39053_EVALUACION OFTALMOLOGICA.pdf');
  });
});

/**
 * `looksLikeGeneratedCertificate` (WU-2, design D5): the predicate the
 * use case will pair with `parseReadyFile` to decide whether a
 * delivery-name override MUST end in `.pdf` (forcePdf context). It must
 * answer exactly "would `renameGeneratedCertificate` rename this?" —
 * i.e. the same CLI_CERTIFICATE_PATTERN gate, exposed for reuse.
 */
describe('looksLikeGeneratedCertificate', () => {
  it('matches a CLI certificate report name', () => {
    expect(
      looksLikeGeneratedCertificate(
        '012110597_39183_CERTIFICADO MEDICO DE APTITUD (GEMO Y ANEXO 16).pdf',
      ),
    ).toBe(true);
  });

  it('rejects a CLI non-certificate report', () => {
    expect(looksLikeGeneratedCertificate('012110597_39053_EVALUACION OFTALMOLOGICA.pdf')).toBe(
      false,
    );
  });

  it('rejects a ready-style file (renameReadyFile\u0027s domain)', () => {
    expect(looksLikeGeneratedCertificate('75618561CERT.pdf')).toBe(false);
  });

  it('rejects an arbitrary user file', () => {
    expect(looksLikeGeneratedCertificate('informe.pdf')).toBe(false);
  });

  it('trims surrounding whitespace before matching', () => {
    expect(
      looksLikeGeneratedCertificate(
        '  012110597_39183_CERTIFICADO MEDICO DE APTITUD (GEMO Y ANEXO 16).pdf  ',
      ),
    ).toBe(true);
  });
});

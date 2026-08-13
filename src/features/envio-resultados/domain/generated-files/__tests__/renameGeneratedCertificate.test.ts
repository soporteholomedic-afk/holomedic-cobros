import { describe, expect, it } from 'vitest';
import { renameGeneratedCertificate } from '../renameGeneratedCertificate';

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
});

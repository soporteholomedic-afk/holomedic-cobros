import { describe, expect, it } from 'vitest';
import { renameReadyFile } from '../renameReadyFile';

describe('renameReadyFile', () => {
  it('renames a CERT file to CAMO format', () => {
    const result = renameReadyFile({
      rawName: '75618561CERT.pdf',
      nombreCompleto: 'JUAN PEREZ',
      destino: 'METRO LIMA 2',
    });
    expect(result).toBe('CAMO_JUAN PEREZ_METRO LIMA 2.pdf');
  });

  it('renames an EXPED file to EMO format', () => {
    const result = renameReadyFile({
      rawName: '012109975EXPED.pdf',
      nombreCompleto: 'MARIA GARCIA',
      destino: 'UNACEM',
    });
    expect(result).toBe('EMO_MARIA GARCIA_UNACEM.pdf');
  });

  it('does NOT rename a non-ready file', () => {
    const result = renameReadyFile({
      rawName: 'informe.pdf',
      nombreCompleto: 'JUAN',
      destino: 'DEST',
    });
    expect(result).toBe('informe.pdf');
  });

  it('does NOT rename a SiglaCLI file', () => {
    const result = renameReadyFile({
      rawName: '012110429_390417_CERTIFICADO APTITUD METRO LIMA 2.pdf',
      nombreCompleto: 'JUAN',
      destino: 'DEST',
    });
    expect(result).toBe('012110429_390417_CERTIFICADO APTITUD METRO LIMA 2.pdf');
  });

  it('returns the original name when nombreCompleto is empty', () => {
    const result = renameReadyFile({
      rawName: '75618561CERT.pdf',
      nombreCompleto: '',
      destino: 'DEST',
    });
    expect(result).toBe('75618561CERT.pdf');
  });

  it('returns the original name when nombreCompleto is whitespace-only', () => {
    const result = renameReadyFile({
      rawName: '75618561CERT.pdf',
      nombreCompleto: '   ',
      destino: 'DEST',
    });
    expect(result).toBe('75618561CERT.pdf');
  });

  it('falls back when destino is empty', () => {
    const result = renameReadyFile({
      rawName: '75618561CERT.pdf',
      nombreCompleto: 'JUAN',
      destino: '',
    });
    expect(result).toBe('CAMO_JUAN_SIN_DESTINO.pdf');
  });

  it('uses a custom fallback when destino is empty and emptyDestinoFallback is set', () => {
    const result = renameReadyFile({
      rawName: '75618561CERT.pdf',
      nombreCompleto: 'JUAN',
      destino: '',
      emptyDestinoFallback: 'NINGUNO',
    });
    expect(result).toBe('CAMO_JUAN_NINGUNO.pdf');
  });

  it('sanitizes illegal characters in nombreCompleto', () => {
    const result = renameReadyFile({
      rawName: '75618561CERT.pdf',
      nombreCompleto: 'JUAN/PEREZ\\OTRO',
      destino: 'TEST',
    });
    expect(result).toBe('CAMO_JUAN_PEREZ_OTRO_TEST.pdf');
  });

  it('sanitizes illegal characters in destino', () => {
    const result = renameReadyFile({
      rawName: '75618561CERT.pdf',
      nombreCompleto: 'JUAN',
      destino: 'UNACEM/CORP:LTD',
    });
    expect(result).toBe('CAMO_JUAN_UNACEM_CORP_LTD.pdf');
  });

  it('collapses whitespace runs and trims', () => {
    const result = renameReadyFile({
      rawName: '75618561CERT.pdf',
      nombreCompleto: '  JUAN   PEREZ  ',
      destino: '  UNACEM  ',
    });
    expect(result).toBe('CAMO_JUAN PEREZ_UNACEM.pdf');
  });

  it('handles accented and ñ characters in patient name', () => {
    const result = renameReadyFile({
      rawName: '75618561CERT.pdf',
      nombreCompleto: 'JOSÉ PEÑA',
      destino: 'CLÍNICA SANTA ISABEL',
    });
    expect(result).toBe('CAMO_JOSÉ PEÑA_CLÍNICA SANTA ISABEL.pdf');
  });
});

import { describe, expect, it } from 'vitest';
import { parseReadyFile } from '../parseReadyFile';

describe('parseReadyFile', () => {
  it.each([
    ['75618561CERT.pdf', 'CAMO', '75618561'],
    ['012109975EXPED.pdf', 'EMO', '012109975'],
    ['1CERT.pdf', 'CAMO', '1'],
    ['999999999999EXPED.pdf', 'EMO', '999999999999'],
  ])('parses a ready file with tipo and idAten (%s)', (name, expectedTipo, expectedIdAten) => {
    const result = parseReadyFile(name);
    expect(result).not.toBeNull();
    expect(result!.tipo).toBe(expectedTipo);
    expect(result!.idAten).toBe(expectedIdAten);
  });

  it.each([
    ['75618561cert.pdf', 'CAMO'],
    ['75618561Cert.pdf', 'CAMO'],
    ['75618561exped.PDF', 'EMO'],
    ['75618561EXPED.Pdf', 'EMO'],
  ])('is case-insensitive (%s)', (name, expectedTipo) => {
    const result = parseReadyFile(name);
    expect(result).not.toBeNull();
    expect(result!.tipo).toBe(expectedTipo);
  });

  it.each([
    'CERT.pdf',
    'EXPED.pdf',
    'CERT75618561.pdf',
    '75618561CERTIFICADO.pdf',
    '75618561CERT.PDF.bak',
    '75618561CERT.docx',
    '75618561CERT',
    'ABC75618561CERT.pdf',
    '75618561 CERT.pdf',
    '75618561-CERT.pdf',
    '75618561OTHER.pdf',
    '',
  ])('rejects names that do not match the strict pattern (%s)', (name) => {
    expect(parseReadyFile(name)).toBeNull();
  });

  it('trims surrounding whitespace before matching', () => {
    const result = parseReadyFile('  75618561CERT.pdf  ');
    expect(result).not.toBeNull();
    expect(result!.tipo).toBe('CAMO');
    expect(result!.idAten).toBe('75618561');
  });
});

import { describe, expect, it } from 'vitest';
import { isReadyFile } from '../isReadyFile';

describe('isReadyFile', () => {
  it.each([
    '75618561CERT.pdf',
    '012109975EXPED.pdf',
    '1CERT.pdf',
    '999999999999EXPED.pdf',
  ])('matches a "{digits}CERT.pdf" or "{digits}EXPED.pdf" file (%s)', (name) => {
    expect(isReadyFile(name)).toBe(true);
  });

  it.each([
    '75618561cert.pdf',
    '75618561Cert.pdf',
    '75618561exped.PDF',
    '75618561EXPED.Pdf',
  ])('is case-insensitive (%s)', (name) => {
    expect(isReadyFile(name)).toBe(true);
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
    expect(isReadyFile(name)).toBe(false);
  });

  it('trims surrounding whitespace before matching', () => {
    expect(isReadyFile('  75618561CERT.pdf  ')).toBe(true);
  });
});

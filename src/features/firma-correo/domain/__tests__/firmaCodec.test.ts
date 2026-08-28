import { describe, it, expect } from 'vitest';

import type { FirmaCorreo } from '../entities';
import { decodeFirma, encodeFirma } from '../firmaCodec';

/**
 * Pure unit tests for the firma JSON codec (editor-firmas task 1.3).
 * The signature row serializes the five fields as JSON in the
 * `bodyHtml` column of dbo.templates (locked decision D3 — zero
 * migration). `decodeFirma` is the read-side safety boundary: ANY
 * failure (corrupt JSON, wrong shape, stale row violating current
 * rules) degrades to `null` = no-signature, never a crash (threat
 * TM6).
 */
const VALID_FIRMA: FirmaCorreo = {
  nombre: 'Blanca Chirinos',
  area: 'Consolidados',
  correo: 'blanca@holomedic.com.pe',
  telefono: '+51 989 211 757',
  anexo: '303',
};

describe('encodeFirma', () => {
  it('serializes the five fields as JSON with a v:1 envelope', () => {
    const parsed: unknown = JSON.parse(encodeFirma(VALID_FIRMA));
    expect(parsed).toEqual({ v: 1, ...VALID_FIRMA });
  });
});

describe('decodeFirma — happy path', () => {
  it('roundtrips an encoded firma back to the same values', () => {
    expect(decodeFirma(encodeFirma(VALID_FIRMA))).toEqual(VALID_FIRMA);
  });

  it('accepts a hand-written JSON payload with the five string fields', () => {
    const bodyHtml = JSON.stringify({
      v: 1,
      nombre: 'Blanca Chirinos',
      area: 'Consolidados',
      correo: 'blanca@holomedic.com.pe',
      telefono: '',
      anexo: '',
    });
    expect(decodeFirma(bodyHtml)).toEqual({
      nombre: 'Blanca Chirinos',
      area: 'Consolidados',
      correo: 'blanca@holomedic.com.pe',
      telefono: '',
      anexo: '',
    });
  });

  it('trims field values through current validation on decode', () => {
    const bodyHtml = JSON.stringify({ v: 1, ...VALID_FIRMA, area: '  Consolidados  ' });
    expect(decodeFirma(bodyHtml)?.area).toBe('Consolidados');
  });

  it('tolerates unknown extra keys (forward compatibility)', () => {
    const bodyHtml = JSON.stringify({ v: 1, ...VALID_FIRMA, futureField: 'x' });
    expect(decodeFirma(bodyHtml)).toEqual(VALID_FIRMA);
  });
});

describe('decodeFirma — corrupt JSON (TM6)', () => {
  it('treats corrupt stored JSON as no signature without crashing', () => {
    expect(decodeFirma('{"v":1,"nombre":"Blanca')).toBeNull();
  });

  it('treats empty and blank strings as no signature', () => {
    expect(decodeFirma('')).toBeNull();
    expect(decodeFirma('   ')).toBeNull();
  });

  it('treats plain text (not JSON) as no signature', () => {
    expect(decodeFirma('texto plano del historial')).toBeNull();
  });
});

describe('decodeFirma — wrong shape', () => {
  it('rejects a parsed non-object (string, number, null, array)', () => {
    expect(decodeFirma('"hola"')).toBeNull();
    expect(decodeFirma('42')).toBeNull();
    expect(decodeFirma('null')).toBeNull();
    expect(decodeFirma('[]')).toBeNull();
  });

  it('rejects an object missing a field', () => {
    const bodyHtml = JSON.stringify({
      v: 1,
      nombre: 'Blanca Chirinos',
      area: 'Consolidados',
      correo: 'blanca@holomedic.com.pe',
      telefono: '',
      // anexo missing
    });
    expect(decodeFirma(bodyHtml)).toBeNull();
  });

  it('rejects an object with a non-string field', () => {
    const bodyHtml = JSON.stringify({ ...VALID_FIRMA, anexo: 303 });
    expect(decodeFirma(bodyHtml)).toBeNull();
  });
});

describe('decodeFirma — stale row vs current rules', () => {
  it('returns null when a well-shaped row fails current validation', () => {
    // Stored before a rules change: nombre shorter than the current 2-char minimum.
    const bodyHtml = JSON.stringify({ ...VALID_FIRMA, nombre: 'A' });
    expect(decodeFirma(bodyHtml)).toBeNull();
  });

  it('returns null when the stored correo violates the current format', () => {
    const bodyHtml = JSON.stringify({ ...VALID_FIRMA, correo: 'no-es-correo' });
    expect(decodeFirma(bodyHtml)).toBeNull();
  });
});

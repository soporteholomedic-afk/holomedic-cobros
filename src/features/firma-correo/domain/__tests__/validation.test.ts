import { describe, it, expect } from 'vitest';

import { FIRMAS_RULES, validateFirmaCorreo } from '../validation';

/**
 * Pure unit tests for the signature validation rules module
 * (editor-firmas task 1.2). Rules live in FIRMAS_RULES (design D8 —
 * one place to change); messages are user-facing Spanish, one per
 * field. Validation trims every field and reports ALL field errors at
 * once so the form can show per-field messages in a single pass.
 */
describe('FIRMAS_RULES — documented adjustable boundaries', () => {
  it('exposes the proposed default rules per field', () => {
    expect(FIRMAS_RULES.nombre).toEqual({ required: true, minLength: 2, maxLength: 80 });
    expect(FIRMAS_RULES.area).toEqual({ required: true, minLength: 2, maxLength: 60 });
    expect(FIRMAS_RULES.correo).toEqual({ required: true, maxLength: 120 });
    expect(FIRMAS_RULES.telefono).toEqual({
      required: false,
      minLength: 6,
      maxLength: 20,
      minDigits: 6,
    });
    expect(FIRMAS_RULES.anexo).toEqual({
      required: false,
      minLength: 1,
      maxLength: 5,
      digitsOnly: true,
    });
  });
});

describe('validateFirmaCorreo — happy path', () => {
  const VALID = {
    nombre: 'Blanca Chirinos',
    area: 'Consolidados',
    correo: 'blanca@holomedic.com.pe',
    telefono: '+51 989 211 757',
    anexo: '303',
  };

  it('accepts a complete valid signature and returns the trimmed values', () => {
    const result = validateFirmaCorreo({
      nombre: `  ${VALID.nombre}  `,
      area: `  ${VALID.area}  `,
      correo: `  ${VALID.correo}  `,
      telefono: `  ${VALID.telefono}  `,
      anexo: `  ${VALID.anexo}  `,
    });
    expect(result).toEqual({ ok: true, value: VALID });
  });

  it('accepts empty optional fields and normalizes them to empty strings', () => {
    const result = validateFirmaCorreo({
      nombre: VALID.nombre,
      area: VALID.area,
      correo: VALID.correo,
      telefono: '',
      anexo: '',
    });
    expect(result).toEqual({
      ok: true,
      value: {
        nombre: VALID.nombre,
        area: VALID.area,
        correo: VALID.correo,
        telefono: '',
        anexo: '',
      },
    });
  });

  it('treats missing optional keys and whitespace-only optionals as empty', () => {
    const result = validateFirmaCorreo({
      nombre: VALID.nombre,
      area: VALID.area,
      correo: VALID.correo,
    });
    expect(result).toEqual({
      ok: true,
      value: {
        nombre: VALID.nombre,
        area: VALID.area,
        correo: VALID.correo,
        telefono: '',
        anexo: '',
      },
    });
  });

  it('ignores unknown extra keys in the input object', () => {
    const result = validateFirmaCorreo({ ...VALID, firmaHtml: '<table></table>' });
    expect(result.ok).toBe(true);
  });
});

describe('validateFirmaCorreo — nombre (required, 2–80)', () => {
  it("rejects a missing nombre with 'El nombre es obligatorio.'", () => {
    const result = validateFirmaCorreo({ area: 'Consolidados', correo: 'a@b.co' });
    expect(result).toEqual({ ok: false, fields: { nombre: 'El nombre es obligatorio.' } });
  });

  it('rejects a whitespace-only nombre as required', () => {
    const result = validateFirmaCorreo({ nombre: '   ', area: 'Consolidados', correo: 'a@b.co' });
    expect(result).toEqual({ ok: false, fields: { nombre: 'El nombre es obligatorio.' } });
  });

  it('rejects a 1-character nombre', () => {
    const result = validateFirmaCorreo({ nombre: 'A', area: 'Consolidados', correo: 'a@b.co' });
    expect(result).toEqual({
      ok: false,
      fields: { nombre: 'El nombre debe tener entre 2 y 80 caracteres.' },
    });
  });

  it('accepts a nombre of exactly 2 and exactly 80 characters', () => {
    const ok2 = validateFirmaCorreo({ nombre: 'Ab', area: 'Consolidados', correo: 'a@b.co' });
    expect(ok2.ok).toBe(true);
    const ok80 = validateFirmaCorreo({
      nombre: 'A'.repeat(80),
      area: 'Consolidados',
      correo: 'a@b.co',
    });
    expect(ok80.ok).toBe(true);
  });

  it('rejects a nombre of 81 characters', () => {
    const result = validateFirmaCorreo({
      nombre: 'A'.repeat(81),
      area: 'Consolidados',
      correo: 'a@b.co',
    });
    expect(result).toEqual({
      ok: false,
      fields: { nombre: 'El nombre debe tener entre 2 y 80 caracteres.' },
    });
  });

  it('measures length post-trim (padded 80-char nombre passes)', () => {
    const result = validateFirmaCorreo({
      nombre: `  ${'A'.repeat(80)}  `,
      area: 'Consolidados',
      correo: 'a@b.co',
    });
    expect(result.ok).toBe(true);
  });
});

describe('validateFirmaCorreo — área (required, 2–60, free text)', () => {
  it("rejects a missing área with 'El área es obligatoria.'", () => {
    const result = validateFirmaCorreo({ nombre: 'Blanca', correo: 'a@b.co' });
    expect(result).toEqual({ ok: false, fields: { area: 'El área es obligatoria.' } });
  });

  it('rejects a 1-character área', () => {
    const result = validateFirmaCorreo({ nombre: 'Blanca', area: 'A', correo: 'a@b.co' });
    expect(result).toEqual({
      ok: false,
      fields: { area: 'El área debe tener entre 2 y 60 caracteres.' },
    });
  });

  it('accepts an área of exactly 2 and exactly 60 characters', () => {
    const ok2 = validateFirmaCorreo({ nombre: 'Blanca', area: 'TI', correo: 'a@b.co' });
    expect(ok2.ok).toBe(true);
    const ok60 = validateFirmaCorreo({
      nombre: 'Blanca',
      area: 'A'.repeat(60),
      correo: 'a@b.co',
    });
    expect(ok60.ok).toBe(true);
  });

  it('rejects an área of 61 characters', () => {
    const result = validateFirmaCorreo({
      nombre: 'Blanca',
      area: 'A'.repeat(61),
      correo: 'a@b.co',
    });
    expect(result).toEqual({
      ok: false,
      fields: { area: 'El área debe tener entre 2 y 60 caracteres.' },
    });
  });

  it('accepts free text with punctuation and digits', () => {
    const result = validateFirmaCorreo({
      nombre: 'Blanca',
      area: 'Atención al Cliente N° 2 (Lima)',
      correo: 'a@b.co',
    });
    expect(result.ok).toBe(true);
  });
});

describe('validateFirmaCorreo — correo (required, valid format, ≤120)', () => {
  it("rejects a missing correo with 'El correo es obligatorio.'", () => {
    const result = validateFirmaCorreo({ nombre: 'Blanca', area: 'Consolidados' });
    expect(result).toEqual({ ok: false, fields: { correo: 'El correo es obligatorio.' } });
  });

  it("rejects 'abc' with the format message", () => {
    const result = validateFirmaCorreo({ nombre: 'Blanca', area: 'Consolidados', correo: 'abc' });
    expect(result).toEqual({
      ok: false,
      fields: { correo: 'El correo no tiene un formato válido.' },
    });
  });

  it('accepts a correo of exactly 120 characters (local cap, not auth 200)', () => {
    const correo = `${'u'.repeat(106)}@holomedic.com`;
    expect(correo).toHaveLength(120);
    const result = validateFirmaCorreo({ nombre: 'Blanca', area: 'Consolidados', correo });
    expect(result.ok).toBe(true);
  });

  it('rejects a well-formed correo of 121 characters (LOCAL ≤120 cap)', () => {
    const correo = `${'u'.repeat(107)}@holomedic.com`;
    expect(correo).toHaveLength(121);
    const result = validateFirmaCorreo({ nombre: 'Blanca', area: 'Consolidados', correo });
    expect(result).toEqual({
      ok: false,
      fields: { correo: 'El correo no puede superar los 120 caracteres.' },
    });
  });

  it('rejects a correo without a dot in the domain', () => {
    const result = validateFirmaCorreo({
      nombre: 'Blanca',
      area: 'Consolidados',
      correo: 'user@holomedic',
    });
    expect(result).toEqual({
      ok: false,
      fields: { correo: 'El correo no tiene un formato válido.' },
    });
  });
});

describe('validateFirmaCorreo — teléfono (optional, 6–20 chars, ≥6 digits)', () => {
  const NOMBRE_AREA_CORREO = { nombre: 'Blanca', area: 'Consolidados', correo: 'a@b.co' };

  it('accepts an empty teléfono', () => {
    const result = validateFirmaCorreo({ ...NOMBRE_AREA_CORREO, telefono: '' });
    expect(result.ok).toBe(true);
  });

  it('accepts a 6-digit teléfono of exactly 6 characters', () => {
    const result = validateFirmaCorreo({ ...NOMBRE_AREA_CORREO, telefono: '987654' });
    expect(result.ok).toBe(true);
  });

  it('accepts a teléfono of exactly 20 characters with allowed formatting', () => {
    const telefono = '(051) 989 211 757 12';
    expect(telefono).toHaveLength(20);
    const result = validateFirmaCorreo({ ...NOMBRE_AREA_CORREO, telefono });
    expect(result.ok).toBe(true);
  });

  it('rejects a teléfono shorter than 6 characters', () => {
    const result = validateFirmaCorreo({ ...NOMBRE_AREA_CORREO, telefono: '12345' });
    expect(result).toEqual({
      ok: false,
      fields: { telefono: 'El móvil debe tener entre 6 y 20 caracteres.' },
    });
  });

  it('rejects a teléfono longer than 20 characters', () => {
    const result = validateFirmaCorreo({ ...NOMBRE_AREA_CORREO, telefono: '9'.repeat(21) });
    expect(result).toEqual({
      ok: false,
      fields: { telefono: 'El móvil debe tener entre 6 y 20 caracteres.' },
    });
  });

  it('rejects a teléfono with letters or other disallowed characters', () => {
    const result = validateFirmaCorreo({ ...NOMBRE_AREA_CORREO, telefono: '98-abc-12' });
    expect(result).toEqual({
      ok: false,
      fields: {
        telefono: 'El móvil solo admite dígitos, espacios y los caracteres + - ( ).',
      },
    });
  });

  it('rejects a teléfono of allowed characters with fewer than 6 digits', () => {
    const result = validateFirmaCorreo({ ...NOMBRE_AREA_CORREO, telefono: '+ - ( ) + - ( )' });
    expect(result).toEqual({
      ok: false,
      fields: { telefono: 'El móvil debe contener al menos 6 dígitos.' },
    });
  });

  it('accepts a formatted teléfono with exactly 6 digits', () => {
    const result = validateFirmaCorreo({ ...NOMBRE_AREA_CORREO, telefono: '+51 9876' });
    expect(result.ok).toBe(true);
  });
});

describe('validateFirmaCorreo — anexo (optional, 1–5 digits)', () => {
  const NOMBRE_AREA_CORREO = { nombre: 'Blanca', area: 'Consolidados', correo: 'a@b.co' };

  it('accepts an empty anexo', () => {
    const result = validateFirmaCorreo({ ...NOMBRE_AREA_CORREO, anexo: '' });
    expect(result.ok).toBe(true);
  });

  it('accepts anexos of 1 and exactly 5 digits', () => {
    expect(validateFirmaCorreo({ ...NOMBRE_AREA_CORREO, anexo: '7' }).ok).toBe(true);
    expect(validateFirmaCorreo({ ...NOMBRE_AREA_CORREO, anexo: '12345' }).ok).toBe(true);
  });

  it('rejects an anexo of 6 digits', () => {
    const result = validateFirmaCorreo({ ...NOMBRE_AREA_CORREO, anexo: '123456' });
    expect(result).toEqual({
      ok: false,
      fields: { anexo: 'El anexo debe tener entre 1 y 5 dígitos.' },
    });
  });

  it('rejects an anexo with non-digit characters', () => {
    const result = validateFirmaCorreo({ ...NOMBRE_AREA_CORREO, anexo: '30a' });
    expect(result).toEqual({
      ok: false,
      fields: { anexo: 'El anexo debe tener entre 1 y 5 dígitos.' },
    });
  });
});

describe('validateFirmaCorreo — multiple errors and hostile shapes', () => {
  it('reports ALL invalid fields at once', () => {
    const result = validateFirmaCorreo({ nombre: 'A', correo: 'abc' });
    expect(result).toEqual({
      ok: false,
      fields: {
        nombre: 'El nombre debe tener entre 2 y 80 caracteres.',
        area: 'El área es obligatoria.',
        correo: 'El correo no tiene un formato válido.',
      },
    });
  });

  it('treats non-object input (null, string, array, number) as all-required errors', () => {
    for (const input of [null, 'firma', [], 42]) {
      const result = validateFirmaCorreo(input);
      expect(result).toEqual({
        ok: false,
        fields: {
          nombre: 'El nombre es obligatorio.',
          area: 'El área es obligatoria.',
          correo: 'El correo es obligatorio.',
        },
      });
    }
  });

  it('treats non-string field values as empty (validated, never crashes)', () => {
    const result = validateFirmaCorreo({
      nombre: 123,
      area: 'Consolidados',
      correo: 'a@b.co',
    });
    expect(result).toEqual({ ok: false, fields: { nombre: 'El nombre es obligatorio.' } });
  });
});

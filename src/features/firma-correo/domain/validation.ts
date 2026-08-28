import { isValidCorreo } from '@/features/auth/domain/correo';

import type { CampoFirma, FirmaCorreo } from './entities';

/**
 * Adjustable validation defaults for the five signature fields
 * (editor-firmas task 1.2 — design D8: ONE place to change rules).
 *
 * Proposed defaults per spec (user-adjustable):
 * - nombre:  required, trimmed, 2–80 chars
 * - area:    required, trimmed, 2–60 chars, free text
 * - correo:  required, format per auth `isValidCorreo` (reused pure
 *            leaf) + LOCAL ≤120 cap (auth caps at 200 for its own
 *            NVARCHAR(200) column; the signature bound is stricter)
 * - telefono: optional; 6–20 chars of digits/spaces/`+ - ( )` with
 *             at least 6 digits
 * - anexo:   optional; 1–5 digits
 */
export const FIRMAS_RULES = {
  nombre: { required: true, minLength: 2, maxLength: 80 },
  area: { required: true, minLength: 2, maxLength: 60 },
  correo: { required: true, maxLength: 120 },
  telefono: { required: false, minLength: 6, maxLength: 20, minDigits: 6 },
  anexo: { required: false, minLength: 1, maxLength: 5, digitsOnly: true },
} as const;

/** Characters allowed in the optional teléfono field. */
const TELEFONO_ALLOWED_PATTERN = /^[0-9 +\-()]+$/;

/** Per-field Spanish messages — user-facing, shown verbatim by the form. */
const MENSAJES = {
  nombre: {
    obligatorio: 'El nombre es obligatorio.',
    longitud: 'El nombre debe tener entre 2 y 80 caracteres.',
  },
  area: {
    obligatorio: 'El área es obligatoria.',
    longitud: 'El área debe tener entre 2 y 60 caracteres.',
  },
  correo: {
    obligatorio: 'El correo es obligatorio.',
    longitud: 'El correo no puede superar los 120 caracteres.',
    formato: 'El correo no tiene un formato válido.',
  },
  telefono: {
    longitud: 'El móvil debe tener entre 6 y 20 caracteres.',
    caracteres: 'El móvil solo admite dígitos, espacios y los caracteres + - ( ).',
    digitos: 'El móvil debe contener al menos 6 dígitos.',
  },
  anexo: {
    digitos: 'El anexo debe tener entre 1 y 5 dígitos.',
  },
} as const;

/** Validation outcome: a trimmed valid entity, or per-field errors. */
export type FirmaValidationResult =
  | { ok: true; value: FirmaCorreo }
  | { ok: false; fields: Partial<Record<CampoFirma, string>> };

/**
 * Read a field as a plain string. Non-object inputs and non-string
 * values degrade to '' (validated downstream as missing) so a hostile
 * body never crashes validation — it simply fails it.
 */
function rawString(input: unknown, campo: CampoFirma): string {
  if (typeof input !== 'object' || input === null) return '';
  const record = input as Record<string, unknown>;
  const value = record[campo];
  return typeof value === 'string' ? value : '';
}

/** Count of digit characters in a string. */
function digitCount(value: string): number {
  return value.replace(/\D/g, '').length;
}

/**
 * Validate a signature candidate. Trims every field, applies the
 * FIRMAS_RULES boundaries and returns ALL field errors at once (the
 * form renders per-field messages in a single pass). Optional fields
 * normalize to '' — missing keys and whitespace-only values are
 * equivalent.
 */
export function validateFirmaCorreo(input: unknown): FirmaValidationResult {
  const value: FirmaCorreo = {
    nombre: rawString(input, 'nombre').trim(),
    area: rawString(input, 'area').trim(),
    correo: rawString(input, 'correo').trim(),
    telefono: rawString(input, 'telefono').trim(),
    anexo: rawString(input, 'anexo').trim(),
  };

  const fields: Partial<Record<CampoFirma, string>> = {};

  if (value.nombre === '') {
    fields.nombre = MENSAJES.nombre.obligatorio;
  } else if (
    value.nombre.length < FIRMAS_RULES.nombre.minLength ||
    value.nombre.length > FIRMAS_RULES.nombre.maxLength
  ) {
    fields.nombre = MENSAJES.nombre.longitud;
  }

  if (value.area === '') {
    fields.area = MENSAJES.area.obligatorio;
  } else if (
    value.area.length < FIRMAS_RULES.area.minLength ||
    value.area.length > FIRMAS_RULES.area.maxLength
  ) {
    fields.area = MENSAJES.area.longitud;
  }

  if (value.correo === '') {
    fields.correo = MENSAJES.correo.obligatorio;
  } else if (value.correo.length > FIRMAS_RULES.correo.maxLength) {
    fields.correo = MENSAJES.correo.longitud;
  } else if (!isValidCorreo(value.correo)) {
    fields.correo = MENSAJES.correo.formato;
  }

  if (value.telefono !== '') {
    if (
      value.telefono.length < FIRMAS_RULES.telefono.minLength ||
      value.telefono.length > FIRMAS_RULES.telefono.maxLength
    ) {
      fields.telefono = MENSAJES.telefono.longitud;
    } else if (!TELEFONO_ALLOWED_PATTERN.test(value.telefono)) {
      fields.telefono = MENSAJES.telefono.caracteres;
    } else if (digitCount(value.telefono) < FIRMAS_RULES.telefono.minDigits) {
      fields.telefono = MENSAJES.telefono.digitos;
    }
  }

  if (value.anexo !== '' && !/^\d{1,5}$/.test(value.anexo)) {
    fields.anexo = MENSAJES.anexo.digitos;
  }

  if (Object.keys(fields).length > 0) {
    return { ok: false, fields };
  }
  return { ok: true, value };
}

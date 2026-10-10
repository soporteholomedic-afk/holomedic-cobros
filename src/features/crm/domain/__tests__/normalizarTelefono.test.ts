import { describe, expect, it } from 'vitest';

import {
  normalizarTelefonoE164,
  telefonoDigitosClave,
  telefonosCoinciden,
} from '../normalizar';

/**
 * E.164 Paraguay normalization (agente-ia-crm E1 — riesgo 2: free-text
 * phones → canonical key for the CRM_Conversaciones.telefono unique
 * index and the CRM_Contactos vinculación match). Pure rules: every
 * unparsable shape must return null, never throw.
 */
describe('normalizarTelefonoE164 — free text → E.164 Paraguay', () => {
  it('PY móvil con 0: "0981 234 567" → "+595981234567"', () => {
    expect(normalizarTelefonoE164('0981 234 567')).toBe('+595981234567');
    expect(normalizarTelefonoE164('0981 234-567')).toBe('+595981234567');
  });

  it('PY móvil sin 0 (9 dígitos): "981234567" → "+595981234567"', () => {
    expect(normalizarTelefonoE164('981234567')).toBe('+595981234567');
  });

  it('PY móvil sin 0 de 10 dígitos también es válido', () => {
    expect(normalizarTelefonoE164('9812345678')).toBe('+5959812345678');
  });

  it('PY fijo con 0: "0211234567" → "+595211234567"', () => {
    expect(normalizarTelefonoE164('0211234567')).toBe('+595211234567');
  });

  it('PY fijo sin 0 (7-8 dígitos empezando en 2/3): "29112345" → "+59529112345"', () => {
    expect(normalizarTelefonoE164('29112345')).toBe('+59529112345');
    expect(normalizarTelefonoE164('3312345')).toBe('+5953312345');
  });

  it('"+595..." ya normalizado queda idéntico', () => {
    expect(normalizarTelefonoE164('+595981234567')).toBe('+595981234567');
  });

  it('prefijo internacional 00: "00595981234567" → "+595981234567"', () => {
    expect(normalizarTelefonoE164('00595981234567')).toBe('+595981234567');
    expect(normalizarTelefonoE164('00 595 981 234 567')).toBe('+595981234567');
  });

  it('espacios, guiones, paréntesis y puntos se limpian antes de clasificar', () => {
    expect(normalizarTelefonoE164('(0981) 234-567')).toBe('+595981234567');
    expect(normalizarTelefonoE164('+595.981.234.567')).toBe('+595981234567');
    expect(normalizarTelefonoE164(' 021 123-4567 ')).toBe('+595211234567');
  });

  it('basura → null, nunca lanza', () => {
    expect(normalizarTelefonoE164('hola')).toBeNull();
    expect(normalizarTelefonoE164('')).toBeNull();
    expect(normalizarTelefonoE164('   ')).toBeNull();
    expect(normalizarTelefonoE164('()-')).toBeNull();
    expect(normalizarTelefonoE164('+12')).toBeNull();
    expect(normalizarTelefonoE164('00595')).toBeNull();
    expect(normalizarTelefonoE164('12345')).toBeNull();
  });

  it('+XXX de 15 dígitos exactos es válido; 16 no', () => {
    expect(normalizarTelefonoE164('+595981234567890')).toBe('+595981234567890');
    expect(normalizarTelefonoE164('+5959812345678901')).toBeNull();
  });

  it('dígitos sueltos sin regla PY aplicable → null', () => {
    expect(normalizarTelefonoE164('595981234567')).toBeNull();
    expect(normalizarTelefonoE164('45678901')).toBeNull();
    expect(normalizarTelefonoE164('0')).toBeNull();
  });
});

describe('telefonoDigitosClave — clave de matching sin "+"', () => {
  it('"+595981234567" → "595981234567"', () => {
    expect(telefonoDigitosClave('+595981234567')).toBe('595981234567');
  });

  it('también limpia texto libre a puros dígitos', () => {
    expect(telefonoDigitosClave('(0981) 234-567')).toBe('0981234567');
  });
});

describe('telefonosCoinciden — teléfono libre de CRM_Contactos ≡ E.164', () => {
  it('"0981 234-567" ≡ "+595981234567" (ambos lados normalizados a clave)', () => {
    expect(telefonosCoinciden('0981 234-567', '+595981234567')).toBe(true);
    expect(telefonosCoinciden('+595981234567', '0981 234-567')).toBe(true);
  });

  it('números distintos no coinciden; basura nunca coincide', () => {
    expect(telefonosCoinciden('0981111111', '+595981234567')).toBe(false);
    expect(telefonosCoinciden('hola', '+595981234567')).toBe(false);
    expect(telefonosCoinciden('0981 234 567', '')).toBe(false);
  });
});

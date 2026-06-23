import { describe, it, expect } from 'vitest';
import {
  TRANSIENT_AUTH_ERROR_CLAUSE,
  isTransientAuthError,
} from '../matchTransientAuthError';

const FULL_ERROR_MESSAGE =
  'El sistema no puede ponerse en contacto con un controlador de dominio para que atienda la solicitud de autenticación. Inténtelo de nuevo más tarde.';

describe('isTransientAuthError — REQ-1 matcher', () => {
  // ---- T1: substring match (full message; clause at start/middle/end) ----

  it('matches the full Spanish error message from Crystal Reports', () => {
    expect(isTransientAuthError(FULL_ERROR_MESSAGE)).toBe(true);
  });

  it('matches when the clause appears at the start of the string', () => {
    expect(isTransientAuthError(TRANSIENT_AUTH_ERROR_CLAUSE + ' ...rest')).toBe(true);
  });

  it('matches when the clause appears in the middle of the string', () => {
    expect(isTransientAuthError('prefix: ' + TRANSIENT_AUTH_ERROR_CLAUSE + ' :suffix')).toBe(true);
  });

  it('matches when the clause appears at the end of the string', () => {
    expect(isTransientAuthError('something went wrong: ' + TRANSIENT_AUTH_ERROR_CLAUSE)).toBe(true);
  });

  it('matches when the reason IS exactly the clause (no surrounding text)', () => {
    expect(isTransientAuthError(TRANSIENT_AUTH_ERROR_CLAUSE)).toBe(true);
  });

  // ---- T2: non-match (different failure; null/undefined/empty) ----

  it('does not match a different Crystal Reports failure', () => {
    expect(isTransientAuthError('El informe no tiene tablas.')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isTransientAuthError(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isTransientAuthError(undefined)).toBe(false);
  });

  it('returns false for the empty string', () => {
    expect(isTransientAuthError('')).toBe(false);
  });

  it('does not match a similar but different message (plural "dominios")', () => {
    // The clause is singular "controlador de dominio". A message using
    // the plural "controladores de dominios" must NOT match — the
    // matcher is a literal substring, not a fuzzy/regex match.
    expect(
      isTransientAuthError(
        'El sistema no puede ponerse en contacto con controladores de dominios para autenticar.',
      ),
    ).toBe(false);
  });

  // ---- T3: case sensitivity ----

  it('returns false for the lowercase clause (case-sensitive match)', () => {
    expect(
      isTransientAuthError(
        'el sistema no puede ponerse en contacto con un controlador de dominio',
      ),
    ).toBe(false);
  });

  // ---- TRIANGULATE: edge cases ----

  it('matches inside a very long string (clause repeated 10x)', () => {
    const long = TRANSIENT_AUTH_ERROR_CLAUSE.repeat(10);
    expect(isTransientAuthError(long)).toBe(true);
  });

  it('does not match a long string without the clause', () => {
    const long = 'x'.repeat(10_000);
    expect(isTransientAuthError(long)).toBe(false);
  });

  it('is a pure function — no side effects on the input', () => {
    const input = FULL_ERROR_MESSAGE;
    isTransientAuthError(input);
    expect(input).toBe(FULL_ERROR_MESSAGE);
  });
});

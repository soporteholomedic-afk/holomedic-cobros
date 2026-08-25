import { describe, it, expect } from 'vitest';

import { CORREO_MAX_LENGTH, CORREO_PATTERN, isValidCorreo } from '../correo';

/**
 * Pure unit tests for the correo value validation module
 * (usuarios-correo, task 2.2). The pattern and max length mirror the
 * send-email route precedent (design D1): practical email format,
 * NVARCHAR(200) storage bound enforced post-trim.
 */
describe('domain/correo — isValidCorreo', () => {
  it('exports the documented constants', () => {
    expect(CORREO_MAX_LENGTH).toBe(200);
    expect(CORREO_PATTERN.source).toBe('^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$');
  });

  it('accepts a plain valid correo', () => {
    expect(isValidCorreo('usuario@holomedic.com')).toBe(true);
  });

  it('accepts correos with dots and subdomains (triangulation)', () => {
    expect(isValidCorreo('first.last@correo.holomedic.com')).toBe(true);
    expect(isValidCorreo('a@b.co')).toBe(true);
  });

  it("rejects 'no-es-mail' (no @ separator)", () => {
    expect(isValidCorreo('no-es-mail')).toBe(false);
  });

  it("rejects 'a@' (empty domain)", () => {
    expect(isValidCorreo('a@')).toBe(false);
  });

  it('rejects a correo without a dot in the domain', () => {
    expect(isValidCorreo('user@holomedic')).toBe(false);
  });

  it('rejects a correo with inner whitespace', () => {
    expect(isValidCorreo('user name@holomedic.com')).toBe(false);
  });

  it('accepts a correo of exactly 200 characters', () => {
    // 200 - '@holomedic.com' (14) = 186-char local part.
    const correo = `${'u'.repeat(186)}@holomedic.com`;
    expect(correo).toHaveLength(200);
    expect(isValidCorreo(correo)).toBe(true);
  });

  it('rejects a correo of 201 characters', () => {
    const correo = `${'u'.repeat(187)}@holomedic.com`;
    expect(correo).toHaveLength(201);
    expect(isValidCorreo(correo)).toBe(false);
  });

  it('measures length post-trim (padded 200-char correo passes)', () => {
    const correo = `${'u'.repeat(186)}@holomedic.com`;
    expect(isValidCorreo(`  ${correo}  `)).toBe(true);
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { signJwt, verifyJwt, getAuthCookieOptions, COOKIE_NAME } from '../auth';

describe('auth utilities', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('JWT functions', () => {
    const payload = {
      sub: 'admin-001',
      nombre: 'soporte',
      area: 'admin',
      permisos: ['admin', 'cobranza'],
    };

    it('signs and verifies a valid JWT payload', () => {
      const token = signJwt(payload);
      expect(typeof token).toBe('string');

      const verified = verifyJwt(token);
      expect(verified).not.toBeNull();
      expect(verified?.sub).toBe(payload.sub);
      expect(verified?.nombre).toBe(payload.nombre);
      expect(verified?.area).toBe(payload.area);
      expect(verified?.permisos).toEqual(payload.permisos);
    });

    it('returns null for an invalid JWT token', () => {
      expect(verifyJwt('invalid.token.here')).toBeNull();
    });
  });

  describe('getAuthCookieOptions', () => {
    it('defaults to secure: false when COOKIE_SECURE is not set', () => {
      delete process.env.COOKIE_SECURE;
      const options = getAuthCookieOptions();

      expect(options).toEqual({
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
        maxAge: 28800,
      });
    });

    it('sets secure: true when COOKIE_SECURE is "true"', () => {
      process.env.COOKIE_SECURE = 'true';
      const options = getAuthCookieOptions();

      expect(options.secure).toBe(true);
    });

    it('respects custom maxAge parameter', () => {
      const options = getAuthCookieOptions(0);
      expect(options.maxAge).toBe(0);
    });

    it('exports COOKIE_NAME as "token"', () => {
      expect(COOKIE_NAME).toBe('token');
    });
  });
});

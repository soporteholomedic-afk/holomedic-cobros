/**
 * Tests for the bare `/configuracion` redirect page (feature
 * `configuracion-tabs`).
 *
 * The page renders NO content: it routes each visitor like the sidebar
 * would —
 *  - no session      → /auth/login?redirect=%2Fconfiguracion (TM1)
 *  - `admin`         → /configuracion/usuarios
 *  - `firma_correo`  → /configuracion/firma
 *  - neither         → /auth/denegado with the proxy's exact params
 *
 * Mock fidelity: the `next/navigation` redirect mock THROWS like the
 * real implementation (NEXT_REDIRECT) so the page's control flow — a
 * redirect terminates the render — is exercised (canonical
 * /admin/plantillas/firma test precedent).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

const getSessionMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth', () => ({
  getSession: getSessionMock,
}));

import ConfiguracionRedirectPage from '../page';

describe('bare /configuracion page — session-aware redirect', () => {
  beforeEach(() => {
    redirectMock.mockClear();
    getSessionMock.mockReset();
  });

  it('sin sesión → login con redirect param (TM1)', async () => {
    getSessionMock.mockResolvedValue(null);
    await expect(ConfiguracionRedirectPage()).rejects.toThrow(
      'NEXT_REDIRECT:/auth/login?redirect=%2Fconfiguracion',
    );
  });

  it('con admin → primera tab permitida: /configuracion/usuarios', async () => {
    getSessionMock.mockResolvedValue({ permisos: ['admin', 'cobranza'] });
    await expect(ConfiguracionRedirectPage()).rejects.toThrow(
      'NEXT_REDIRECT:/configuracion/usuarios',
    );
  });

  it('con SOLO firma_correo → /configuracion/firma', async () => {
    getSessionMock.mockResolvedValue({ permisos: ['firma_correo'] });
    await expect(ConfiguracionRedirectPage()).rejects.toThrow(
      'NEXT_REDIRECT:/configuracion/firma',
    );
  });

  it('sin permisos de tab → denegado con los params del proxy', async () => {
    getSessionMock.mockResolvedValue({ permisos: ['cobranza'] });
    await expect(ConfiguracionRedirectPage()).rejects.toThrow(
      `NEXT_REDIRECT:/auth/denegado?permiso=admin&label=${encodeURIComponent('Configuración')}&ruta=${encodeURIComponent('/configuracion')}`,
    );
  });
});

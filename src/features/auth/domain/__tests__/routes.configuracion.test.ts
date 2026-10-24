import { describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * Route protection for the /configuracion section (feature
 * `configuracion-tabs`): three per-tab RUTAS_PROTEGIDAS entries reusing
 * EXISTING permisos — no new PERMISOS entry. The tab routes are
 * independent prefixes (`/configuracion/...` is NOT under `/admin/...`),
 * so longest-first startsWith matching resolves each tab to exactly one
 * permiso: `admin` for usuarios/areas, `firma_correo` for firma.
 *
 * The bare `/configuracion` redirect page is deliberately UNREGISTERED
 * (public under the proxy contract): it renders no content, only a
 * session-aware redirect to the first allowed tab.
 *
 * Proxy outcomes are asserted through the real `proxy` with a mocked
 * `jsonwebtoken` (routes.firma.test.ts precedent).
 */

const mockVerify = vi.hoisted(() => vi.fn());
vi.mock('jsonwebtoken', () => ({
  default: { verify: mockVerify },
}));

import { proxy } from '@/proxy';
import { PERMISOS } from '../entities';
import { buscarRutaProtegida, permisoParaRuta } from '../routes';

const ADMIN_TABS = ['/configuracion/usuarios', '/configuracion/areas'] as const;
const FIRMA_TAB = '/configuracion/firma';
const ALL_TABS = [...ADMIN_TABS, FIRMA_TAB] as const;

// ---- Domain level: the registration itself ----

describe('PERMISOS — configuracion tabs reuse existing permisos', () => {
  it('adds NO new permiso (admin + firma_correo already cover every tab)', () => {
    expect(PERMISOS).not.toContain('configuracion');
    expect(PERMISOS).toContain('admin');
    expect(PERMISOS).toContain('firma_correo');
  });
});

describe('RUTAS_PROTEGIDAS — configuracion tab entries', () => {
  it.each(ADMIN_TABS)('maps %s to the admin permiso', (path) => {
    expect(permisoParaRuta(path)).toBe('admin');
  });

  it('maps /configuracion/firma to the firma_correo permiso', () => {
    expect(permisoParaRuta(FIRMA_TAB)).toBe('firma_correo');
  });

  it('labels each entry for the denegado page', () => {
    expect(buscarRutaProtegida('/configuracion/usuarios')?.label).toBe(
      'Usuarios (Configuración)',
    );
    expect(buscarRutaProtegida('/configuracion/areas')?.label).toBe(
      'Áreas (Configuración)',
    );
    expect(buscarRutaProtegida('/configuracion/firma')?.label).toBe(
      'Mi Firma (Configuración)',
    );
  });

  it('sub-routes inherit their tab entry (startsWith)', () => {
    expect(permisoParaRuta('/configuracion/usuarios/otra-cosa')).toBe('admin');
    expect(permisoParaRuta('/configuracion/firma/otra-cosa')).toBe('firma_correo');
  });

  it('tab entries do NOT leak onto unrelated surfaces', () => {
    // Legacy routes keep their own gates (S4: bookmarks keep working).
    expect(permisoParaRuta('/admin/usuarios')).toBe('admin');
    expect(permisoParaRuta('/admin/plantillas/firma')).toBe('firma_correo');
    // The CRM agent-config surface is a DIFFERENT "configuración".
    expect(permisoParaRuta('/admin/crm/configuracion')).toBe('crm_configuracion');
  });
});

// ---- Proxy level: the three outcomes ----

function makeRequest(pathname: string, token?: string): NextRequest {
  return {
    nextUrl: { pathname },
    url: `http://localhost:3001${pathname}`,
    cookies: {
      get: (name: string) => (name === 'token' && token ? { value: token } : undefined),
    },
  } as unknown as NextRequest;
}

describe('proxy outcomes — admin session', () => {
  it('reaches the usuarios/areas tabs, is denied the firma tab', () => {
    mockVerify.mockReturnValue({ permisos: ['admin'] });
    for (const path of ADMIN_TABS) {
      expect(proxy(makeRequest(path, 'a.jwt.token')).status).toBe(200);
    }
    const res = proxy(makeRequest(FIRMA_TAB, 'a.jwt.token'));
    expect(res.status).toBe(307);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('/auth/denegado');
    expect(location).toContain('permiso=firma_correo');
  });
});

describe('proxy outcomes — firma_correo-only session', () => {
  it('reaches the firma tab, is denied the admin tabs', () => {
    mockVerify.mockReturnValue({ permisos: ['firma_correo'] });
    expect(proxy(makeRequest(FIRMA_TAB, 'a.jwt.token')).status).toBe(200);
    for (const path of ADMIN_TABS) {
      const res = proxy(makeRequest(path, 'a.jwt.token'));
      expect(res.status).toBe(307);
      const location = res.headers.get('location') ?? '';
      expect(location).toContain('/auth/denegado');
      expect(location).toContain('permiso=admin');
    }
  });
});

describe('proxy outcomes — unauthenticated', () => {
  it.each(ALL_TABS)('%s → login redirect with redirect param', (path) => {
    mockVerify.mockReturnValue(null);
    const res = proxy(makeRequest(path));
    expect(res.status).toBe(307);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('/auth/login');
    expect(location).toContain(`redirect=${encodeURIComponent(path)}`);
  });
});

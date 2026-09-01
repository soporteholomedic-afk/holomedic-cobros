import { describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * Route protection for the asistencia-rrhh capture (Fase 1).
 *
 * Two namespaces with two different auth models (ADR-6):
 *  - UI/RRHH surface (`/asistencia` pages + `/api/asistencia-rrhh` API):
 *    session-gated through RUTAS_PROTEGIDAS with the NEW `asistencia`
 *    permiso (REQ-F1-16).
 *  - Device surface (`/api/asistencia/*`): ZKTeco worker calls with its
 *    own Bearer token — it must stay OUT of RUTAS_PROTETGIDAS (REQ-F1-14)
 *    so the cookie-session proxy passes it through to the route, which
 *    authenticates the device itself.
 *
 * The guard test pins the REQ-F1-14 negative: if the device namespace
 * ever leaks into RUTAS_PROTEGIDAS, scripted devices would start getting
 * 401/403 session redirects instead of reaching their Bearer auth.
 */

const mockVerify = vi.hoisted(() => vi.fn());
vi.mock('jsonwebtoken', () => ({
  default: { verify: mockVerify },
}));

import { proxy } from '@/proxy';
import { PERMISOS } from '../entities';
import { buscarRutaProtegida, permisoParaRuta } from '../routes';

// ---- Permiso registry (REQ-F1-16) ----

describe('PERMISOS — asistencia', () => {
  it('registers the snake_case pair asistencia / asistencia_admin', () => {
    expect(PERMISOS).toContain('asistencia');
    expect(PERMISOS).toContain('asistencia_admin');
  });
});

// ---- UI/RRHH namespace: session-gated ----

describe('RUTAS_PROTEGIDAS — asistencia UI entries', () => {
  it('gates the /asistencia dashboard and its subpages on the asistencia permiso', () => {
    expect(permisoParaRuta('/asistencia')).toBe('asistencia');
    expect(permisoParaRuta('/asistencia/historico')).toBe('asistencia');
    expect(permisoParaRuta('/asistencia/fichas')).toBe('asistencia');
  });

  it('gates the /api/asistencia-rrhh surface on the asistencia permiso (ADR-6)', () => {
    expect(permisoParaRuta('/api/asistencia-rrhh')).toBe('asistencia');
    expect(permisoParaRuta('/api/asistencia-rrhh/fichas/12')).toBe('asistencia');
  });

  it('the API entry matches the asistencia-rrhh registration itself, not a device prefix', () => {
    expect(buscarRutaProtegida('/api/asistencia-rrhh/fichas/12')?.path).toBe('/api/asistencia-rrhh');
  });

  it('labels the entries for the denegado page', () => {
    expect(buscarRutaProtegida('/asistencia')?.label).toBe('Asistencia');
    expect(buscarRutaProtegida('/api/asistencia-rrhh')?.label).toBe('API Asistencia RRHH');
  });
});

// ---- Device namespace guard (REQ-F1-14): must stay UNREGISTERED ----

describe('device namespace guard — /api/asistencia/* is NOT in RUTAS_PROTEGIDAS', () => {
  it('the marcaciones endpoint resolves to no protected route', () => {
    expect(buscarRutaProtegida('/api/asistencia/marcaciones')).toBeNull();
  });

  it.each(['/api/asistencia/heartbeat', '/api/asistencia/comandos/7/confirmar'])(
    'every device endpoint (%s) stays outside the session proxy',
    (path) => {
      expect(buscarRutaProtegida(path)).toBeNull();
    },
  );
});

// ---- Proxy level: the guard's observable outcome ----

function makeRequest(pathname: string, token?: string): NextRequest {
  return {
    nextUrl: { pathname },
    url: `http://localhost:3001${pathname}`,
    cookies: {
      get: (name: string) => (name === 'token' && token ? { value: token } : undefined),
    },
  } as unknown as NextRequest;
}

describe('proxy outcomes', () => {
  it('unauthenticated device call passes through — Bearer auth is the route\u2019s own job (REQ-F1-14)', () => {
    mockVerify.mockReturnValue(null);
    const res = proxy(makeRequest('/api/asistencia/marcaciones'));
    expect(res.status).toBe(200);
  });

  it('unauthenticated UI visit redirects to login (standard session gate)', () => {
    mockVerify.mockReturnValue(null);
    const res = proxy(makeRequest('/asistencia'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location') ?? '').toContain('/auth/login');
    expect(res.headers.get('location') ?? '').toContain(
      `redirect=${encodeURIComponent('/asistencia')}`,
    );
  });

  it('session without the asistencia permiso gets the denegado redirect on /asistencia', () => {
    mockVerify.mockReturnValue({ permisos: ['cobranza'] });
    const res = proxy(makeRequest('/asistencia', 'a.jwt.token'));
    expect(res.status).toBe(307);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('/auth/denegado');
    expect(location).toContain('permiso=asistencia');
  });
});

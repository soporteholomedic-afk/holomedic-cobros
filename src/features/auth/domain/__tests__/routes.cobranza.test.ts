import { describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * Route protection for the cobranza contact directory API
 * (REQ-01-DIR-09, T1a.8): `/api/cobranza/contactos` is protected under
 * the EXISTING `cobranza` permiso (PERMISOS untouched). Because this
 * is an `/api/*` route, the proxy answers with JSON status codes —
 * 401 `{success:false, error:'No autenticado'}` when unauthenticated
 * and 403 JSON carrying `permisoRequerido:'cobranza'` when
 * authenticated without the permiso. Login/denegado redirects are
 * page-navigation-only (src/proxy.ts; design D11). Proxy outcomes are
 * asserted through the real `proxy` with a mocked `jsonwebtoken`
 * (routes.test.ts precedent).
 */

const mockVerify = vi.hoisted(() => vi.fn());
vi.mock('jsonwebtoken', () => ({
  default: { verify: mockVerify },
}));

import { proxy } from '@/proxy';
import { buscarRutaProtegida, permisoParaRuta } from '../routes';

// ---- Domain level: the registration itself ----

describe('RUTAS_PROTEGIDAS — cobranza contactos API entry', () => {
  it('protects the contact directory API under the existing cobranza permiso', () => {
    expect(permisoParaRuta('/api/cobranza/contactos')).toBe('cobranza');
    expect(buscarRutaProtegida('/api/cobranza/contactos')?.path).toBe('/api/cobranza/contactos');
    expect(buscarRutaProtegida('/api/cobranza/contactos')?.label).toBe(
      'API Directorio de Contactos',
    );
  });

  it('does not collide with the /cobranza page entry (startsWith longest-match)', () => {
    // The API path must resolve to ITS entry, not inherit /cobranza —
    // and /cobranza must keep resolving to the page entry.
    expect(buscarRutaProtegida('/api/cobranza/contactos')?.path).toBe('/api/cobranza/contactos');
    expect(buscarRutaProtegida('/cobranza')?.path).toBe('/cobranza');
  });
});

// ---- Proxy level: the three outcomes, JSON semantics (DIR-09) ----

function makeRequest(pathname: string, token?: string): NextRequest {
  return {
    nextUrl: { pathname },
    url: `http://localhost:3001${pathname}`,
    cookies: {
      get: (name: string) => (name === 'token' && token ? { value: token } : undefined),
    },
  } as unknown as NextRequest;
}

const API_PATH = '/api/cobranza/contactos';

describe('proxy outcomes — contact directory API', () => {
  it('unauthenticated → 401 JSON {success:false, error:"No autenticado"} — no redirect', async () => {
    mockVerify.mockReturnValue(null);
    const res = proxy(makeRequest(API_PATH));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ success: false, error: 'No autenticado' });
  });

  it('authenticated without cobranza → 403 JSON with permisoRequerido "cobranza" — no redirect', async () => {
    mockVerify.mockReturnValue({ permisos: ['consolidados'] });
    const res = proxy(makeRequest(API_PATH, 'a.jwt.token'));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      permisoRequerido: 'cobranza',
    });
  });

  it('authenticated with cobranza → pass-through', () => {
    mockVerify.mockReturnValue({ permisos: ['cobranza'] });
    const res = proxy(makeRequest(API_PATH, 'a.jwt.token'));
    expect(res.status).toBe(200);
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * Route protection for the REQ-02 cobranza audit endpoints (task 5.1,
 * design §3.4/D1): `/api/send-email` and `/api/cobranza/historial`
 * are protected under the EXISTING `cobranza` permiso (PERMISOS
 * untouched). Because these are `/api/*` routes, the proxy answers
 * with JSON status codes — 401 `{success:false, error:'No
 * autenticado'}` when unauthenticated and 403 JSON carrying
 * `permisoRequerido:'cobranza'` when authenticated without the
 * permiso (routes.cobranza.test.ts precedent).
 *
 * D1 BREAKING CHANGE: unauthenticated/scripted callers of
 * `/api/send-email` begin receiving 401 here — single authenticated
 * consumer grep-verified (EmailComposerModal.tsx), deploy note
 * required.
 */

const mockVerify = vi.hoisted(() => vi.fn());
vi.mock('jsonwebtoken', () => ({
  default: { verify: mockVerify },
}));

import { proxy } from '@/proxy';
import { buscarRutaProtegida, permisoParaRuta } from '../routes';

// ---- Domain level: the two new registrations ----

describe('RUTAS_PROTEGIDAS — REQ-02 cobranza audit API entries', () => {
  it('protects /api/send-email under the cobranza permiso', () => {
    expect(permisoParaRuta('/api/send-email')).toBe('cobranza');
    expect(buscarRutaProtegida('/api/send-email')?.label).toBe('API Envío de Correos');
  });

  it('protects /api/cobranza/historial and its [ruc] subpaths via the prefix entry', () => {
    expect(permisoParaRuta('/api/cobranza/historial')).toBe('cobranza');
    expect(permisoParaRuta('/api/cobranza/historial/20123456789')).toBe('cobranza');
    expect(buscarRutaProtegida('/api/cobranza/historial/20123456789')?.path).toBe(
      '/api/cobranza/historial',
    );
    expect(buscarRutaProtegida('/api/cobranza/historial')?.label).toBe(
      'API Historial de Cobranza',
    );
  });

  it('does not collide with sibling entries (longest-first startsWith)', () => {
    // The historial API path resolves to ITS entry — not the
    // contactos API, not the /cobranza page.
    expect(buscarRutaProtegida('/api/cobranza/historial/x')?.path).toBe(
      '/api/cobranza/historial',
    );
    expect(buscarRutaProtegida('/api/cobranza/contactos')?.path).toBe(
      '/api/cobranza/contactos',
    );
    expect(buscarRutaProtegida('/cobranza')?.path).toBe('/cobranza');
  });
});

// ---- Proxy level: the three outcomes per endpoint (JSON semantics) ----

function makeRequest(pathname: string, token?: string): NextRequest {
  return {
    nextUrl: { pathname },
    url: `http://localhost:3001${pathname}`,
    cookies: {
      get: (name: string) => (name === 'token' && token ? { value: token } : undefined),
    },
  } as unknown as NextRequest;
}

describe.each([
  ['/api/send-email', 'send-email'],
  ['/api/cobranza/historial/20123456789', 'historial [ruc]'],
])('proxy outcomes — %s (%s)', (API_PATH) => {
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

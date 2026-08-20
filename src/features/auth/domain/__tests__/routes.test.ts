import { describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * Route Protection Inheritance (task 2.4 — historial-envios-consolidados):
 * `/api/consolidados/envios` (and its `[id]` subpath) is protected under
 * the EXISTING `consolidados` permiso; the future page
 * `/consolidados/historial-envios` inherits from `/consolidados` via
 * `startsWith`. `PERMISOS` untouched (D9). Proxy outcomes are asserted
 * through the real `proxy` with a mocked `jsonwebtoken`.
 */

const mockVerify = vi.hoisted(() => vi.fn());
vi.mock('jsonwebtoken', () => ({
  default: { verify: mockVerify },
}));

import { proxy } from '@/proxy';
import { buscarRutaProtegida, permisoParaRuta } from '../routes';

// ---- Domain level: the registration itself ----

describe('RUTAS_PROTEGIDAS — envios history entries', () => {
  it('protects the search API + [id] subpath; the page inherits from /consolidados', () => {
    expect(permisoParaRuta('/api/consolidados/envios')).toBe('consolidados');
    expect(permisoParaRuta('/api/consolidados/envios/0b1f...-uuid')).toBe('consolidados');
    // No dedicated page entry exists — inheritance only (startsWith).
    expect(buscarRutaProtegida('/consolidados/historial-envios')!.path).toBe('/consolidados');
    expect(permisoParaRuta('/consolidados/historial-envios')).toBe('consolidados');
  });
});

// ---- Proxy level: the three outcomes on both paths ----

function makeRequest(pathname: string, token?: string): NextRequest {
  return {
    nextUrl: { pathname },
    url: `http://localhost:3001${pathname}`,
    cookies: {
      get: (name: string) => (name === 'token' && token ? { value: token } : undefined),
    },
  } as unknown as NextRequest;
}

const API_PATH = '/api/consolidados/envios';
const PAGE_PATH = '/consolidados/historial-envios';

describe.each([
  ['API', API_PATH],
  ['page', PAGE_PATH],
])('proxy outcomes — %s path %s', (_kind, path) => {
  it('unauthenticated → login redirect (page) / 401 JSON (API)', async () => {
    mockVerify.mockReturnValue(null);
    const res = proxy(makeRequest(path));
    if (path === API_PATH) {
      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toMatchObject({ success: false });
    } else {
      expect(res.status).toBe(307);
      const location = res.headers.get('location') ?? '';
      expect(location).toContain('/auth/login');
      expect(location).toContain(`redirect=${encodeURIComponent(path)}`);
    }
  });

  it('authenticated without consolidados → denegado redirect (page) / 403 JSON (API)', async () => {
    mockVerify.mockReturnValue({ permisos: ['cobranza'] });
    const res = proxy(makeRequest(path, 'a.jwt.token'));
    if (path === API_PATH) {
      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toMatchObject({
        success: false,
        permisoRequerido: 'consolidados',
      });
    } else {
      expect(res.status).toBe(307);
      const location = res.headers.get('location') ?? '';
      expect(location).toContain('/auth/denegado');
      expect(location).toContain('permiso=consolidados');
    }
  });

  it('authenticated with consolidados → pass', () => {
    mockVerify.mockReturnValue({ permisos: ['consolidados'] });
    const res = proxy(makeRequest(path, 'a.jwt.token'));
    expect(res.status).toBe(200);
  });
});

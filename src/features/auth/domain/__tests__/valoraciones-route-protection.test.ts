import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { proxy } from '@/proxy';
import { signJwt } from '@/lib/auth';
import { buscarRutaProtegida, permisoParaRuta } from '../routes';

// Any module-level DB access the routes might attempt is instrumented:
// if the proxy denies access, nothing below may open a pool.
const mockGetSiglaReadOnlyPool = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  getSiglaReadOnlyPool: mockGetSiglaReadOnlyPool,
}));

function fakeRequest(pathname: string, token?: string): NextRequest {
  return {
    nextUrl: {
      pathname,
      search: '',
      searchParams: new URLSearchParams(),
    },
    url: `http://localhost${pathname}`,
    cookies: {
      get: (name: string) =>
        name === 'token' && token ? { value: token } : undefined,
    },
  } as unknown as NextRequest;
}

function tokenFor(permisos: string[]): string {
  return signJwt({ sub: 'u1', nombre: 'Usuario Test', area: 'test', permisos });
}

describe('REQ-03 Q-R7 — /api/valoraciones route protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers every /api/valoraciones subpath under permiso "valoraciones"', () => {
    for (const path of [
      '/api/valoraciones/sigla',
      '/api/valoraciones/lookups/clientes',
      '/api/valoraciones/pdf',
      '/api/valoraciones/excel',
      '/api/valoraciones/send',
      '/api/valoraciones/generate',
    ]) {
      expect(permisoParaRuta(path)).toBe('valoraciones');
    }
  });

  it('keeps the /valoraciones page entry intact', () => {
    expect(buscarRutaProtegida('/valoraciones')?.permiso).toBe('valoraciones');
  });

  it('RED threat: unauthenticated API call → 401 and zero SP/pool calls', async () => {
    // Load the route module so a regression that opens the pool at import
    // time would be caught; the handler itself must never run.
    await import('@/app/api/valoraciones/sigla/route');

    const res = proxy(fakeRequest('/api/valoraciones/sigla'));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'No autenticado' });
    expect(mockGetSiglaReadOnlyPool).not.toHaveBeenCalled();
  });

  it('RED threat: authenticated without permiso valoraciones → 403 and zero SP calls', async () => {
    await import('@/app/api/valoraciones/sigla/route');

    const res = proxy(
      fakeRequest('/api/valoraciones/sigla?fecIni=2026-01-01&fecFin=2026-01-31&codMon=1', tokenFor(['cobranza'])),
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.permisoRequerido).toBe('valoraciones');
    expect(mockGetSiglaReadOnlyPool).not.toHaveBeenCalled();
  });

  it('lets authenticated users with the permiso through', () => {
    const res = proxy(
      fakeRequest('/api/valoraciones/sigla', tokenFor(['valoraciones'])),
    );
    expect(res).toBeInstanceOf(NextResponse);
    expect(res.status).toBe(200);
  });
});

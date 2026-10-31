import { describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * Route protection for the CRM capability (S1a/pr1).
 *
 * One permiso gates the whole CRM: `crm` covers the pages under /crm
 * (including the Excel import view /crm/importar) and the /api/crm prefix
 * (including /api/crm/importar). The old `crm_admin` tier for the import
 * surface was dropped on purpose: anyone who can use the CRM can import.
 * `crm_admin` stays in PERMISOS but no route asks for it.
 *
 * Page routes answer with redirects (/auth/login without session,
 * /auth/denegado with permiso+label+ruta when the permiso is missing);
 * API routes answer with JSON status codes (401 / 403) — proxy contract.
 */

const mockVerify = vi.hoisted(() => vi.fn());
vi.mock('jsonwebtoken', () => ({
  default: { verify: mockVerify },
}));

import { proxy } from '@/proxy';
import { PERMISOS } from '../entities';
import { buscarRutaProtegida, permisoParaRuta } from '../routes';

// ---- Permiso registry (G7) ----

describe('PERMISOS — crm', () => {
  it('registers the crm / crm_admin pair', () => {
    expect(PERMISOS).toContain('crm');
    expect(PERMISOS).toContain('crm_admin');
  });
});

// ---- Registry: RUTAS_PROTEGIDAS entries ----

describe('RUTAS_PROTEGIDAS — CRM entries', () => {
  it('gates /crm and its subpages on the crm permiso', () => {
    expect(permisoParaRuta('/crm')).toBe('crm');
    expect(permisoParaRuta('/crm/cola')).toBe('crm');
    expect(permisoParaRuta('/crm/empresas/7')).toBe('crm');
  });

  it('gates the /api/crm prefix on the crm permiso', () => {
    expect(permisoParaRuta('/api/crm')).toBe('crm');
    expect(permisoParaRuta('/api/crm/empresas')).toBe('crm');
    expect(permisoParaRuta('/api/crm/empresas/7/transiciones')).toBe('crm');
  });

  it('the API pages entry matches the /api/crm registration itself, not a longer admin prefix', () => {
    expect(buscarRutaProtegida('/api/crm/empresas')?.path).toBe('/api/crm');
  });

  it('the import page needs the plain crm permiso, like the rest of /crm', () => {
    expect(permisoParaRuta('/crm/importar')).toBe('crm');
    expect(buscarRutaProtegida('/crm/importar')?.path).toBe('/crm');
  });

  it('the import API needs the plain crm permiso, like the rest of /api/crm', () => {
    for (const ruta of ['/api/crm/importar', '/api/crm/importar/vista-previa', '/api/crm/importar/plantilla']) {
      expect(permisoParaRuta(ruta)).toBe('crm');
      expect(buscarRutaProtegida(ruta)?.path).toBe('/api/crm');
    }
  });

  it('no route asks for crm_admin any more', () => {
    for (const ruta of ['/crm', '/crm/importar', '/api/crm', '/api/crm/import', '/api/crm/importar/vista-previa']) {
      expect(permisoParaRuta(ruta)).not.toBe('crm_admin');
    }
  });

  it('labels the entries for the denegado page', () => {
    expect(buscarRutaProtegida('/crm')?.label).toBe('CRM');
    expect(buscarRutaProtegida('/crm/importar')?.label).toBe('CRM');
    expect(buscarRutaProtegida('/api/crm')?.label).toBe('API CRM');
    expect(buscarRutaProtegida('/api/crm/importar')?.label).toBe('API CRM');
  });
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

describe('proxy outcomes — CRM pages', () => {
  it('unauthenticated visit redirects to login carrying ?redirect=', () => {
    mockVerify.mockReturnValue(null);
    const res = proxy(makeRequest('/crm'));
    expect(res.status).toBe(307);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('/auth/login');
    expect(location).toContain(`redirect=${encodeURIComponent('/crm')}`);
  });

  it('unauthenticated import page also redirects to login first', () => {
    mockVerify.mockReturnValue(null);
    const res = proxy(makeRequest('/crm/importar'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location') ?? '').toContain('/auth/login');
  });

  it('session without crm gets the denegado redirect with permiso, label and ruta', () => {
    mockVerify.mockReturnValue({ permisos: ['cobranza'] });
    const res = proxy(makeRequest('/crm', 'a.jwt.token'));
    expect(res.status).toBe(307);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('/auth/denegado');
    const params = new URL(location).searchParams;
    expect(params.get('permiso')).toBe('crm');
    expect(params.get('label')).toBe('CRM');
    expect(params.get('ruta')).toBe('/crm');
  });

  it('session with crm passes through', () => {
    mockVerify.mockReturnValue({ permisos: ['crm'] });
    const res = proxy(makeRequest('/crm', 'a.jwt.token'));
    expect(res.status).toBe(200);
  });

  it('plain crm session passes on the import page', () => {
    mockVerify.mockReturnValue({ permisos: ['crm'] });
    const res = proxy(makeRequest('/crm/importar', 'a.jwt.token'));
    expect(res.status).toBe(200);
  });

  it('a session without crm is denied on the import page and asked for crm, not crm_admin', () => {
    mockVerify.mockReturnValue({ permisos: ['cobranza'] });
    const res = proxy(makeRequest('/crm/importar', 'a.jwt.token'));
    expect(res.status).toBe(307);
    const params = new URL(res.headers.get('location') ?? '').searchParams;
    expect(params.get('permiso')).toBe('crm');
    expect(params.get('ruta')).toBe('/crm/importar');
  });

  it('crm_admin alone does not open the import page: crm is what counts', () => {
    mockVerify.mockReturnValue({ permisos: ['crm_admin'] });
    const res = proxy(makeRequest('/crm/importar', 'a.jwt.token'));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location') ?? '').searchParams.get('permiso')).toBe('crm');
  });
});

describe('proxy outcomes — CRM API', () => {
  it('unauthenticated call → 401 JSON {success:false, error:"No autenticado"} — no redirect', async () => {
    mockVerify.mockReturnValue(null);
    const res = proxy(makeRequest('/api/crm/empresas'));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ success: false, error: 'No autenticado' });
  });

  it('unauthenticated import API call → 401 JSON too', async () => {
    mockVerify.mockReturnValue(null);
    const res = proxy(makeRequest('/api/crm/importar/vista-previa'));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ success: false });
  });

  it('session without crm → 403 JSON with permisoRequerido "crm"', async () => {
    mockVerify.mockReturnValue({ permisos: ['cobranza'] });
    const res = proxy(makeRequest('/api/crm/empresas', 'a.jwt.token'));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      permisoRequerido: 'crm',
    });
  });

  it('session with crm passes through', () => {
    mockVerify.mockReturnValue({ permisos: ['crm'] });
    const res = proxy(makeRequest('/api/crm/empresas', 'a.jwt.token'));
    expect(res.status).toBe(200);
  });

  it('plain crm session passes on every import API route', () => {
    mockVerify.mockReturnValue({ permisos: ['crm'] });
    for (const ruta of ['/api/crm/importar', '/api/crm/importar/vista-previa', '/api/crm/importar/plantilla']) {
      expect(proxy(makeRequest(ruta, 'a.jwt.token')).status).toBe(200);
    }
  });

  it('a session without crm gets 403 on the import API with permisoRequerido crm', async () => {
    mockVerify.mockReturnValue({ permisos: ['crm_admin'] });
    const res = proxy(makeRequest('/api/crm/importar/vista-previa', 'a.jwt.token'));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ success: false, permisoRequerido: 'crm' });
  });
});

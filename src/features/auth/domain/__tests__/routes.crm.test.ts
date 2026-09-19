import { describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * Route protection for the CRM capability (S1a/pr1).
 *
 * Two permisos with two access tiers (design D2, same split precedent
 * as asistencia/asistencia_admin):
 *  - `crm`: CRM pages under /crm and the /api/crm prefix.
 *  - `crm_admin`: the Excel import surface — /crm/importar and
 *    /api/crm/import. These are registered as LONGER prefixes so
 *    `buscarRutaProtegida`'s longest-first startsWith match denies
 *    plain-`crm` sessions on them (same pattern as firma_correo).
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

  it('the import page requires crm_admin — longest-first beats the plain /crm entry', () => {
    expect(permisoParaRuta('/crm/importar')).toBe('crm_admin');
    expect(buscarRutaProtegida('/crm/importar')?.path).toBe('/crm/importar');
  });

  it('the import API requires crm_admin — longest-first beats the /api/crm entry', () => {
    expect(permisoParaRuta('/api/crm/import')).toBe('crm_admin');
    expect(permisoParaRuta('/api/crm/import/validar')).toBe('crm_admin');
    expect(permisoParaRuta('/api/crm/import/confirmar')).toBe('crm_admin');
  });

  it('labels the entries for the denegado page', () => {
    expect(buscarRutaProtegida('/crm')?.label).toBe('CRM');
    expect(buscarRutaProtegida('/crm/importar')?.label).toBe('Importar Empresas CRM');
    expect(buscarRutaProtegida('/api/crm')?.label).toBe('API CRM');
    expect(buscarRutaProtegida('/api/crm/import')?.label).toBe('API Importación CRM');
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
    expect(location).toContain('permiso=crm');
    expect(location).toContain(`label=${encodeURIComponent('CRM')}`);
    expect(location).toContain(`ruta=${encodeURIComponent('/crm')}`);
  });

  it('session with crm passes through', () => {
    mockVerify.mockReturnValue({ permisos: ['crm'] });
    const res = proxy(makeRequest('/crm', 'a.jwt.token'));
    expect(res.status).toBe(200);
  });

  it('plain crm session is denied on the import page — crm_admin required', () => {
    mockVerify.mockReturnValue({ permisos: ['crm'] });
    const res = proxy(makeRequest('/crm/importar', 'a.jwt.token'));
    expect(res.status).toBe(307);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('/auth/denegado');
    expect(location).toContain('permiso=crm_admin');
    expect(location).toContain(`label=${encodeURIComponent('Importar Empresas CRM')}`);
  });

  it('crm_admin session passes on the import page', () => {
    mockVerify.mockReturnValue({ permisos: ['crm', 'crm_admin'] });
    const res = proxy(makeRequest('/crm/importar', 'a.jwt.token'));
    expect(res.status).toBe(200);
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
    const res = proxy(makeRequest('/api/crm/import/validar'));
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

  it('plain crm session is denied on the import API — 403 with permisoRequerido crm_admin', async () => {
    mockVerify.mockReturnValue({ permisos: ['crm'] });
    const res = proxy(makeRequest('/api/crm/import/validar', 'a.jwt.token'));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      permisoRequerido: 'crm_admin',
    });
  });

  it('crm_admin session passes on the import API', () => {
    mockVerify.mockReturnValue({ permisos: ['crm', 'crm_admin'] });
    const res = proxy(makeRequest('/api/crm/import/validar', 'a.jwt.token'));
    expect(res.status).toBe(200);
  });
});

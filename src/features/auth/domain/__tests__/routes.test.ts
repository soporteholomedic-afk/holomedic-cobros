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
import { PERMISOS } from '../entities';
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

// ---- agente-ia-crm E4·T6: the quality panel rides crm_conversaciones ----

describe('RUTAS_PROTEGIDAS — calidad entry (E4·T6)', () => {
  it('maps /crm/calidad to crm_conversaciones under its OWN (longer) entry', () => {
    expect(permisoParaRuta('/crm/calidad')).toBe('crm_conversaciones');
    expect(buscarRutaProtegida('/crm/calidad')?.path).toBe('/crm/calidad');
    expect(buscarRutaProtegida('/crm/calidad')?.label).toBe('Calidad');
  });

  it('longest-first: the specific entry beats the generic /crm gate', () => {
    const ruta = buscarRutaProtegida('/crm/calidad');
    expect(ruta?.permiso).toBe('crm_conversaciones');
    expect(ruta?.permiso).not.toBe('crm');
  });

  it('the API surface /api/crm/calidad stays under the generic /api/crm crm gate in the PROXY; the route re-checks crm_conversaciones in-route (productividad pattern)', () => {
    expect(permisoParaRuta('/api/crm/calidad')).toBe('crm');
  });

  it('unauthenticated page → login redirect', () => {
    mockVerify.mockReturnValue(null);
    const res = proxy(makeRequest('/crm/calidad'));
    expect(res.status).toBe(307);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('/auth/login');
    expect(location).toContain(`redirect=${encodeURIComponent('/crm/calidad')}`);
  });

  it('crm-only session → denegado redirect naming crm_conversaciones / Calidad', () => {
    mockVerify.mockReturnValue({ permisos: ['crm'] });
    const res = proxy(makeRequest('/crm/calidad', 'a.jwt.token'));
    expect(res.status).toBe(307);
    const params = new URL(res.headers.get('location') ?? '').searchParams;
    expect(params.get('permiso')).toBe('crm_conversaciones');
    expect(params.get('label')).toBe('Calidad');
    expect(params.get('ruta')).toBe('/crm/calidad');
  });

  it('crm_conversaciones session → pass', () => {
    mockVerify.mockReturnValue({ permisos: ['crm_conversaciones'] });
    const res = proxy(makeRequest('/crm/calidad', 'a.jwt.token'));
    expect(res.status).toBe(200);
  });
});

// ---- agente-ia-crm E4·T8: knowledge upload rides its OWN crm_conocimiento permiso ----

describe('RUTAS_PROTEGIDAS — conocimiento entries (E4·T8)', () => {
  it('registers the crm_conocimiento permiso in the single source of truth', () => {
    expect(PERMISOS).toContain('crm_conocimiento');
  });

  it('maps /admin/crm/conocimiento to crm_conocimiento under its OWN (longer) entry', () => {
    expect(permisoParaRuta('/admin/crm/conocimiento')).toBe('crm_conocimiento');
    expect(buscarRutaProtegida('/admin/crm/conocimiento')?.path).toBe('/admin/crm/conocimiento');
    expect(buscarRutaProtegida('/admin/crm/conocimiento')?.label).toBe('Conocimiento');
  });

  it('maps /api/crm/conocimiento/ingestas to crm_conocimiento (API registered explicitly, E1 precedent)', () => {
    expect(permisoParaRuta('/api/crm/conocimiento/ingestas')).toBe('crm_conocimiento');
    expect(buscarRutaProtegida('/api/crm/conocimiento/ingestas')?.label).toBe('Conocimiento');
  });

  it('longest-first: both entries beat the generic /admin/usuarios and /api/crm gates', () => {
    // admin-only and crm-only sessions must NOT inherit this surface.
    expect(permisoParaRuta('/admin/crm/conocimiento')).not.toBe('admin');
    expect(permisoParaRuta('/api/crm/conocimiento/ingestas')).not.toBe('crm');
    // Subpaths (future E6 editor deep links) inherit the same gate.
    expect(permisoParaRuta('/admin/crm/conocimiento/editor')).toBe('crm_conocimiento');
  });

  it('unauthenticated page → login redirect', () => {
    mockVerify.mockReturnValue(null);
    const res = proxy(makeRequest('/admin/crm/conocimiento'));
    expect(res.status).toBe(307);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('/auth/login');
    expect(location).toContain(`redirect=${encodeURIComponent('/admin/crm/conocimiento')}`);
  });

  it('crm-only session → denegado redirect naming crm_conocimiento / Conocimiento', () => {
    mockVerify.mockReturnValue({ permisos: ['crm'] });
    const res = proxy(makeRequest('/admin/crm/conocimiento', 'a.jwt.token'));
    expect(res.status).toBe(307);
    const params = new URL(res.headers.get('location') ?? '').searchParams;
    expect(params.get('permiso')).toBe('crm_conocimiento');
    expect(params.get('label')).toBe('Conocimiento');
    expect(params.get('ruta')).toBe('/admin/crm/conocimiento');
  });

  it('crm_conocimiento session → pass', () => {
    mockVerify.mockReturnValue({ permisos: ['crm_conocimiento'] });
    const res = proxy(makeRequest('/admin/crm/conocimiento', 'a.jwt.token'));
    expect(res.status).toBe(200);
  });
});

// ---- agente-ia-crm E5·T4: agent configuration rides its OWN crm_configuracion permiso ----

describe('RUTAS_PROTEGIDAS — configuracion entries (E5·T4)', () => {
  it('registers the crm_configuracion permiso in the single source of truth', () => {
    expect(PERMISOS).toContain('crm_configuracion');
  });

  it('gates the admin page and the API by crm_configuracion with label Configuración', () => {
    expect(permisoParaRuta('/admin/crm/configuracion')).toBe('crm_configuracion');
    expect(permisoParaRuta('/api/crm/configuracion/agente')).toBe('crm_configuracion');
    expect(buscarRutaProtegida('/admin/crm/configuracion')?.label).toBe('Configuración');
    expect(buscarRutaProtegida('/api/crm/configuracion/auditoria')?.label).toBe('Configuración');
  });

  it('longest-first: both entries beat the generic /admin/usuarios and /api/crm gates', () => {
    expect(permisoParaRuta('/admin/crm/configuracion')).not.toBe('admin');
    expect(permisoParaRuta('/api/crm/configuracion/agente/kill-switch')).not.toBe('crm');
  });

  it('a session with only crm does NOT pass /api/crm/configuracion', () => {
    mockVerify.mockReturnValue({ permisos: ['crm'] });
    const res = proxy(makeRequest('/api/crm/configuracion/agente', 'a.jwt.token'));
    expect(res.status).not.toBe(200);
  });

  it('crm_configuracion session → pass', () => {
    mockVerify.mockReturnValue({ permisos: ['crm_configuracion'] });
    const res = proxy(makeRequest('/admin/crm/configuracion', 'a.jwt.token'));
    expect(res.status).toBe(200);
  });
});

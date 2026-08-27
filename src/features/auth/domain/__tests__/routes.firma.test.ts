import { describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * Route protection for the self-service email signature (PR2 task
 * 2.5): a NEW `firma_correo` permiso + four `RUTAS_PROTEGIDAS` entries
 * — one per registered area (`consolidados`, `cobranza`), the
 * canonical `/admin/plantillas/firma` redirect page, and the API.
 *
 * Threat TM3 (longest-prefix override): every entry is LONGER than the
 * generic `/admin/plantillas` gate, and `buscarRutaProtegida` sorts by
 * descending path length before the `startsWith` match — so a session
 * holding `firma_correo` WITHOUT `plantillas` reaches the signature
 * routes, while the generic plantillas surface keeps gating on
 * `plantillas`. Proxy outcomes are asserted through the real `proxy`
 * with a mocked `jsonwebtoken` (routes.cobranza.test.ts precedent).
 */

const mockVerify = vi.hoisted(() => vi.fn());
vi.mock('jsonwebtoken', () => ({
  default: { verify: mockVerify },
}));

import { proxy } from '@/proxy';
import { PERMISOS } from '../entities';
import { buscarRutaProtegida, permisoParaRuta } from '../routes';

const FIRMA_PATHS = [
  '/admin/plantillas/consolidados/firma',
  '/admin/plantillas/cobranza/firma',
  '/admin/plantillas/firma',
  '/api/plantillas/firma',
] as const;

// ---- Domain level: the registration itself ----

describe('PERMISOS — firma_correo', () => {
  it('is registered (single source of truth feeding /admin/usuarios checkboxes + validatePermisos)', () => {
    expect(PERMISOS).toContain('firma_correo');
  });

  it('sits right after "plantillas" in the registry', () => {
    expect(PERMISOS.indexOf('firma_correo')).toBe(PERMISOS.indexOf('plantillas') + 1);
  });
});

describe('RUTAS_PROTEGIDAS — firma entries', () => {
  it.each(FIRMA_PATHS)('maps %s to the firma_correo permiso', (path) => {
    expect(permisoParaRuta(path)).toBe('firma_correo');
  });

  it('labels each entry for the denegado page', () => {
    expect(buscarRutaProtegida('/admin/plantillas/consolidados/firma')?.label).toBe(
      'Mi Firma (Consolidados)',
    );
    expect(buscarRutaProtegida('/admin/plantillas/cobranza/firma')?.label).toBe(
      'Mi Firma (Cobranza)',
    );
    expect(buscarRutaProtegida('/admin/plantillas/firma')?.label).toBe('Mi Firma');
    expect(buscarRutaProtegida('/api/plantillas/firma')?.label).toBe('API Mi Firma');
  });

  it('TM3 — longest-prefix: firma entries beat the generic /admin/plantillas gate', () => {
    for (const path of FIRMA_PATHS) {
      expect(buscarRutaProtegida(path)?.path).toBe(path);
    }
  });

  it('TM3 — /admin/plantillas itself keeps gating on plantillas (firma entries are LONGER prefixes only)', () => {
    // Non-firma paths under the plantillas surface must NOT inherit the firma permiso.
    expect(permisoParaRuta('/admin/plantillas')).toBe('plantillas');
    expect(permisoParaRuta('/admin/plantillas/cobranza')).toBe('plantillas');
    expect(permisoParaRuta('/admin/plantillas/consolidados')).toBe('plantillas');
    // A signature PAGE path under a registered area resolves to its own entry.
    expect(buscarRutaProtegida('/admin/plantillas/cobranza/firma')?.permiso).toBe('firma_correo');
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

describe('proxy outcomes — TM3 firma_correo WITHOUT plantillas reaches every firma route', () => {
  it('pass-through on all four entries', () => {
    mockVerify.mockReturnValue({ permisos: ['firma_correo'] });
    for (const path of FIRMA_PATHS) {
      expect(proxy(makeRequest(path, 'a.jwt.token')).status).toBe(200);
    }
  });
});

describe('proxy outcomes — session WITHOUT firma_correo', () => {
  it('pages → denegado redirect carrying permiso/label/ruta', () => {
    mockVerify.mockReturnValue({ permisos: ['plantillas'] });

    for (const path of ['/admin/plantillas/consolidados/firma', '/admin/plantillas/cobranza/firma', '/admin/plantillas/firma']) {
      const res = proxy(makeRequest(path, 'a.jwt.token'));
      expect(res.status).toBe(307);
      const location = res.headers.get('location') ?? '';
      expect(location).toContain('/auth/denegado');
      expect(location).toContain('permiso=firma_correo');
      expect(location).toContain(`ruta=${encodeURIComponent(path)}`);
    }
  });

  it('API → 403 JSON with permisoRequerido firma_correo', async () => {
    mockVerify.mockReturnValue({ permisos: ['plantillas'] });

    const res = proxy(makeRequest('/api/plantillas/firma', 'a.jwt.token'));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      permisoRequerido: 'firma_correo',
    });
  });
});

describe('proxy outcomes — unauthenticated', () => {
  it('pages → login redirect with redirect param (TM1)', () => {
    mockVerify.mockReturnValue(null);

    for (const path of ['/admin/plantillas/cobranza/firma', '/admin/plantillas/firma']) {
      const res = proxy(makeRequest(path));
      expect(res.status).toBe(307);
      const location = res.headers.get('location') ?? '';
      expect(location).toContain('/auth/login');
      expect(location).toContain(`redirect=${encodeURIComponent(path)}`);
    }
  });

  it('API → 401 JSON (TM1)', async () => {
    mockVerify.mockReturnValue(null);

    const res = proxy(makeRequest('/api/plantillas/firma'));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ success: false, error: 'No autenticado' });
  });
});

import { describe, expect, it } from 'vitest';

/**
 * Route registration for the agente-ia-crm conversations view (E1).
 *
 * Two surfaces gated by the NEW `crm_conversaciones` permiso:
 *  - UI: `/crm/conversaciones` (pages + subroutes)
 *  - API: `/api/crm/conversaciones` (list/detail/messages endpoints)
 *
 * Both entries are LONGER prefixes than the generic `crm` entries
 * (`/crm`, `/api/crm`), so `buscarRutaProtegida`'s longest-first
 * `startsWith` match gives them their own gate (firma_correo /
 * crm_admin pattern) — a plain-`crm` session without
 * `crm_conversaciones` gets denegado, not silent access.
 *
 * The Kapso webhook guard pins the inverse contract: `/api/webhooks/kapso`
 * is called by the external agent with its own credential inside the
 * route, so it must stay OUT of RUTAS_PROTEGIDAS — registering it would
 * turn scripted webhook calls into 307 session redirects (mirror of the
 * REQ-F1-14 asistencia device-namespace guard).
 */

import { PERMISOS } from '../entities';
import { buscarRutaProtegida, permisoParaRuta, RUTAS_PROTEGIDAS } from '../routes';

// ---- Permiso registry ----

describe('PERMISOS — crm_conversaciones', () => {
  it('registers the snake_case crm_conversaciones permiso', () => {
    expect(PERMISOS).toContain('crm_conversaciones');
  });
});

// ---- Route registration: page + API surfaces ----

describe('RUTAS_PROTEGIDAS — conversaciones entries', () => {
  it('maps /crm/conversaciones to crm_conversaciones', () => {
    expect(permisoParaRuta('/crm/conversaciones')).toBe('crm_conversaciones');
    expect(
      RUTAS_PROTEGIDAS.find((r) => r.path === '/crm/conversaciones')?.permiso,
    ).toBe('crm_conversaciones');
  });

  it('maps /api/crm/conversaciones to crm_conversaciones', () => {
    expect(permisoParaRuta('/api/crm/conversaciones')).toBe('crm_conversaciones');
    expect(
      RUTAS_PROTEGIDAS.find((r) => r.path === '/api/crm/conversaciones')?.permiso,
    ).toBe('crm_conversaciones');
  });

  it('labels both entries "Conversaciones" for the denegado page', () => {
    expect(buscarRutaProtegida('/crm/conversaciones')?.label).toBe('Conversaciones');
    expect(buscarRutaProtegida('/api/crm/conversaciones')?.label).toBe('Conversaciones');
  });
});

// ---- Longest-first precedence over the generic crm gates ----

describe('longest-first precedence — specific entries beat the generic crm prefix', () => {
  it('a nested API conversation path resolves crm_conversaciones, NOT crm', () => {
    const ruta = buscarRutaProtegida('/api/crm/conversaciones/5/mensajes');
    expect(ruta?.permiso).toBe('crm_conversaciones');
    expect(ruta?.permiso).not.toBe('crm');
  });

  it('the conversations page entry matches itself, not the generic /crm gate', () => {
    expect(buscarRutaProtegida('/crm/conversaciones')?.permiso).toBe('crm_conversaciones');
    expect(buscarRutaProtegida('/crm/conversaciones')?.path).toBe('/crm/conversaciones');
  });

  it('unrelated crm surfaces keep resolving through the generic crm gate', () => {
    expect(permisoParaRuta('/crm')).toBe('crm');
    expect(permisoParaRuta('/api/crm/empresas')).toBe('crm');
  });
});

// ---- Webhook guard: must stay UNREGISTERED ----

describe('webhook guard — /api/webhooks/kapso is NOT in RUTAS_PROTEGIDAS', () => {
  it('the kapso webhook resolves to no protected route', () => {
    expect(buscarRutaProtegida('/api/webhooks/kapso')).toBeNull();
  });

  it.each(['/api/webhooks/kapso', '/api/webhooks/kapso/other-subpath'])(
    'every kapso webhook path (%s) stays outside the session proxy',
    (path) => {
      expect(permisoParaRuta(path)).toBeNull();
    },
  );
});

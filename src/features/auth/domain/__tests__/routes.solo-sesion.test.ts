import { describe, expect, it } from 'vitest';
import {
  RUTAS_SOLO_SESION,
  buscarRutaProtegida,
  buscarRutaSoloSesion,
} from '../routes';

/**
 * login-at-entry (S2-S5): the platform must ask for credentials when
 * entering it (home `/` and the `/areas` index pages), not when already
 * navigating inside an area. `RUTAS_SOLO_SESION` gates those surfaces on
 * a valid session only — any authenticated user passes, no permiso is
 * consulted. The permiso gates of `RUTAS_PROTEGIDAS` (longest-first
 * startsWith) always win over the session-only gate, and deliberately
 * unregistered device APIs (`/api/asistencia/*`, Bearer in-route) must
 * never match a session-only entry.
 */

describe('RUTAS_SOLO_SESION — registry contract', () => {
  it('gates home with an EXACT match only', () => {
    const home = RUTAS_SOLO_SESION.find((r) => r.path === '/');
    expect(home).toBeDefined();
    // exact: true is load-bearing — a prefix `/` entry would match every
    // path and silently flip the proxy to deny-by-default, breaking the
    // unregistered device API pass-through (S5).
    expect(home?.exact).toBe(true);
    expect(buscarRutaSoloSesion('/')?.path).toBe('/');
    expect(buscarRutaSoloSesion('/cobranza')).toBeNull();
    expect(buscarRutaSoloSesion('/areas/medicina')?.path).toBe('/areas');
  });

  it('gates the area index pages via the /areas prefix (S3)', () => {
    expect(buscarRutaSoloSesion('/areas/medicina')?.path).toBe('/areas');
    expect(buscarRutaSoloSesion('/areas/calidad')?.path).toBe('/areas');
    expect(buscarRutaSoloSesion('/areas/musculoesqueletica')?.path).toBe('/areas');
  });

  it('never matches APIs, auth pages, or permiso-registered routes (S4/S5)', () => {
    expect(buscarRutaSoloSesion('/api/asistencia/heartbeat')).toBeNull();
    expect(buscarRutaSoloSesion('/api/asistencia/marcaciones')).toBeNull();
    expect(buscarRutaSoloSesion('/api/areas/musculoesqueletica/jjc')).toBeNull();
    expect(buscarRutaSoloSesion('/auth/login')).toBeNull();
    expect(buscarRutaSoloSesion('/auth/denegado')).toBeNull();
    // jjc permiso gate stays owned by RUTAS_PROTEGIDAS (longest-first).
    expect(buscarRutaProtegida('/areas/medicina/jjc')?.permiso).toBe('jjc');
    expect(buscarRutaProtegida('/areas/musculoesqueletica/jjc/123/pdf')?.permiso).toBe('jjc');
  });
});

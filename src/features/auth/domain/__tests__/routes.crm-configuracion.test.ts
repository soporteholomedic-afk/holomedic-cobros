import { describe, expect, it } from 'vitest';

import { PERMISOS } from '../entities';
import { buscarRutaProtegida, permisoParaRuta } from '../routes';

/**
 * Route protection for the apifacturacion configuration surface
 * (crm-consulta-sunat, spec S2/S5; relocation to the /configuracion
 * tabs in T8 — log L8). The token + URL of apifacturacion.com are
 * administered at the LAST tab of /configuracion,
 * `/configuracion/consulta-sunat`, and at `/api/crm/configuracion`,
 * with the DEDICATED `crm_configuracion` permiso — NOT the plain `crm`
 * gate of the broader prefixes. The API entry is a longer prefix than
 * the generic `/api/crm`, so `buscarRutaProtegida`'s longest-first
 * `startsWith` match resolves to it first. The dedicated
 * `/admin/crm/configuracion` page was REMOVED in T8 and is no longer
 * registered.
 */
describe('RUTAS_PROTEGIDAS — CRM configuración (apifacturacion)', () => {
  it('crm_configuracion existe en el registro de PERMISOS', () => {
    expect(PERMISOS).toContain('crm_configuracion');
  });

  it('gates /configuracion/consulta-sunat and its subpaths on crm_configuracion', () => {
    for (const ruta of [
      '/configuracion/consulta-sunat',
      '/configuracion/consulta-sunat/detalle',
    ]) {
      expect(permisoParaRuta(ruta)).toBe('crm_configuracion');
      expect(buscarRutaProtegida(ruta)?.path).toBe('/configuracion/consulta-sunat');
    }
  });

  it('the dedicated /admin/crm/configuracion page is NO LONGER registered (T8 removal)', () => {
    // The page directory was deleted with the tab replacement; the path
    // falls through every RUTAS_PROTEGIDAS prefix (and 404s in the app).
    expect(permisoParaRuta('/admin/crm/configuracion')).toBeNull();
    expect(buscarRutaProtegida('/admin/crm/configuracion')).toBeNull();
  });

  it('gates /api/crm/configuracion and its subpaths on crm_configuracion', () => {
    for (const ruta of [
      '/api/crm/configuracion',
      '/api/crm/configuracion/apifacturacion',
      '/api/crm/configuracion/apifacturacion/probar',
    ]) {
      expect(permisoParaRuta(ruta)).toBe('crm_configuracion');
      expect(buscarRutaProtegida(ruta)?.path).toBe('/api/crm/configuracion');
    }
  });

  it('the longer prefix wins over the plain-crm /api/crm gate', () => {
    // The configuracion surface is NOT reachable with the plain crm permiso…
    expect(permisoParaRuta('/api/crm/configuracion/apifacturacion')).not.toBe('crm');
    // …while the REST of the CRM keeps its plain-crm gate untouched.
    expect(permisoParaRuta('/api/crm/empresas')).toBe('crm');
    expect(buscarRutaProtegida('/api/crm/empresas')?.path).toBe('/api/crm');
    expect(permisoParaRuta('/crm/cola')).toBe('crm');
  });

  it('labels the entries for the denegado page', () => {
    expect(buscarRutaProtegida('/configuracion/consulta-sunat')?.label).toBe(
      'Consulta SUNAT (Configuración)',
    );
    expect(buscarRutaProtegida('/api/crm/configuracion/apifacturacion')?.label).toBe('Configuración');
  });
});

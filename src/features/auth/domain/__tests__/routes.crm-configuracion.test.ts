import { describe, expect, it } from 'vitest';

import { PERMISOS } from '../entities';
import { buscarRutaProtegida, permisoParaRuta } from '../routes';

/**
 * Route protection for the apifacturacion configuration surface
 * (crm-consulta-sunat T2, spec S2/S5). The token + URL of
 * apifacturacion.com are administered at /admin/crm/configuracion and
 * /api/crm/configuracion with the DEDICATED `crm_configuracion` permiso
 * — NOT the plain `crm` gate of the broader prefixes. Both entries are
 * longer prefixes than the generic `/api/crm` and `/crm` entries, so
 * `buscarRutaProtegida`'s longest-first `startsWith` match resolves to
 * them first.
 */
describe('RUTAS_PROTEGIDAS — CRM configuración (apifacturacion)', () => {
  it('crm_configuracion existe en el registro de PERMISOS', () => {
    expect(PERMISOS).toContain('crm_configuracion');
  });

  it('gates /admin/crm/configuracion on crm_configuracion', () => {
    expect(permisoParaRuta('/admin/crm/configuracion')).toBe('crm_configuracion');
    expect(buscarRutaProtegida('/admin/crm/configuracion')?.path).toBe('/admin/crm/configuracion');
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
    expect(buscarRutaProtegida('/admin/crm/configuracion')?.label).toBe('Configuración');
    expect(buscarRutaProtegida('/api/crm/configuracion/apifacturacion')?.label).toBe('Configuración');
  });
});

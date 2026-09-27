import { describe, expect, it } from 'vitest';

import { SECTORES_CRM } from '../../entities';
import { COLUMNAS_IMPORT_CRM, TIPO_POR_ETIQUETA, type FilaImportCrm } from '../columnas';

/**
 * Structural contract of the shared import-column constant (spec G3
 * anti-drift requirement): ONE definition consumed by the template
 * builder (pr7), the importer and the wizard. The pr7 drift test
 * extends this equality to the generated workbook headers.
 *
 * rediseno-crm-panel (task 2.1): the Tipo column speaks the operator
 * vocabulary ("Cliente Nuevo" / "Posible Cliente") via TIPO_POR_ETIQUETA
 * (legacy cells still resolve), and the sheet round-trips the three new
 * alta fields — Rubro, Cantidad de Trabajadores, Cargo.
 */
describe('COLUMNAS_IMPORT_CRM', () => {
  it('define exactamente las 15 columnas del PRD rev 3 en orden', () => {
    expect(COLUMNAS_IMPORT_CRM.map((c) => c.clave)).toEqual([
      'empresa',
      'ruc',
      'tipo',
      'origen',
      'proyectoObra',
      'destinoComun',
      'responsable',
      'notas',
      'rubro',
      'cantidadTrabajadores',
      'encargado',
      'correos',
      'telefono',
      'cargo',
      'principal',
    ]);
    expect(COLUMNAS_IMPORT_CRM.map((c) => c.encabezado)).toEqual([
      'Empresa',
      'RUC',
      'Tipo',
      'Origen',
      'Proyecto/Obra',
      'Destino Común',
      'Responsable',
      'Notas',
      'Rubro',
      'Cantidad de Trabajadores',
      'Encargado',
      'Correos',
      'Teléfono',
      'Cargo',
      'Principal',
    ]);
  });

  it('marca como requeridas Empresa, RUC, Tipo, Encargado y Correos', () => {
    const requeridas = COLUMNAS_IMPORT_CRM.filter((c) => c.requerido).map((c) => c.clave);
    expect(requeridas).toEqual(['empresa', 'ruc', 'tipo', 'encargado', 'correos']);
  });

  it('declara las opciones de las columnas de lista (Tipo, Origen, Rubro, Principal)', () => {
    const porClave = new Map(COLUMNAS_IMPORT_CRM.map((c) => [c.clave, c]));
    expect(porClave.get('tipo')).toMatchObject({
      tipo: 'lista',
      opciones: ['Cliente Nuevo', 'Posible Cliente'],
    });
    expect(porClave.get('origen')).toMatchObject({
      tipo: 'lista',
      opciones: ['Nos contactaron', 'Los buscamos'],
    });
    expect(porClave.get('rubro')).toMatchObject({ tipo: 'lista', opciones: [...SECTORES_CRM] });
    expect(porClave.get('principal')).toMatchObject({ tipo: 'lista', opciones: ['Sí'] });
    for (
      const clave of [
        'empresa',
        'ruc',
        'proyectoObra',
        'destinoComun',
        'responsable',
        'notas',
        'encargado',
        'correos',
        'telefono',
        'cantidadTrabajadores',
        'cargo',
      ]
    ) {
      expect(porClave.get(clave)).toMatchObject({ tipo: 'texto' });
    }
  });

  it('las claves de FilaImportCrm coinciden con las claves de las columnas (anti-drift)', () => {
    const filaMuestra: FilaImportCrm = {
      empresa: '',
      ruc: '',
      tipo: '',
      origen: '',
      proyectoObra: '',
      destinoComun: '',
      responsable: '',
      notas: '',
      rubro: '',
      cantidadTrabajadores: '',
      encargado: '',
      correos: '',
      telefono: '',
      cargo: '',
      principal: '',
    };
    expect(Object.keys(filaMuestra).sort()).toEqual(
      COLUMNAS_IMPORT_CRM.map((c) => c.clave).sort(),
    );
  });

  it('TIPO_POR_ETIQUETA traduce el vocabulario del panel y resuelve las celdas legacy', () => {
    expect(TIPO_POR_ETIQUETA.get('Cliente Nuevo')).toBe('Cliente');
    expect(TIPO_POR_ETIQUETA.get('Posible Cliente')).toBe('Prospecto');
    // Legacy cells from templates downloaded before the rename still import.
    expect(TIPO_POR_ETIQUETA.get('Cliente')).toBe('Cliente');
    expect(TIPO_POR_ETIQUETA.get('Prospecto')).toBe('Prospecto');
  });
});

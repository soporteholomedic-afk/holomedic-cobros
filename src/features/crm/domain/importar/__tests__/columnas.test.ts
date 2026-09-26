import { describe, expect, it } from 'vitest';

import { COLUMNAS_IMPORT_CRM, type FilaImportCrm } from '../columnas';

/**
 * Structural contract of the shared import-column constant (spec G3
 * anti-drift requirement): ONE definition consumed by the template
 * builder (pr7), the importer and the wizard. The pr7 drift test
 * extends this equality to the generated workbook headers.
 */
describe('COLUMNAS_IMPORT_CRM', () => {
  it('define exactamente las 12 columnas del PRD rev 3 en orden', () => {
    expect(COLUMNAS_IMPORT_CRM.map((c) => c.clave)).toEqual([
      'empresa',
      'ruc',
      'tipo',
      'origen',
      'proyectoObra',
      'destinoComun',
      'responsable',
      'notas',
      'encargado',
      'correos',
      'telefono',
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
      'Encargado',
      'Correos',
      'Teléfono',
      'Principal',
    ]);
  });

  it('marca como requeridas Empresa, RUC, Tipo, Encargado y Correos', () => {
    const requeridas = COLUMNAS_IMPORT_CRM.filter((c) => c.requerido).map((c) => c.clave);
    expect(requeridas).toEqual(['empresa', 'ruc', 'tipo', 'encargado', 'correos']);
  });

  it('declara las opciones de las columnas de lista (Tipo, Origen, Principal)', () => {
    const porClave = new Map(COLUMNAS_IMPORT_CRM.map((c) => [c.clave, c]));
    expect(porClave.get('tipo')).toMatchObject({ tipo: 'lista', opciones: ['Cliente', 'Prospecto'] });
    expect(porClave.get('origen')).toMatchObject({ tipo: 'lista', opciones: ['Inbound', 'Outbound'] });
    expect(porClave.get('principal')).toMatchObject({ tipo: 'lista', opciones: ['Sí'] });
    for (const clave of ['empresa', 'ruc', 'proyectoObra', 'destinoComun', 'responsable', 'notas', 'encargado', 'correos', 'telefono']) {
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
      encargado: '',
      correos: '',
      telefono: '',
      principal: '',
    };
    expect(Object.keys(filaMuestra).sort()).toEqual(
      COLUMNAS_IMPORT_CRM.map((c) => c.clave).sort(),
    );
  });
});

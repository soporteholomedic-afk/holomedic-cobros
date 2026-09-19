import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as mssql from 'mssql';

import { getHolomedicPool } from '@/lib/db';

import type { ContactoImportado, GrupoEmpresaImportado } from '../../../domain/importar/validarImportacion';
import { ImportacionExcedeLimiteError, MAXIMO_FILAS_IMPORTACION } from '../../../domain/importar/limiteFilas';
import type { RegistroImportacion } from '../../../domain/ports';
import { mapearFilasImportCrm, SqlServerCrmImportador } from '../importadorCrm';
import { loadEnvLocal } from '../../sqlserver/__tests__/loadEnvLocal';

loadEnvLocal();

/**
 * Contract for `importadorCrm.ts` (tasks pr6/WU3):
 * - `mapearFilasImportCrm` (pure): maps client-parsed row objects —
 *   keyed by Excel header (asterisked/accented variants) or by column
 *   clave — into `FilaImportCrm` rows via COLUMNAS_IMPORT_CRM, and
 *   enforces the 2000-row cap with the typed Spanish error.
 * - `SqlServerCrmImportador` (real DB): executes ONE RUC group per
 *   transaction — create mode lands the full aggregate; update mode
 *   applies the D1 merge rule (name-match updates teléfono, correos
 *   UNIONed, never removed; new contactos appended without touching
 *   the existing principal; correo overlap WITHOUT name match creates
 *   the contacto AND warns, never merges; merging never crosses
 *   empresas, backed by UQ_CRM_Contactos_EmpresaNombre) — and writes
 *   the CRM_Importaciones job record.
 *
 * Probe rows use reserved rucNormalizado values and a reserved
 * archivoNombre; every test cleans up in `finally` and FK CASCADE
 * removes contactos/correos with the empresa — zero residue.
 */

const PROBE_RUCS = ['0000000000993', '0000000000992', '0000000000991'];
const PROBE_KEY = `rucNormalizado IN ('${PROBE_RUCS.join("','")}')`;
const PROBE_XLSX = 'pr6-import-probe.xlsx';

let pool: mssql.ConnectionPool;

beforeAll(async () => {
  pool = await getHolomedicPool();
  await pool.connect();
  await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
  await pool.request().query(`DELETE FROM dbo.CRM_Importaciones WHERE archivoNombre = '${PROBE_XLSX}'`);
});

afterAll(async () => {
  if (pool) {
    await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
    await pool.request().query(`DELETE FROM dbo.CRM_Importaciones WHERE archivoNombre = '${PROBE_XLSX}'`);
    await pool.close();
  }
});

function contacto(nombre: string, correos: string[], telefono: string | null = null, esPrincipal = false): ContactoImportado {
  return { nombre, telefono, correos, esPrincipal };
}

function grupoCon(ruc: string, contactos: ContactoImportado[], filas: number[] = [2, 3]): GrupoEmpresaImportado {
  return {
    ruc,
    razonSocial: 'Probe Importador SA',
    tipo: 'Cliente',
    origen: 'Inbound',
    proyectoObra: 'Obra Pr6',
    destinoComun: null,
    responsable: null,
    notas: null,
    contactos,
    filas,
  };
}

describe('mapearFilasImportCrm — client rows → FilaImportCrm', () => {
  it('maps Excel-header-keyed rows (asterisked/accents, numeric cells) into claves via the shared constant', () => {
    const filas = mapearFilasImportCrm([
      {
        Empresa: 'Probe SA',
        RUC: 20100047218, // xlsx numeric cell — coerced to text
        'Tipo*': 'Cliente',
        Origen: 'Inbound',
        'Proyecto/Obra': 'Obra Norte',
        'Destino Común': 'Lima',
        Responsable: 'jperez',
        Notas: 'nota',
        'Encargado*': 'Ana',
        'Correos*': 'ana@x.com; Ana@X.com',
        Teléfono: '0981',
        Principal: 'Sí',
      },
    ]);

    expect(filas).toHaveLength(1);
    expect(filas[0]).toEqual({
      empresa: 'Probe SA',
      ruc: '20100047218',
      tipo: 'Cliente',
      origen: 'Inbound',
      proyectoObra: 'Obra Norte',
      destinoComun: 'Lima',
      responsable: 'jperez',
      notas: 'nota',
      encargado: 'Ana',
      correos: 'ana@x.com; Ana@X.com',
      telefono: '0981',
      principal: 'Sí',
    });
  });

  it('also accepts clave-keyed rows, ignores unknown keys and maps missing cells to empty strings', () => {
    const filas = mapearFilasImportCrm([
      { empresa: 'X', ruc: '20100047219', tipo: 'Prospecto', encargado: 'Luis', correos: 'luis@x.com', extra: 'ignorado' },
      {},
    ]);

    expect(filas).toHaveLength(2);
    expect(filas[0]).toEqual({
      empresa: 'X',
      ruc: '20100047219',
      tipo: 'Prospecto',
      origen: '',
      proyectoObra: '',
      destinoComun: '',
      responsable: '',
      notas: '',
      encargado: 'Luis',
      correos: 'luis@x.com',
      telefono: '',
      principal: '',
    });
    expect(filas[1]?.empresa).toBe('');
    expect(filas[1]?.correos).toBe('');
  });

  it(`enforces the ${MAXIMO_FILAS_IMPORTACION}-row cap with the typed Spanish error, accepting exactly the cap`, () => {
    const over = Array.from({ length: MAXIMO_FILAS_IMPORTACION + 1 }, () => ({}));

    expect(() => mapearFilasImportCrm(over)).toThrow('2000');
    expect(() => mapearFilasImportCrm(over)).toThrow(ImportacionExcedeLimiteError);

    const atCap = Array.from({ length: MAXIMO_FILAS_IMPORTACION }, () => ({}));
    expect(mapearFilasImportCrm(atCap)).toHaveLength(MAXIMO_FILAS_IMPORTACION);
  });
});

describe('SqlServerCrmImportador — real HOLOMEDIC integration', () => {
  it('create mode lands the full aggregate (normalized keys, lowercase correos, principal) and reports counters', async () => {
    const importador = new SqlServerCrmImportador(pool);
    try {
      const resultado = await importador.ejecutarGrupo(
        grupoCon('0000000000993', [
          contacto('José Pérez', ['Jose@X.com'], '0981 111 222'),
          contacto('Ana Díaz', ['ana@x.com'], null, true),
        ]),
        'tester',
      );

      expect(resultado).toEqual({ modo: 'crear', contactosCreados: 2, contactosActualizados: 0, advertencias: [] });

      const empresa = await pool
        .request()
        .input('ruc', mssql.VarChar(30), '0000000000993')
        .query(`SELECT id, ruc, razonSocial, tipo, origen, proyectoObra, createdBy, responsable
                FROM dbo.CRM_Empresas WHERE rucNormalizado = @ruc`);
      const empresaRow = empresa.recordset[0];
      expect(empresaRow?.razonSocial).toBe('Probe Importador SA');
      expect(empresaRow?.tipo).toBe('Cliente');
      expect(empresaRow?.origen).toBe('Inbound');
      expect(empresaRow?.proyectoObra).toBe('Obra Pr6');
      expect(empresaRow?.createdBy).toBe('tester');
      expect(empresaRow?.responsable).toBeNull();

      const contactos = await pool
        .request()
        .input('empresaId', mssql.Int, empresaRow?.id)
        .query(`SELECT id, nombre, nombreNormalizado, telefono, esPrincipal
                FROM dbo.CRM_Contactos WHERE empresaId = @empresaId ORDER BY id`);
      expect(contactos.recordset).toHaveLength(2);
      const jose = contactos.recordset[0];
      const ana = contactos.recordset[1];
      expect(jose?.nombre).toBe('José Pérez');
      expect(jose?.nombreNormalizado).toBe('jose perez'); // accent-stripped D1 merge key
      expect(jose?.telefono).toBe('0981 111 222');
      expect(jose?.esPrincipal).toBe(false);
      expect(ana?.esPrincipal).toBe(true); // marked 'Sí' in the group

      const correos = await pool
        .request()
        .input('contactoId', mssql.Int, jose?.id)
        .query('SELECT correo FROM dbo.CRM_Correos WHERE contactoId = @contactoId');
      expect(correos.recordset.map((r) => r.correo)).toEqual(['jose@x.com']); // stored normalized
    } finally {
      await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
    }
  });

  it('update mode applies D1: teléfono overwritten, correos UNIONed never removed, new contacto added, principal preserved', async () => {
    const importador = new SqlServerCrmImportador(pool);
    try {
      await importador.ejecutarGrupo(
        grupoCon('0000000000992', [contacto('José Pérez', ['jose@x.com'], '0981 111 222', true)]),
        'tester1',
      );

      const resultado = await importador.ejecutarGrupo(
        grupoCon('0000000000992', [
          contacto('jose  perez', ['jose@x.com', 'nuevo@y.com'], '0999 888 777'),
          contacto('Luis Nuevo', ['luis@x.com']),
        ]),
        'tester2',
      );

      expect(resultado).toEqual({ modo: 'actualizar', contactosCreados: 1, contactosActualizados: 1, advertencias: [] });

      const contactos = await pool
        .request()
        .input('ruc', mssql.VarChar(30), '0000000000992')
        .query(`SELECT c.id, c.nombre, c.telefono, c.esPrincipal, c.nombreNormalizado
                FROM dbo.CRM_Contactos c
                JOIN dbo.CRM_Empresas e ON e.id = c.empresaId
                WHERE e.rucNormalizado = @ruc ORDER BY c.id`);
      expect(contactos.recordset).toHaveLength(2);
      const jose = contactos.recordset[0];
      const luis = contactos.recordset[1];
      expect(jose?.telefono).toBe('0999 888 777'); // overwritten (provided)
      expect(jose?.esPrincipal).toBe(true); // preserved — import never displaces the principal
      expect(luis?.nombre).toBe('Luis Nuevo');
      expect(luis?.esPrincipal).toBe(false); // forced: exactly-one-principal stays with José

      const correosJose = await pool
        .request()
        .input('contactoId', mssql.Int, jose?.id)
        .query('SELECT correo FROM dbo.CRM_Correos WHERE contactoId = @contactoId ORDER BY correo');
      expect(correosJose.recordset.map((r) => r.correo)).toEqual(['jose@x.com', 'nuevo@y.com']); // union, none removed

      const updatedBy = await pool
        .request()
        .input('ruc', mssql.VarChar(30), '0000000000992')
        .query('SELECT updatedBy FROM dbo.CRM_Empresas WHERE rucNormalizado = @ruc');
      expect(updatedBy.recordset[0]?.updatedBy).toBe('tester2');
    } finally {
      await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
    }
  });

  it('correo overlap WITHOUT name match does NOT merge: the contacto is created AND a non-blocking warning is reported', async () => {
    const importador = new SqlServerCrmImportador(pool);
    try {
      await importador.ejecutarGrupo(
        grupoCon('0000000000991', [contacto('Ana', ['ana@x.com'], null, true)], [2]),
        'tester',
      );

      const resultado = await importador.ejecutarGrupo(
        grupoCon('0000000000991', [contacto('Anita López', ['ana@x.com', 'anita@x.com'])], [5]),
        'tester',
      );

      expect(resultado.modo).toBe('actualizar');
      expect(resultado.contactosCreados).toBe(1);
      expect(resultado.contactosActualizados).toBe(0);
      expect(resultado.advertencias).toEqual([
        {
          fila: 5,
          columna: 'Correos',
          mensaje: expect.stringContaining('Posible contacto duplicado'),
        },
      ]);

      const contactos = await pool
        .request()
        .input('ruc', mssql.VarChar(30), '0000000000991')
        .query(`SELECT c.nombre, c.esPrincipal
                FROM dbo.CRM_Contactos c
                JOIN dbo.CRM_Empresas e ON e.id = c.empresaId
                WHERE e.rucNormalizado = @ruc ORDER BY c.id`);
      expect(contactos.recordset).toHaveLength(2); // Ana kept + Anita created — no fusion
      expect(contactos.recordset[0]?.nombre).toBe('Ana');
      expect(contactos.recordset[0]?.esPrincipal).toBe(true);
      expect(contactos.recordset[1]?.nombre).toBe('Anita López');
    } finally {
      await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
    }
  });

  it('never merges across empresas: the same contacto name lands independently in each empresa (UQ_CRM_Contactos_EmpresaNombre holds)', async () => {
    const importador = new SqlServerCrmImportador(pool);
    try {
      await importador.ejecutarGrupo(
        grupoCon('0000000000993', [contacto('Pedro', ['pedro@a.com'])]),
        'tester',
      );
      // 'Pedro' again, different empresa (different RUC) → its own contacto.
      const resultado = await importador.ejecutarGrupo(
        grupoCon('0000000000992', [contacto('Pedro', ['pedro@b.com'])]),
        'tester',
      );

      expect(resultado.modo).toBe('crear');
      expect(resultado.contactosCreados).toBe(1);

      const pedros = await pool
        .request()
        .query(`SELECT c.empresaId, e.rucNormalizado
                FROM dbo.CRM_Contactos c
                JOIN dbo.CRM_Empresas e ON e.id = c.empresaId
                WHERE c.nombreNormalizado = 'pedro' AND e.rucNormalizado IN ('0000000000993', '0000000000992')
                ORDER BY e.rucNormalizado`);
      expect(pedros.recordset).toHaveLength(2); // one per empresa — never fused
    } finally {
      await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
    }
  });

  it('registrarImportacion writes the CRM_Importaciones job record with counters and the report JSON', async () => {
    const importador = new SqlServerCrmImportador(pool);
    const registro: RegistroImportacion = {
      archivoNombre: PROBE_XLSX,
      totalFilas: 10,
      filasValidas: 8,
      empresasCreadas: 1,
      empresasActualizadas: 1,
      contactosCreados: 3,
      contactosActualizados: 2,
      erroresJson: JSON.stringify([{ fila: 3, columna: 'RUC', mensaje: 'fallo de prueba' }]),
      ejecutadoPor: 'tester',
    };

    const id = await importador.registrarImportacion(registro);
    expect(id).toBeGreaterThan(0);

    try {
      const row = await pool
        .request()
        .input('id', mssql.Int, id)
        .query(`SELECT archivoNombre, totalFilas, filasValidas, empresasCreadas, empresasActualizadas,
                       contactosCreados, contactosActualizados, erroresJson, ejecutadoPor, createdAt
                FROM dbo.CRM_Importaciones WHERE id = @id`);
      const job = row.recordset[0];
      expect(job?.archivoNombre).toBe(PROBE_XLSX);
      expect(job?.totalFilas).toBe(10);
      expect(job?.filasValidas).toBe(8);
      expect(job?.empresasCreadas).toBe(1);
      expect(job?.empresasActualizadas).toBe(1);
      expect(job?.contactosCreados).toBe(3);
      expect(job?.contactosActualizados).toBe(2);
      expect(job?.ejecutadoPor).toBe('tester');
      expect(JSON.parse(job?.erroresJson ?? '[]')).toEqual([
        { fila: 3, columna: 'RUC', mensaje: 'fallo de prueba' },
      ]);
      expect(job?.createdAt).toBeInstanceOf(Date);
    } finally {
      await pool.request().query(`DELETE FROM dbo.CRM_Importaciones WHERE archivoNombre = '${PROBE_XLSX}'`);
    }
  });
});

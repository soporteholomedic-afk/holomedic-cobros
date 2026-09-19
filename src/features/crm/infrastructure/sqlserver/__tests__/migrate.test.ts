import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as mssql from 'mssql';

import { getHolomedicPool } from '@/lib/db';

import { migrate } from '../migrate';
import { loadEnvLocal } from './loadEnvLocal';

loadEnvLocal();

/**
 * DB integration contract for the CRM schema (design §2; pr2 scope:
 * CRM_Empresas / CRM_Contactos / CRM_Correos — pr6 adds the
 * CRM_Importaciones job table, pr9 adds the pipeline trio
 * CRM_Pipeline / CRM_Transiciones / CRM_Resultados).
 *
 * Unlike the fake-pool migrate suites (asistencia/cobranza), this suite
 * runs the real migration against the local `HOLOMEDIC` database via
 * `getHolomedicPool()` so the named constraints and the filtered unique
 * index are proven to EXIST and to ENFORCE — a regex over SQL text
 * cannot do either. Idempotency is exercised for real: the migration
 * runs twice before the catalog assertions and a third time inside the
 * idempotency test, which must leave the catalog fingerprint unchanged.
 *
 * All probe writes happen inside a transaction that is ALWAYS rolled
 * back (and stale probe rows are cleaned before it starts), so the
 * suite leaves zero residue in the developer database.
 */

const TABLAS = [
  'CRM_Empresas',
  'CRM_Contactos',
  'CRM_Correos',
  'CRM_Importaciones',
  'CRM_Pipeline',
  'CRM_Transiciones',
  'CRM_Resultados',
] as const;
const CHECKS = [
  'CK_CRM_Empresas_Tipo',
  'CK_CRM_Empresas_Origen',
  'CK_CRM_Pipeline_Flujo',
  'CK_CRM_Pipeline_Etapa',
  'CK_CRM_Resultados_Tipo',
] as const;
const UNIQUES = [
  'UQ_CRM_Empresas_RucNormalizado',
  'UQ_CRM_Contactos_EmpresaNombre',
  'UQ_CRM_Correos_ContactoCorreo',
  'UQ_CRM_Pipeline_Empresa',
] as const;
const FKS = [
  'FK_CRM_Contactos_Empresa',
  'FK_CRM_Correos_Contacto',
  'FK_CRM_Pipeline_Empresa',
  'FK_CRM_Transiciones_Empresa',
  'FK_CRM_Resultados_Empresa',
] as const;
const INDEXES = [
  'UX_CRM_Contactos_Principal',
  'IX_CRM_Empresas_Responsable',
  'IX_CRM_Empresas_Tipo',
] as const;
const INDEXES_PIPELINE = [
  'IX_CRM_Pipeline_Etapa',
  'IX_CRM_Transiciones_EmpresaFecha',
  'IX_CRM_Transiciones_UsuarioFecha',
  'IX_CRM_Resultados_UsuarioFecha',
  'IX_CRM_Resultados_EmpresaFecha',
] as const;

/** RUC/razonSocial reserved by this suite (always rolled back). */
const PROBE_RUC = '0000000000999';
const PROBE_RAZON = 'PR2 MIGRATE PROBE';

interface NameRow {
  name: string;
}
interface IndexRow {
  name: string;
  is_unique: boolean;
  filter_definition: string | null;
}
interface FkRow {
  name: string;
  delete_referential_action: number;
}
interface IncludeRow {
  name: string;
}
interface CatalogRow {
  tipo: string;
  nombre: string;
}

let pool: mssql.ConnectionPool;

beforeAll(async () => {
  pool = await getHolomedicPool();
  await pool.connect();
  // Idempotency on the way in: two consecutive full runs must succeed.
  await migrate(pool);
  await migrate(pool);
});

afterAll(async () => {
  if (pool) await pool.close();
});

async function catalogFingerprint(p: mssql.ConnectionPool): Promise<string[]> {
  const result = await p.request().query<CatalogRow>(`
    SELECT 'TABLE' AS tipo, t.name AS nombre
      FROM sys.tables t
     WHERE t.name IN ('${TABLAS.join("','")}')
    UNION ALL
    SELECT 'KEY', kc.name
      FROM sys.key_constraints kc
     WHERE kc.parent_object_id IN (OBJECT_ID('dbo.CRM_Empresas'), OBJECT_ID('dbo.CRM_Contactos'), OBJECT_ID('dbo.CRM_Correos'), OBJECT_ID('dbo.CRM_Importaciones'), OBJECT_ID('dbo.CRM_Pipeline'), OBJECT_ID('dbo.CRM_Transiciones'), OBJECT_ID('dbo.CRM_Resultados'))
    UNION ALL
    SELECT 'CHECK', cc.name
      FROM sys.check_constraints cc
     WHERE cc.parent_object_id IN (OBJECT_ID('dbo.CRM_Empresas'), OBJECT_ID('dbo.CRM_Pipeline'), OBJECT_ID('dbo.CRM_Resultados'))
    UNION ALL
    SELECT 'FK', fk.name
      FROM sys.foreign_keys fk
     WHERE fk.parent_object_id IN (OBJECT_ID('dbo.CRM_Contactos'), OBJECT_ID('dbo.CRM_Correos'), OBJECT_ID('dbo.CRM_Pipeline'), OBJECT_ID('dbo.CRM_Transiciones'), OBJECT_ID('dbo.CRM_Resultados'))
    UNION ALL
    SELECT 'INDEX', i.name
      FROM sys.indexes i
     WHERE i.object_id IN (OBJECT_ID('dbo.CRM_Empresas'), OBJECT_ID('dbo.CRM_Contactos'), OBJECT_ID('dbo.CRM_Correos'), OBJECT_ID('dbo.CRM_Importaciones'), OBJECT_ID('dbo.CRM_Pipeline'), OBJECT_ID('dbo.CRM_Transiciones'), OBJECT_ID('dbo.CRM_Resultados'))
       AND i.name IS NOT NULL
  `);
  return result.recordset.map((r) => `${r.tipo}:${r.nombre}`).sort();
}

describe('crm migrate() — HOLOMEDIC schema integration', () => {
  it('is idempotent — a third full run leaves the catalog fingerprint unchanged', async () => {
    const before = await catalogFingerprint(pool);
    await migrate(pool);
    const after = await catalogFingerprint(pool);
    expect(after).toEqual(before);
    // 7 tables (3 registry + job + 3 pipeline) + 11 key constraints
    // (7 PK + 4 UQ) + 5 CHECKs + 5 FKs + 19 indexes (8 named + 4
    // backing the UQs + 7 clustered PKs).
    expect(before).toHaveLength(7 + 11 + 5 + 5 + 19);
  });

  it('creates the registry tables (Empresas → Contactos → Correos), the CRM_Importaciones job table and the pipeline trio', async () => {
    const result = await pool
      .request()
      .query<NameRow>(
        `SELECT name FROM sys.tables WHERE name IN ('${TABLAS.join("','")}') ORDER BY name`,
      );
    expect(result.recordset.map((r) => r.name).sort()).toEqual([...TABLAS].sort());
  });

  it('creates CRM_Importaciones with the job-count columns (pr6, design §2)', async () => {
    const result = await pool.request().query<NameRow>(`
      SELECT c.name
        FROM sys.columns c
       WHERE c.object_id = OBJECT_ID('dbo.CRM_Importaciones')
       ORDER BY c.name`);
    expect(result.recordset.map((r) => r.name).sort()).toEqual(
      [
        'id',
        'archivoNombre',
        'totalFilas',
        'filasValidas',
        'empresasCreadas',
        'empresasActualizadas',
        'contactosCreados',
        'contactosActualizados',
        'erroresJson',
        'ejecutadoPor',
        'createdAt',
      ].sort(),
    );
  });

  it('creates the named CHECK constraints for the empresa enums, the pipeline flujo/etapa and the result catalog', async () => {
    const result = await pool
      .request()
      .query<NameRow>(
        `SELECT name FROM sys.check_constraints
          WHERE parent_object_id IN (OBJECT_ID('dbo.CRM_Empresas'), OBJECT_ID('dbo.CRM_Pipeline'), OBJECT_ID('dbo.CRM_Resultados'))
          ORDER BY name`,
      );
    expect(result.recordset.map((r) => r.name).sort()).toEqual([...CHECKS].sort());
  });

  it('creates the named UNIQUE key constraints backing rucNormalizado, the merge rule, correos and the 1:1 pipeline row', async () => {
    const result = await pool.request().query<NameRow>(`
      SELECT kc.name
        FROM sys.key_constraints kc
       WHERE kc.type = 'UQ'
         AND kc.parent_object_id IN (OBJECT_ID('dbo.CRM_Empresas'), OBJECT_ID('dbo.CRM_Contactos'), OBJECT_ID('dbo.CRM_Correos'), OBJECT_ID('dbo.CRM_Pipeline'))
       ORDER BY kc.name`);
    expect(result.recordset.map((r) => r.name).sort()).toEqual([...UNIQUES].sort());
  });

  it('creates the named FKs with ON DELETE CASCADE (empresa → contactos → correos → pipeline/history)', async () => {
    const result = await pool.request().query<FkRow>(`
      SELECT fk.name, fk.delete_referential_action
        FROM sys.foreign_keys fk
       WHERE fk.parent_object_id IN (OBJECT_ID('dbo.CRM_Contactos'), OBJECT_ID('dbo.CRM_Correos'), OBJECT_ID('dbo.CRM_Pipeline'), OBJECT_ID('dbo.CRM_Transiciones'), OBJECT_ID('dbo.CRM_Resultados'))
       ORDER BY fk.name`);
    const fks = new Map(result.recordset.map((r) => [r.name, r.delete_referential_action]));
    expect([...fks.keys()].sort()).toEqual([...FKS].sort());
    for (const fk of FKS) {
      expect(fks.get(fk), `${fk} must cascade`).toBe(1); // 1 = ON DELETE CASCADE
    }
  });

  it('creates the filtered unique index UX_CRM_Contactos_Principal WHERE esPrincipal = 1', async () => {
    const result = await pool.request().query<IndexRow>(`
      SELECT name, is_unique, filter_definition
        FROM sys.indexes
       WHERE object_id = OBJECT_ID('dbo.CRM_Contactos') AND name IN ('${INDEXES.join("','")}')`);
    const principal = result.recordset.find((r) => r.name === 'UX_CRM_Contactos_Principal');
    expect(principal, 'filtered unique index must exist').toBeDefined();
    expect(principal?.is_unique).toBe(true);
    expect(principal?.filter_definition ?? '').toContain('esPrincipal');
    expect(principal?.filter_definition ?? '').toContain('1');
  });

  it('creates the CRM_Empresas query indexes, with IX_CRM_Empresas_Responsable covering (tipo, razonSocial, ruc)', async () => {
    const result = await pool.request().query<IndexRow>(`
      SELECT name, is_unique, filter_definition
        FROM sys.indexes
       WHERE object_id = OBJECT_ID('dbo.CRM_Empresas') AND name IN ('${INDEXES.join("','")}')`);
    const names = result.recordset.map((r) => r.name).sort();
    expect(names).toEqual(['IX_CRM_Empresas_Responsable', 'IX_CRM_Empresas_Tipo']);
    expect(result.recordset.every((r) => !r.is_unique)).toBe(true);

    const includes = await pool.request().query<IncludeRow>(`
      SELECT c.name
        FROM sys.index_columns ic
        JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
       WHERE ic.object_id = OBJECT_ID('dbo.CRM_Empresas')
         AND ic.index_id = INDEXPROPERTY(ic.object_id, 'IX_CRM_Empresas_Responsable', 'IndexID')
         AND ic.is_included_column = 1`);
    expect(includes.recordset.map((r) => r.name).sort()).toEqual(
      ['tipo', 'razonSocial', 'ruc'].sort(),
    );
  });

  it('creates the pipeline trio with the design §2 columns (denormalized cadence counters, T14 rechazadoHasta DATE)', async () => {
    const columns = async (table: string): Promise<string[]> => {
      const result = await pool.request().query<NameRow>(`
        SELECT c.name
          FROM sys.columns c
         WHERE c.object_id = OBJECT_ID('dbo.${table}')
         ORDER BY c.name`);
      return result.recordset.map((r) => r.name).sort();
    };

    // CRM_Pipeline — 1:1 row; ciclo/enviosCiclo are the denormalized
    // cadence counters (design §3: cheap queue scans), the DATE columns
    // are day-granularity cadence markers (rechazadoHasta = T14's
    // 3-month cooldown; descansoHasta = T8's 3-month rest).
    expect(await columns('CRM_Pipeline')).toEqual(
      [
        'id',
        'empresaId',
        'flujo',
        'etapa',
        'ciclo',
        'enviosCiclo',
        'fechaCicloInicio',
        'fechaUltimoEnvio',
        'descansoHasta',
        'rechazadoHasta',
        'motivoRechazo',
        'updatedBy',
        'updatedAt',
      ].sort(),
    );

    // CRM_Transiciones — full audit trail (spec G4: who, when, from,
    // to); prev columns are NULL for the creation transitions (T1/T6).
    expect(await columns('CRM_Transiciones')).toEqual(
      [
        'id',
        'empresaId',
        'flujoPrevio',
        'etapaPrevia',
        'flujoNuevo',
        'etapaNueva',
        'evento',
        'motivo',
        'usuario',
        'createdAt',
      ].sort(),
    );

    // CRM_Resultados — result-event rows for productivity (design D4
    // catalog); detalleJson carries free-form context.
    expect(await columns('CRM_Resultados')).toEqual(
      ['id', 'empresaId', 'tipo', 'usuario', 'fecha', 'detalleJson'].sort(),
    );
  });

  it('creates the covering queue index IX_CRM_Pipeline_Etapa and the audit indexes on transiciones/resultados', async () => {
    const names = await pool.request().query<NameRow>(`
      SELECT i.name
        FROM sys.indexes i
       WHERE i.object_id IN (OBJECT_ID('dbo.CRM_Pipeline'), OBJECT_ID('dbo.CRM_Transiciones'), OBJECT_ID('dbo.CRM_Resultados'))
         AND i.name IN ('${INDEXES_PIPELINE.join("','")}')
       ORDER BY i.name`);
    expect(names.recordset.map((r) => r.name).sort()).toEqual([...INDEXES_PIPELINE].sort());

    const includes = await pool.request().query<IncludeRow>(`
      SELECT c.name
        FROM sys.index_columns ic
        JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
       WHERE ic.object_id = OBJECT_ID('dbo.CRM_Pipeline')
         AND ic.index_id = INDEXPROPERTY(ic.object_id, 'IX_CRM_Pipeline_Etapa', 'IndexID')
         AND ic.is_included_column = 1`);
    expect(includes.recordset.map((r) => r.name).sort()).toEqual(
      [
        'empresaId',
        'flujo',
        'enviosCiclo',
        'ciclo',
        'fechaUltimoEnvio',
        'descansoHasta',
        'rechazadoHasta',
      ].sort(),
    );
  });

  it('enforces the pipeline constraints at write time (probe rolled back, zero residue)', async () => {
    // Clean stale probe rows from an aborted earlier run, OUTSIDE the tx.
    await pool
      .request()
      .query(`DELETE FROM dbo.CRM_Empresas WHERE rucNormalizado = '${PROBE_RUC}'`);

    const tx = pool.transaction();
    await tx.begin();
    try {
      await tx
        .request()
        .input('ruc', mssql.NVarChar(30), PROBE_RUC)
        .input('rucNormalizado', mssql.VarChar(30), PROBE_RUC)
        .input('razonSocial', mssql.NVarChar(200), PROBE_RAZON).query(`
          INSERT INTO dbo.CRM_Empresas (ruc, rucNormalizado, razonSocial, tipo, origen)
          VALUES (@ruc, @rucNormalizado, @razonSocial, 'Prospecto', 'Outbound')`);
      const empresa = await tx
        .request()
        .input('rucNormalizado', mssql.VarChar(30), PROBE_RUC)
        .query(`SELECT id FROM dbo.CRM_Empresas WHERE rucNormalizado = @rucNormalizado`);
      const empresaId: number = empresa.recordset[0]?.id ?? -1;

      // Happy path: T6 creates the 1:1 pipeline row with the DEFAULT
      // denormalized counters (ciclo = 1, enviosCiclo = 0).
      await tx.request().input('empresaId', mssql.Int, empresaId).query(`
        INSERT INTO dbo.CRM_Pipeline (empresaId, flujo, etapa)
        VALUES (@empresaId, 'OUTBOUND', 'NUEVO')`);
      const pipeline = await tx
        .request()
        .input('empresaId', mssql.Int, empresaId)
        .query(
          `SELECT ciclo, enviosCiclo FROM dbo.CRM_Pipeline WHERE empresaId = @empresaId`,
        );
      expect(pipeline.recordset[0]?.ciclo).toBe(1);
      expect(pipeline.recordset[0]?.enviosCiclo).toBe(0);

      // 1:1: a second pipeline row for the same empresa is rejected.
      await expect(
        tx.request().input('empresaId', mssql.Int, empresaId).query(`
          INSERT INTO dbo.CRM_Pipeline (empresaId, flujo, etapa)
          VALUES (@empresaId, 'OUTBOUND', 'CADENCIA')`),
      ).rejects.toThrow(/UQ_CRM_Pipeline_Empresa/);

      // Etapa enum: the 11 design D3 states only — 'LEAD' is rejected.
      await expect(
        tx
          .request()
          .input('empresaId', mssql.Int, empresaId + 1)
          .query(`
            INSERT INTO dbo.CRM_Pipeline (empresaId, flujo, etapa)
            VALUES (@empresaId, 'INBOUND', 'LEAD')`),
      ).rejects.toThrow(/CK_CRM_Pipeline_Etapa/);

      // Flujo enum: INBOUND/OUTBOUND only.
      await expect(
        tx
          .request()
          .input('empresaId', mssql.Int, empresaId + 1)
          .query(`
            INSERT INTO dbo.CRM_Pipeline (empresaId, flujo, etapa)
            VALUES (@empresaId, 'LATERAL', 'NUEVO')`),
      ).rejects.toThrow(/CK_CRM_Pipeline_Flujo/);

      // Transiciones: the creation row (T1/T6) carries NULL prev state.
      await tx.request().input('empresaId', mssql.Int, empresaId).query(`
        INSERT INTO dbo.CRM_Transiciones (empresaId, flujoPrevio, etapaPrevia, flujoNuevo, etapaNueva, evento, usuario)
        VALUES (@empresaId, NULL, NULL, 'OUTBOUND', 'NUEVO', 'Alta de empresa', 'probe')`);

      // Resultados: the DROPPED AvanceDeEtapa event must be rejected by
      // the catalog CHECK (design D4 — no double-counting of stage
      // changes; they already live in CRM_Transiciones).
      await expect(
        tx
          .request()
          .input('empresaId', mssql.Int, empresaId)
          .input('fecha', mssql.Date, new Date()).query(`
            INSERT INTO dbo.CRM_Resultados (empresaId, tipo, usuario, fecha)
            VALUES (@empresaId, 'AvanceDeEtapa', 'probe', @fecha)`),
      ).rejects.toThrow(/CK_CRM_Resultados_Tipo/);

      // Resultados: a real catalog event inserts fine (accented VARCHAR
      // literal round-trips through the DB collation).
      await tx
        .request()
        .input('empresaId', mssql.Int, empresaId)
        .input('fecha', mssql.Date, new Date()).query(`
          INSERT INTO dbo.CRM_Resultados (empresaId, tipo, usuario, fecha)
          VALUES (@empresaId, 'CotizaciónEnviada', 'probe', @fecha)`);

      // Cascade: deleting the empresa removes its pipeline and history.
      await tx.request().input('empresaId', mssql.Int, empresaId).query(`
        DELETE FROM dbo.CRM_Empresas WHERE id = @empresaId`);
      for (const tabla of ['CRM_Pipeline', 'CRM_Transiciones', 'CRM_Resultados']) {
        const leftover = await tx
          .request()
          .input('empresaId', mssql.Int, empresaId)
          .query(`SELECT id FROM dbo.${tabla} WHERE empresaId = @empresaId`);
        expect(leftover.recordset, `${tabla} must cascade`).toHaveLength(0);
      }
    } finally {
      await tx.rollback();
    }

    const residue = await pool
      .request()
      .input('rucNormalizado', mssql.VarChar(30), PROBE_RUC)
      .query(`SELECT id FROM dbo.CRM_Empresas WHERE rucNormalizado = @rucNormalizado`);
    expect(residue.recordset).toHaveLength(0);
  });

  it('enforces the constraints at write time (probe rolled back, zero residue)', async () => {
    // Clean stale probe rows from an aborted earlier run, OUTSIDE the tx.
    await pool
      .request()
      .query(`DELETE FROM dbo.CRM_Empresas WHERE rucNormalizado = '${PROBE_RUC}'`);

    const tx = pool.transaction();
    await tx.begin();
    try {
      await tx
        .request()
        .input('ruc', mssql.NVarChar(30), PROBE_RUC)
        .input('rucNormalizado', mssql.VarChar(30), PROBE_RUC)
        .input('razonSocial', mssql.NVarChar(200), PROBE_RAZON).query(`
          INSERT INTO dbo.CRM_Empresas (ruc, rucNormalizado, razonSocial, tipo, origen)
          VALUES (@ruc, @rucNormalizado, @razonSocial, 'Prospecto', 'Outbound')`);
      const empresa = await tx
        .request()
        .input('rucNormalizado', mssql.VarChar(30), PROBE_RUC)
        .query(`SELECT id FROM dbo.CRM_Empresas WHERE rucNormalizado = @rucNormalizado`);
      const empresaId: number = empresa.recordset[0]?.id ?? -1;
      expect(empresaId).toBeGreaterThan(0);

      // Valid contacto + correo: the happy path must actually work.
      await tx.request().input('empresaId', mssql.Int, empresaId).query(`
        INSERT INTO dbo.CRM_Contactos (empresaId, nombre, nombreNormalizado, esPrincipal)
        VALUES (@empresaId, 'Probe A', 'probe a', 1)`);
      const contacto = await tx
        .request()
        .input('empresaId', mssql.Int, empresaId)
        .query(`SELECT id FROM dbo.CRM_Contactos WHERE empresaId = @empresaId`);
      const contactoId: number = contacto.recordset[0]?.id ?? -1;
      await tx.request().input('contactoId', mssql.Int, contactoId).query(`
        INSERT INTO dbo.CRM_Correos (contactoId, correo) VALUES (@contactoId, 'probe@crm.test')`);

      // Exactly-one-principal: a SECOND principal on the same empresa
      // must be rejected by the filtered unique index.
      await expect(
        tx.request().input('empresaId', mssql.Int, empresaId).query(`
          INSERT INTO dbo.CRM_Contactos (empresaId, nombre, nombreNormalizado, esPrincipal)
          VALUES (@empresaId, 'Probe B', 'probe b', 1)`),
      ).rejects.toThrow(/UX_CRM_Contactos_Principal/);

      // Merge-rule backing: the same normalized name within one empresa is rejected.
      await expect(
        tx.request().input('empresaId', mssql.Int, empresaId).query(`
          INSERT INTO dbo.CRM_Contactos (empresaId, nombre, nombreNormalizado, esPrincipal)
          VALUES (@empresaId, 'Probe A', 'probe a', 0)`),
      ).rejects.toThrow(/UQ_CRM_Contactos_EmpresaNombre/);

      // Correo dedup per contacto.
      await expect(
        tx.request().input('contactoId', mssql.Int, contactoId).query(`
          INSERT INTO dbo.CRM_Correos (contactoId, correo) VALUES (@contactoId, 'probe@crm.test')`),
      ).rejects.toThrow(/UQ_CRM_Correos_ContactoCorreo/);
    } finally {
      await tx.rollback();
    }

    const residue = await pool
      .request()
      .input('rucNormalizado', mssql.VarChar(30), PROBE_RUC)
      .query(`SELECT id FROM dbo.CRM_Empresas WHERE rucNormalizado = @rucNormalizado`);
    expect(residue.recordset).toHaveLength(0);
  });
});

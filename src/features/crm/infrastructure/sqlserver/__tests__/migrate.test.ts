import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as mssql from 'mssql';

import { getHolomedicPool } from '@/lib/db';

import { migrate } from '../migrate';
import { loadEnvLocal } from './loadEnvLocal';

loadEnvLocal();

/**
 * DB integration contract for the CRM schema (design §2; pr2 scope:
 * CRM_Empresas / CRM_Contactos / CRM_Correos — pr6 adds the
 * CRM_Importaciones job table).
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

const TABLAS = ['CRM_Empresas', 'CRM_Contactos', 'CRM_Correos', 'CRM_Importaciones'] as const;
const CHECKS = ['CK_CRM_Empresas_Tipo', 'CK_CRM_Empresas_Origen'] as const;
const UNIQUES = [
  'UQ_CRM_Empresas_RucNormalizado',
  'UQ_CRM_Contactos_EmpresaNombre',
  'UQ_CRM_Correos_ContactoCorreo',
] as const;
const FKS = ['FK_CRM_Contactos_Empresa', 'FK_CRM_Correos_Contacto'] as const;
const INDEXES = [
  'UX_CRM_Contactos_Principal',
  'IX_CRM_Empresas_Responsable',
  'IX_CRM_Empresas_Tipo',
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
     WHERE kc.parent_object_id IN (OBJECT_ID('dbo.CRM_Empresas'), OBJECT_ID('dbo.CRM_Contactos'), OBJECT_ID('dbo.CRM_Correos'), OBJECT_ID('dbo.CRM_Importaciones'))
    UNION ALL
    SELECT 'CHECK', cc.name
      FROM sys.check_constraints cc
     WHERE cc.parent_object_id IN (OBJECT_ID('dbo.CRM_Empresas'), OBJECT_ID('dbo.CRM_Contactos'), OBJECT_ID('dbo.CRM_Correos'))
    UNION ALL
    SELECT 'FK', fk.name
      FROM sys.foreign_keys fk
     WHERE fk.parent_object_id IN (OBJECT_ID('dbo.CRM_Contactos'), OBJECT_ID('dbo.CRM_Correos'))
    UNION ALL
    SELECT 'INDEX', i.name
      FROM sys.indexes i
     WHERE i.object_id IN (OBJECT_ID('dbo.CRM_Empresas'), OBJECT_ID('dbo.CRM_Contactos'), OBJECT_ID('dbo.CRM_Correos'), OBJECT_ID('dbo.CRM_Importaciones'))
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
    // 4 tables (3 registry + job) + 7 key constraints (4 PK + 3 UQ) +
    // 2 CHECKs + 2 FKs + 10 indexes (3 named + 3 backing the UQs +
    // 4 clustered PKs).
    expect(before).toHaveLength(4 + 7 + 2 + 2 + 10);
  });

  it('creates the registry tables (Empresas → Contactos → Correos) and the CRM_Importaciones job table', async () => {
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

  it('creates the named CHECK constraints for the tipo/origen enums on CRM_Empresas', async () => {
    const result = await pool
      .request()
      .query<NameRow>(
        `SELECT name FROM sys.check_constraints
          WHERE parent_object_id = OBJECT_ID('dbo.CRM_Empresas') ORDER BY name`,
      );
    expect(result.recordset.map((r) => r.name).sort()).toEqual([...CHECKS].sort());
  });

  it('creates the named UNIQUE key constraints backing rucNormalizado, the merge rule and correos', async () => {
    const result = await pool.request().query<NameRow>(`
      SELECT kc.name
        FROM sys.key_constraints kc
       WHERE kc.type = 'UQ'
         AND kc.parent_object_id IN (OBJECT_ID('dbo.CRM_Empresas'), OBJECT_ID('dbo.CRM_Contactos'), OBJECT_ID('dbo.CRM_Correos'))
       ORDER BY kc.name`);
    expect(result.recordset.map((r) => r.name).sort()).toEqual([...UNIQUES].sort());
  });

  it('creates the named FKs with ON DELETE CASCADE (empresa → contactos → correos)', async () => {
    const result = await pool.request().query<FkRow>(`
      SELECT fk.name, fk.delete_referential_action
        FROM sys.foreign_keys fk
       WHERE fk.parent_object_id IN (OBJECT_ID('dbo.CRM_Contactos'), OBJECT_ID('dbo.CRM_Correos'))
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

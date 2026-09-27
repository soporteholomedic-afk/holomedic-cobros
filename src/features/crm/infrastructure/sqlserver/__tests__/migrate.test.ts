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
  'CRM_Handoffs',
  'CRM_Actividades',
  'CRM_Asignaciones',
  'CRM_EnviosCorreos',
] as const;
const CHECKS = [
  'CK_CRM_Empresas_Tipo',
  'CK_CRM_Empresas_Origen',
  'CK_CRM_Pipeline_Flujo',
  'CK_CRM_Pipeline_Etapa',
  'CK_CRM_Resultados_Tipo',
  'CK_CRM_Actividades_Tipo',
  'CK_CRM_Asignaciones_Accion',
  'CK_CRM_EnviosCorreos_Plantilla',
  'CK_CRM_EnviosCorreos_Estado',
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
  'FK_CRM_Handoffs_Empresa',
  'FK_CRM_Actividades_Empresa',
  'FK_CRM_Actividades_Contacto',
  'FK_CRM_Asignaciones_Empresa',
  'FK_CRM_EnviosCorreos_Empresa',
  'FK_CRM_EnviosCorreos_Contacto',
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
const INDEXES_HANDOFFS = ['IX_CRM_Handoffs_EmpresaFecha'] as const;
const INDEXES_ACTIVIDADES = ['IX_CRM_Actividades_EmpresaFecha', 'IX_CRM_Actividades_UsuarioFecha'] as const;
const INDEXES_ASIGNACIONES = ['IX_CRM_Asignaciones_EmpresaFecha'] as const;
const INDEXES_ENVIOS = ['IX_CRM_EnviosCorreos_EmpresaFecha'] as const;

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
     WHERE kc.parent_object_id IN (OBJECT_ID('dbo.CRM_Empresas'), OBJECT_ID('dbo.CRM_Contactos'), OBJECT_ID('dbo.CRM_Correos'), OBJECT_ID('dbo.CRM_Importaciones'), OBJECT_ID('dbo.CRM_Pipeline'), OBJECT_ID('dbo.CRM_Transiciones'), OBJECT_ID('dbo.CRM_Resultados'), OBJECT_ID('dbo.CRM_Handoffs'), OBJECT_ID('dbo.CRM_Actividades'), OBJECT_ID('dbo.CRM_Asignaciones'), OBJECT_ID('dbo.CRM_EnviosCorreos'))
    UNION ALL
    SELECT 'CHECK', cc.name
      FROM sys.check_constraints cc
     WHERE cc.parent_object_id IN (OBJECT_ID('dbo.CRM_Empresas'), OBJECT_ID('dbo.CRM_Pipeline'), OBJECT_ID('dbo.CRM_Resultados'), OBJECT_ID('dbo.CRM_Actividades'), OBJECT_ID('dbo.CRM_Asignaciones'), OBJECT_ID('dbo.CRM_EnviosCorreos'))
    UNION ALL
    SELECT 'FK', fk.name
      FROM sys.foreign_keys fk
     WHERE fk.parent_object_id IN (OBJECT_ID('dbo.CRM_Contactos'), OBJECT_ID('dbo.CRM_Correos'), OBJECT_ID('dbo.CRM_Pipeline'), OBJECT_ID('dbo.CRM_Transiciones'), OBJECT_ID('dbo.CRM_Resultados'), OBJECT_ID('dbo.CRM_Handoffs'), OBJECT_ID('dbo.CRM_Actividades'), OBJECT_ID('dbo.CRM_Asignaciones'), OBJECT_ID('dbo.CRM_EnviosCorreos'))
    UNION ALL
    SELECT 'INDEX', i.name
      FROM sys.indexes i
     WHERE i.object_id IN (OBJECT_ID('dbo.CRM_Empresas'), OBJECT_ID('dbo.CRM_Contactos'), OBJECT_ID('dbo.CRM_Correos'), OBJECT_ID('dbo.CRM_Importaciones'), OBJECT_ID('dbo.CRM_Pipeline'), OBJECT_ID('dbo.CRM_Transiciones'), OBJECT_ID('dbo.CRM_Resultados'), OBJECT_ID('dbo.CRM_Handoffs'), OBJECT_ID('dbo.CRM_Actividades'), OBJECT_ID('dbo.CRM_Asignaciones'), OBJECT_ID('dbo.CRM_EnviosCorreos'))
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
    // 11 tables (3 registry + job + 3 pipeline + handoffs + activities
    // + asignaciones + envios-correos) + 15 key constraints (11 PK + 4 UQ)
    // + 9 CHECKs + 11 FKs + 28 indexes (13 named + 4 backing the UQs
    // + 11 clustered PKs).
    expect(before).toHaveLength(11 + 15 + 9 + 11 + 28);
    // Existing rows untouched: the additive migration performs no DML —
    // registry row counts are identical across the re-run.
    const empresas = await pool.request().query(`SELECT COUNT(*) AS n FROM dbo.CRM_Empresas`);
    const contactos = await pool.request().query(`SELECT COUNT(*) AS n FROM dbo.CRM_Contactos`);
    expect(empresas.recordset[0]?.n).toBeGreaterThan(0);
    expect(contactos.recordset[0]?.n).toBeGreaterThan(0);
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

  it('creates the named CHECK constraints for the empresa enums, the pipeline flujo/etapa, the result catalog and the assignment accion', async () => {
    const result = await pool
      .request()
      .query<NameRow>(
        `SELECT name FROM sys.check_constraints
          WHERE parent_object_id IN (OBJECT_ID('dbo.CRM_Empresas'), OBJECT_ID('dbo.CRM_Pipeline'), OBJECT_ID('dbo.CRM_Resultados'), OBJECT_ID('dbo.CRM_Actividades'), OBJECT_ID('dbo.CRM_Asignaciones'), OBJECT_ID('dbo.CRM_EnviosCorreos'))
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

  it('creates the named FKs with ON DELETE CASCADE (empresa → contactos → correos → pipeline/history/handoffs/asignaciones)', async () => {
    const result = await pool.request().query<FkRow>(`
      SELECT fk.name, fk.delete_referential_action
        FROM sys.foreign_keys fk
        WHERE fk.parent_object_id IN (OBJECT_ID('dbo.CRM_Contactos'), OBJECT_ID('dbo.CRM_Correos'), OBJECT_ID('dbo.CRM_Pipeline'), OBJECT_ID('dbo.CRM_Transiciones'), OBJECT_ID('dbo.CRM_Resultados'), OBJECT_ID('dbo.CRM_Handoffs'), OBJECT_ID('dbo.CRM_Actividades'), OBJECT_ID('dbo.CRM_Asignaciones'), OBJECT_ID('dbo.CRM_EnviosCorreos'))
       ORDER BY fk.name`);
    const fks = new Map(result.recordset.map((r) => [r.name, r.delete_referential_action]));
    expect([...fks.keys()].sort()).toEqual([...FKS].sort());
    for (const fk of FKS) {
      if (fk === 'FK_CRM_Actividades_Contacto' || fk === 'FK_CRM_EnviosCorreos_Contacto') {
        // NO ACTION (0): SQL Server forbids two cascade paths to the
        // empresa graph (Actividades/EnviosCorreos → Contactos →
        // Empresas beside their own → Empresas cascade); the empresa
        // cascade already removes the rows.
        expect(fks.get(fk), `${fk} must be NO ACTION (single cascade path rule)`).toBe(0);
        continue;
      }
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

  it('creates the pipeline trio with the design §2 columns (denormalized cadence counters, T14 rechazadoHasta DATE)', async () => {    const columns = async (table: string): Promise<string[]> => {
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

    // CRM_Handoffs (pr10) — handoff records (design §2: área, nota,
    // user; T5 writes one inside the transition transaction).
    expect(await columns('CRM_Handoffs')).toEqual(
      ['id', 'empresaId', 'area', 'nota', 'usuario', 'createdAt'].sort(),
    );

    // CRM_Actividades (pr13) — the activity log the cadence send
    // writes next to the pipeline counters (design §2: tipo catalog
    // CHECK, contactoId addressee NULL-able, business fecha DATE).
    expect(await columns('CRM_Actividades')).toEqual(
      ['id', 'empresaId', 'contactoId', 'tipo', 'asunto', 'detalle', 'usuario', 'fecha', 'createdAt'].sort(),
    );

    // CRM_Asignaciones (pr14) — the assignment audit trail (spec G5:
    // every ASIGNADO/REASIGNADO/DEVUELTO event with actor + timestamp;
    // responsablePrevio/responsableNuevo NULL = pool).
    expect(await columns('CRM_Asignaciones')).toEqual(
      ['id', 'empresaId', 'accion', 'responsablePrevio', 'responsableNuevo', 'actorUsuario', 'createdAt'].sort(),
    );

    // CRM_EnviosCorreos (rediseno-crm-panel) — the per-email dispatch
    // log (design D3): template key + recipient + messageId + estado,
    // separate from the operator-facing CRM_Actividades history.
    expect(await columns('CRM_EnviosCorreos')).toEqual(
      [
        'id',
        'empresaId',
        'contactoId',
        'plantilla',
        'destinatario',
        'messageId',
        'estado',
        'errorInfo',
        'usuario',
        'createdAt',
      ].sort(),
    );
  });

  it('adds the normalization columns gated and nullable (CRM_Empresas.sector/cantidadTrabajadores, CRM_Contactos.cargo)', async () => {
    const result = await pool.request().query<{ name: string; table_name: string; is_nullable: number; tipo: string }>(`
      SELECT c.name, t.name AS table_name, c.is_nullable, TYPE_NAME(c.user_type_id) AS tipo
        FROM sys.columns c
        JOIN sys.tables t ON t.object_id = c.object_id
       WHERE (t.name = 'CRM_Empresas' AND c.name IN ('sector', 'cantidadTrabajadores'))
          OR (t.name = 'CRM_Contactos' AND c.name = 'cargo')
       ORDER BY t.name, c.name`);
    const porTabla = new Map<string, { is_nullable: number; tipo: string }>();
    for (const row of result.recordset) porTabla.set(`${row.table_name}.${row.name}`, { is_nullable: row.is_nullable, tipo: row.tipo });
    expect([...porTabla.keys()].sort()).toEqual([
      'CRM_Contactos.cargo',
      'CRM_Empresas.cantidadTrabajadores',
      'CRM_Empresas.sector',
    ]);
    // All three are additive NULL columns — existing rows keep NULL.
    // (mssql surfaces the sys.columns bit as a JS boolean.)
    for (const col of porTabla.values()) {
      expect(Boolean(col.is_nullable)).toBe(true);
    }
    expect(porTabla.get('CRM_Empresas.sector')?.tipo).toBe('nvarchar');
    expect(porTabla.get('CRM_Empresas.cantidadTrabajadores')?.tipo).toBe('int');
    expect(porTabla.get('CRM_Contactos.cargo')?.tipo).toBe('nvarchar');
  });

  it('creates the handoff audit index IX_CRM_Handoffs_EmpresaFecha', async () => {
    const names = await pool.request().query<NameRow>(`
      SELECT i.name
        FROM sys.indexes i
       WHERE i.object_id = OBJECT_ID('dbo.CRM_Handoffs')
         AND i.name IN ('${INDEXES_HANDOFFS.join("','")}')
       ORDER BY i.name`);
    expect(names.recordset.map((r) => r.name).sort()).toEqual([...INDEXES_HANDOFFS].sort());
  });

  it('creates the assignment history index IX_CRM_Asignaciones_EmpresaFecha (pr14, spec G5 timeline)', async () => {
    const names = await pool.request().query<NameRow>(`
      SELECT i.name
        FROM sys.indexes i
       WHERE i.object_id = OBJECT_ID('dbo.CRM_Asignaciones')
         AND i.name IN ('${INDEXES_ASIGNACIONES.join("','")}')
       ORDER BY i.name`);
    expect(names.recordset.map((r) => r.name).sort()).toEqual([...INDEXES_ASIGNACIONES].sort());
  });

  it('creates the send-log timeline index IX_CRM_EnviosCorreos_EmpresaFecha (ficha timeline reads)', async () => {
    const names = await pool.request().query<NameRow>(`
      SELECT i.name
        FROM sys.indexes i
       WHERE i.object_id = OBJECT_ID('dbo.CRM_EnviosCorreos')
         AND i.name IN ('${INDEXES_ENVIOS.join("','")}')
       ORDER BY i.name`);
    expect(names.recordset.map((r) => r.name).sort()).toEqual([...INDEXES_ENVIOS].sort());
  });

  it('creates the activity indexes (IX_CRM_Actividades_EmpresaFecha covering + UsuarioFecha) for pr13 sends and pr16 productivity', async () => {
    const names = await pool.request().query<NameRow>(`
      SELECT i.name
        FROM sys.indexes i
       WHERE i.object_id = OBJECT_ID('dbo.CRM_Actividades')
         AND i.name IN ('${INDEXES_ACTIVIDADES.join("','")}')
       ORDER BY i.name`);
    expect(names.recordset.map((r) => r.name).sort()).toEqual([...INDEXES_ACTIVIDADES].sort());

    const includes = await pool.request().query<IncludeRow>(`
      SELECT c.name
        FROM sys.index_columns ic
        JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
       WHERE ic.object_id = OBJECT_ID('dbo.CRM_Actividades')
         AND ic.index_id = INDEXPROPERTY(ic.object_id, 'IX_CRM_Actividades_EmpresaFecha', 'IndexID')
         AND ic.is_included_column = 1`);
    expect(includes.recordset.map((r) => r.name).sort()).toEqual(['tipo', 'asunto', 'usuario'].sort());
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

      // Handoffs (pr10): the T5 record lands with its audit columns.
      await tx.request().input('empresaId', mssql.Int, empresaId).query(`
        INSERT INTO dbo.CRM_Handoffs (empresaId, area, nota, usuario)
        VALUES (@empresaId, 'Operaciones', 'probe handoff', 'probe')`);

      // Asignaciones (pr14): the G5 event row lands with previo/nuevo
      // NULL = pool semantics, then the accion enum rejects outsiders.
      await tx.request().input('empresaId', mssql.Int, empresaId).query(`
        INSERT INTO dbo.CRM_Asignaciones (empresaId, accion, responsablePrevio, responsableNuevo, actorUsuario)
        VALUES (@empresaId, 'ASIGNADO', NULL, 'jperez', 'admin')`);
      await expect(
        tx.request().input('empresaId', mssql.Int, empresaId).query(`
          INSERT INTO dbo.CRM_Asignaciones (empresaId, accion, responsablePrevio, responsableNuevo, actorUsuario)
          VALUES (@empresaId, 'ARCHIVADO', NULL, NULL, 'admin')`),
      ).rejects.toThrow(/CK_CRM_Asignaciones_Accion/);

      // EnviosCorreos (rediseno-crm-panel): a dispatch row lands with
      // its plantilla/estado catalog; outsiders are rejected by the
      // CHECKs. contactoId stays NULL (addressee is optional; the
      // contacto FK is integrity-only, NO ACTION per the cascade rule).
      await tx.request().input('empresaId', mssql.Int, empresaId).query(`
        INSERT INTO dbo.CRM_EnviosCorreos (empresaId, contactoId, plantilla, destinatario, messageId, estado, usuario)
        VALUES (@empresaId, NULL, 'carta_presentacion', 'probe@crm.test', '<probe@crm.test>', 'ENVIADO', 'probe')`);
      await expect(
        tx.request().input('empresaId', mssql.Int, empresaId).query(`
          INSERT INTO dbo.CRM_EnviosCorreos (empresaId, plantilla, destinatario, estado, usuario)
          VALUES (@empresaId, 'folleto', 'probe@crm.test', 'ENVIADO', 'probe')`),
      ).rejects.toThrow(/CK_CRM_EnviosCorreos_Plantilla/);
      await expect(
        tx.request().input('empresaId', mssql.Int, empresaId).query(`
          INSERT INTO dbo.CRM_EnviosCorreos (empresaId, plantilla, destinatario, estado, usuario)
          VALUES (@empresaId, 'seguimiento_1', 'probe@crm.test', 'PENDIENTE', 'probe')`),
      ).rejects.toThrow(/CK_CRM_EnviosCorreos_Estado/);

      // Cascade: deleting the empresa removes its pipeline, history,
      // handoffs, asignaciones and the send log.
      await tx.request().input('empresaId', mssql.Int, empresaId).query(`
        DELETE FROM dbo.CRM_Empresas WHERE id = @empresaId`);
      for (const tabla of ['CRM_Pipeline', 'CRM_Transiciones', 'CRM_Resultados', 'CRM_Handoffs', 'CRM_Asignaciones', 'CRM_EnviosCorreos']) {
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

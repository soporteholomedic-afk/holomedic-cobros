import * as mssql from 'mssql';

import type { MarcacionRaw, MarcacionWire, TipoVerificacion } from '../../domain/entities';
import type { IMarcacionRepository } from '../../domain/ports';

/**
 * SQL Server adapter for raw punches (ADR-4). `insertarLote` is the
 * ingestion hot path (REQ-F1-01/02): idempotent bulk insert deduped by
 * the `uq_marcacion (userId, fechaHora, punch)` constraint, batched in
 * ~300-row chunks to stay under SQL Server's 2100-parameter limit, each
 * chunk atomic in its own transaction. `listarDelDia` feeds the dashboard
 * and `reasignarEmpleado` the RRHH backfill (WU12); `buscar` lands with
 * the histórico (WU14) and fails loudly until then.
 */

/** Rows per INSERT…SELECT statement: 300×4 + 1 = 1201 parameters (≤ 2100). */
const FILAS_POR_CHUNK = 300;
/** Separate user_id probe statement: 1 parameter per row (huge headroom). */
const USUARIOS_POR_CHUNK = 1000;

const INSERT_BASE = `
INSERT INTO dbo.marcaciones_raw (dispositivoId, userId, empleadoId, fechaHora, punch, tipoVerificacion)
SELECT @d0, v.userId, e.id, CAST(v.fechaHora AS DATETIME2(0)), v.punch, v.tipoVerificacion
FROM (VALUES`;

const INSERT_TAIL = `) AS v(userId, fechaHora, punch, tipoVerificacion)
LEFT JOIN dbo.empleados e ON e.userId = v.userId
WHERE NOT EXISTS (
  SELECT 1 FROM dbo.marcaciones_raw m
  WHERE m.userId = v.userId AND m.fechaHora = CAST(v.fechaHora AS DATETIME2(0)) AND m.punch = v.punch
)`;

interface MarcacionLote {
  insertados: number;
  userIdsDesconocidos: string[];
}

interface MarcacionRow {
  id: number;
  dispositivoId: number;
  userId: string;
  empleadoId: number | null;
  fechaHora: Date;
  punch: number;
  tipoVerificacion: string;
  procesada: boolean;
  createdAt: Date;
}

function filaAMarcacion(fila: MarcacionRow): MarcacionRaw {
  return {
    id: fila.id,
    dispositivoId: fila.dispositivoId,
    userId: fila.userId,
    empleadoId: fila.empleadoId,
    fechaHora: fila.fechaHora,
    punch: fila.punch,
    tipoVerificacion: fila.tipoVerificacion as TipoVerificacion,
    procesada: Boolean(fila.procesada),
    createdAt: fila.createdAt,
  };
}

export class SqlServerMarcacionRepository implements IMarcacionRepository {
  constructor(private readonly pool: mssql.ConnectionPool) {}

  /**
   * Insert the batch idempotently. Intra-lote duplicates are collapsed
   * BEFORE the VALUES constructor is built — two equal rows inside one
   * statement would violate uq_marcacion. `insertados` comes from the
   * engine's rowsAffected (cross-batch duplicates already present in
   * the table are absorbed by the NOT EXISTS guard).
   */
  async insertarLote(dispositivoId: number, items: MarcacionWire[]): Promise<MarcacionLote> {
    if (items.length === 0) {
      return { insertados: 0, userIdsDesconocidos: [] };
    }

    // DISTINCT intra-lote (ADR-4), insertion order preserved.
    const unicas = new Map<string, MarcacionWire>();
    for (const item of items) {
      unicas.set(`${item.user_id}|${item.fecha_hora}|${item.punch}`, item);
    }
    const filas = [...unicas.values()];

    const userIdsDesconocidos = await this.buscarUserIdsDesconocidos(
      filas.map((f) => f.user_id),
    );
    const insertados = await this.insertarChunks(dispositivoId, filas);
    return { insertados, userIdsDesconocidos };
  }

  /** user_ids with NO ficha row at all — any estado (incl. PENDIENTE_FICHA) counts as known (REQ-F1-02). */
  private async buscarUserIdsDesconocidos(userIds: string[]): Promise<string[]> {
    const distintos = [...new Set(userIds)];
    const desconocidos: string[] = [];
    for (let i = 0; i < distintos.length; i += USUARIOS_POR_CHUNK) {
      const chunk = distintos.slice(i, i + USUARIOS_POR_CHUNK);
      const request = this.pool.request();
      const valores = chunk.map((_, j) => `(@k${j})`).join(', ');
      chunk.forEach((userId, j) => request.input(`k${j}`, mssql.VarChar(20), userId));
      const result = await request.query(`
SELECT v.userId
FROM (VALUES ${valores}) AS v(userId)
WHERE NOT EXISTS (SELECT 1 FROM dbo.empleados e WHERE e.userId = v.userId)`);
      for (const row of result.recordset as Array<{ userId: string }>) {
        desconocidos.push(String(row.userId));
      }
    }
    return desconocidos;
  }

  /** One transaction per ~300-row chunk (atomic per chunk, ADR-4). */
  private async insertarChunks(dispositivoId: number, filas: MarcacionWire[]): Promise<number> {
    let insertados = 0;
    for (let i = 0; i < filas.length; i += FILAS_POR_CHUNK) {
      const chunk = filas.slice(i, i + FILAS_POR_CHUNK);
      const tx = this.pool.transaction();
      await tx.begin();
      try {
        const request = tx.request();
        request.input('d0', mssql.Int, dispositivoId);
        const tuplas = chunk.map((fila, j) => {
          request.input(`u${j}`, mssql.VarChar(20), fila.user_id);
          request.input(`f${j}`, mssql.VarChar(19), fila.fecha_hora);
          request.input(`p${j}`, mssql.Int, fila.punch);
          request.input(`t${j}`, mssql.VarChar(15), fila.tipo_verificacion);
          return `(@u${j}, @f${j}, @p${j}, @t${j})`;
        });
        const result = await request.query(`${INSERT_BASE} ${tuplas.join(', ')} ${INSERT_TAIL}`);
        insertados += result.rowsAffected[0] ?? 0;
        await tx.commit();
      } catch (error) {
        await tx.rollback();
        throw error;
      }
    }
    return insertados;
  }

  /**
   * Backfill (REQ-F1-10): punches captured before the ficha existed have
   * empleadoId NULL; once RRHH completes the ficha, every unresolved row
   * of that device userId points to it. Only NULL rows are touched — a
   * row already resolved needs no rewrite (userId is UNIQUE in empleados,
   * so any existing resolution already points to this same person).
   */
  async reasignarEmpleado(userId: string, empleadoId: number): Promise<number> {
    const result = await this.pool
      .request()
      .input('userId', mssql.VarChar(20), userId)
      .input('empleadoId', mssql.Int, empleadoId)
      .query(`
UPDATE dbo.marcaciones_raw
   SET empleadoId = @empleadoId
 WHERE userId = @userId AND empleadoId IS NULL`);
    return result.rowsAffected[0] ?? 0;
  }

  /** All punches of a calendar date (YYYY-MM-DD) — half-open range so idx_marcaciones_fecha stays sargable. */
  async listarDelDia(fecha: string): Promise<MarcacionRaw[]> {
    const result = await this.pool
      .request()
      .input('desde', mssql.VarChar(19), `${fecha}T00:00:00`)
      .input('hasta', mssql.VarChar(19), `${fecha}T23:59:59`)
      .query(`
SELECT id, dispositivoId, userId, empleadoId, fechaHora, punch, tipoVerificacion, procesada, createdAt
FROM dbo.marcaciones_raw
WHERE fechaHora >= CAST(@desde AS DATETIME2(0)) AND fechaHora <= CAST(@hasta AS DATETIME2(0))
ORDER BY fechaHora`);
    return (result.recordset as unknown as MarcacionRow[]).map(filaAMarcacion);
  }

  async buscar(): Promise<never> {
    throw new Error(
      'SqlServerMarcacionRepository.buscar llega con el histórico (WU14 del plan asistencia-rrhh-fase1)',
    );
  }
}

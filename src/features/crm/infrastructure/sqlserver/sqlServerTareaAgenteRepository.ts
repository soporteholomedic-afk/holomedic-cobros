import * as mssql from 'mssql';

import type { ResultadoCrearTarea, TareaAgente, TipoTareaAgente } from '../../domain/entities';
import type { EntradaCrearTareaAgente, TareaAgenteRepository } from '../../domain/ports';

/**
 * SQL Server adapter for the agent-task queue port (agente-ia-crm
 * E2·T5). Thin persister over CRM_AgenteTareas — the retry/cooling
 * POLICY lives in the use case; this owns the atomic claim: one
 * UPDATE … OUTPUT statement per claim, so the state flip and the
 * returned rows are the same operation (no read-then-write window).
 *
 * `crearSiNoExiste` catches the UNIQUE (conversacionId, mensajeId,
 * tipo) violation (2601/2627 — the procesarMensajeWhatsapp webhook
 * dedup pattern) and SELECTs the existing id: a replayed delivery
 * never double-enqueues. `fallar` counts the attempt and derives the
 * terminal flip (3rd attempt → FALLIDA) inside one UPDATE, mirroring
 * the port contract. BIGINT ids cross tedious as strings
 * (Asignaciones/Mensajes precedent); the adapter maps them.
 */

/** CRM_AgenteTareas read row — BIGINT id/mensajeId as string, DATETIME2 as Date. */
interface TareaRow {
  id: number | string;
  conversacionId: number;
  mensajeId: number | string;
  tipo: string;
  estado: string;
  intentos: number;
  error: string | null;
  creadoEn: Date;
  reclamadaEn: Date | null;
  procesadaEn: Date | null;
}

function mapearTarea(row: TareaRow): TareaAgente {
  return {
    id: Number(row.id),
    conversacionId: row.conversacionId,
    mensajeId: Number(row.mensajeId),
    tipo: row.tipo as TipoTareaAgente,
    estado: row.estado as TareaAgente['estado'],
    intentos: row.intentos,
    error: row.error,
    creadoEn: row.creadoEn,
    reclamadaEn: row.reclamadaEn,
    procesadaEn: row.procesadaEn,
  };
}

/** SQL Server unique-index violation on the task triple: 2601/2627. */
function esViolacionIndiceUnico(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const numero = (err as { number?: unknown }).number;
  return numero === 2601 || numero === 2627;
}

/** The fallar error column stays bounded (port contract: 500 chars). */
const ERROR_MAX_CARACTERES = 500;

/** Attempts after which fallar flips the row to FALLIDA (terminal). */
const INTENTOS_FALLA = 3;

export class SqlServerTareaAgenteRepository implements TareaAgenteRepository {
  constructor(private readonly pool: mssql.ConnectionPool) {}

  async crearSiNoExiste(entrada: EntradaCrearTareaAgente): Promise<ResultadoCrearTarea> {
    try {
      const inserted = await this.pool
        .request()
        .input('conversacionId', mssql.Int, entrada.conversacionId)
        .input('mensajeId', mssql.BigInt, entrada.mensajeId)
        .input('tipo', mssql.VarChar(30), entrada.tipo)
        .query(`
          INSERT INTO dbo.CRM_AgenteTareas (conversacionId, mensajeId, tipo)
          OUTPUT INSERTED.id
          VALUES (@conversacionId, @mensajeId, @tipo)
        `);
      const id = Number((inserted.recordset as { id: number | string }[])[0]?.id);
      if (!Number.isFinite(id)) throw new Error('INSERT de CRM_AgenteTareas no devolvió id');
      return { id, creada: true };
    } catch (err: unknown) {
      if (!esViolacionIndiceUnico(err)) throw err;
      // The triple already exists (replayed delivery / re-vinculación):
      // surface the existing row's id instead of a conflict.
      const existente = await this.pool
        .request()
        .input('conversacionId', mssql.Int, entrada.conversacionId)
        .input('mensajeId', mssql.BigInt, entrada.mensajeId)
        .input('tipo', mssql.VarChar(30), entrada.tipo)
        .query(`
          SELECT id FROM dbo.CRM_AgenteTareas
          WHERE conversacionId = @conversacionId AND mensajeId = @mensajeId AND tipo = @tipo
        `);
      const fila = (existente.recordset as { id: number | string }[])[0];
      if (fila === undefined) throw err;
      return { id: Number(fila.id), creada: false };
    }
  }

  async reclamarPendientes(limite: number): Promise<TareaAgente[]> {
    // The 60 s cooling only delays REQUEUED tasks (reclamadaEn set by
    // a previous claim); fresh tasks (reclamadaEn NULL) are claimed
    // immediately.
    return this.reclamar(
      limite,
      `estado = 'PENDIENTE'
           AND (reclamadaEn IS NULL OR reclamadaEn < DATEADD(SECOND, -60, SYSUTCDATETIME()))`,
    );
  }

  async reclamarAbandonadas(limite: number, minutos: number): Promise<TareaAgente[]> {
    // Crash recovery: a PROCESANDO claim older than `minutos` belongs
    // to a dead run — reclaim it with a fresh timestamp.
    return this.reclamar(
      limite,
      `estado = 'PROCESANDO'
           AND reclamadaEn < DATEADD(MINUTE, -@minutos, SYSUTCDATETIME())`,
      { minutos },
    );
  }

  async completar(id: number): Promise<void> {
    await this.pool
      .request()
      .input('id', mssql.BigInt, id)
      .query(`
        UPDATE dbo.CRM_AgenteTareas
        SET estado = 'COMPLETADA', procesadaEn = SYSUTCDATETIME(), error = NULL
        WHERE id = @id
      `);
  }

  async reencolar(id: number): Promise<void> {
    // reclamadaEn is deliberately KEPT: it is the cooling timestamp
    // the next reclamarPendientes honors (FUERA_DE_HORARIO /
    // AGENTE_DESHABILITADO requeues wait out their 60 s). intentos is
    // deliberately untouched: a requeue is not a failed attempt.
    await this.pool
      .request()
      .input('id', mssql.BigInt, id)
      .query(`UPDATE dbo.CRM_AgenteTareas SET estado = 'PENDIENTE' WHERE id = @id`);
  }

  async fallar(id: number, error: string): Promise<void> {
    // Single UPDATE, old-row semantics in the CASE (SET assignments
    // read the PRE-update intentos): the attempt count and the
    // terminal flip can never diverge.
    await this.pool
      .request()
      .input('id', mssql.BigInt, id)
      .input('error', mssql.NVarChar(ERROR_MAX_CARACTERES), error.slice(0, ERROR_MAX_CARACTERES))
      .query(`
        UPDATE dbo.CRM_AgenteTareas
        SET intentos = intentos + 1,
            error = @error,
            estado = CASE WHEN intentos + 1 >= ${INTENTOS_FALLA} THEN 'FALLIDA' ELSE 'PENDIENTE' END,
            procesadaEn = CASE WHEN intentos + 1 >= ${INTENTOS_FALLA} THEN SYSUTCDATETIME() ELSE procesadaEn END
        WHERE id = @id
      `);
  }

  /**
   * The atomic claim: ONE UPDATE … OUTPUT — the CTE picks the
   * candidate ids (TOP `limite`, id ASC), the UPDATE flips them to
   * PROCESANDO with a fresh UTC claim stamp and OUTPUT returns the
   * claimed rows. Rows come back sorted by id (deterministic batch
   * order for the drain).
   */
  private async reclamar(
    limite: number,
    filtro: string,
    parametros?: { minutos: number },
  ): Promise<TareaAgente[]> {
    const request = this.pool.request().input('limite', mssql.Int, limite);
    if (parametros !== undefined) {
      request.input('minutos', mssql.Int, parametros.minutos);
    }
    const result = await request.query(`
      WITH candidatas AS (
        SELECT TOP (@limite) id
        FROM dbo.CRM_AgenteTareas
        WHERE ${filtro}
        ORDER BY id ASC
      )
      UPDATE tarea
      SET estado = 'PROCESANDO', reclamadaEn = SYSUTCDATETIME()
      OUTPUT INSERTED.id, INSERTED.conversacionId, INSERTED.mensajeId, INSERTED.tipo,
             INSERTED.estado, INSERTED.intentos, INSERTED.error, INSERTED.creadoEn,
             INSERTED.reclamadaEn, INSERTED.procesadaEn
      FROM dbo.CRM_AgenteTareas tarea
      JOIN candidatas ON candidatas.id = tarea.id;
    `);
    return (result.recordset as TareaRow[]).map(mapearTarea).sort((a, b) => a.id - b.id);
  }
}

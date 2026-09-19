import * as mssql from 'mssql';

import { NotFoundError } from '../../domain/errors';
import type { PipelineEmpresa } from '../../domain/entities';
import type {
  CandidatoCola,
  CambiarTipoDatos,
  CrmActividadesRepositoryPort,
  CrmHandoffsRepositoryPort,
  CrmPipelineRepositoryPort,
  CrmResultadosRepositoryPort,
  CrmTransicionesRepositoryPort,
  EnvioCadenciaAPersistir,
  FilaHandoffAudit,
  FilaResultadoAudit,
  FilaTransicionAudit,
  HandoffHistorial,
  TransicionAPersistir,
  TransicionHistorial,
} from '../../domain/ports';

import { withCrmTransaction } from './withCrmTransaction';

/**
 * SQL Server adapter for the pipeline ports (tasks pr10/WU2, design
 * §2b). ONE class implements the four pipeline roles because the
 * transition write is genuinely cross-table: `registrarTransicion`
 * updates CRM_Pipeline and inserts the CRM_Transiciones audit row plus
 * the optional CRM_Resultados / CRM_Handoffs rows inside ONE
 * `withCrmTransaction` — a mid-flight failure leaves the pipeline
 * untouched and zero orphan audit rows (spec G4 audit integrity).
 *
 * The use case (registrarTransicion) computes the WHOLE bundle —
 * machine state + denormalized effects — so this adapter is a thin,
 * dumb persister: it validates nothing but existence (a missing row
 * raises the typed `NotFoundError`). DATE columns cross the boundary
 * as `YYYY-MM-DD` strings (design §2 day-granularity markers).
 */

interface PipelineRow {
  empresaId: number;
  flujo: string;
  etapa: string;
  ciclo: number;
  enviosCiclo: number;
  fechaCicloInicio: Date | null;
  fechaUltimoEnvio: Date | null;
  descansoHasta: Date | null;
  rechazadoHasta: Date | null;
  motivoRechazo: string | null;
  updatedBy: string | null;
  updatedAt: Date;
}

/** CRM_Transiciones read row — BIGINT id crosses tedious as a string. */
interface FilaTransicionLeida {
  id: number | string;
  empresaId: number;
  flujoPrevio: string | null;
  etapaPrevia: string | null;
  flujoNuevo: string;
  etapaNueva: string;
  evento: string;
  motivo: string | null;
  usuario: string;
  createdAt: Date;
}

/** CRM_Handoffs read row — BIGINT id crosses tedious as a string. */
interface FilaHandoffLeida {
  id: number | string;
  empresaId: number;
  area: string;
  nota: string | null;
  usuario: string;
  createdAt: Date;
}

/** Both `ConnectionPool` and `Transaction` expose `.request()`. */
interface RequestSource {
  request(): mssql.Request;
}

/** mssql DATE → 'YYYY-MM-DD' (driver returns UTC midnight). */
function fechaOnly(valor: Date | null): string | null {
  return valor === null ? null : valor.toISOString().slice(0, 10);
}

function mapearFila(row: PipelineRow): PipelineEmpresa {
  return {
    empresaId: row.empresaId,
    flujo: row.flujo as PipelineEmpresa['flujo'],
    etapa: row.etapa as PipelineEmpresa['etapa'],
    ciclo: row.ciclo,
    enviosCiclo: row.enviosCiclo,
    fechaCicloInicio: fechaOnly(row.fechaCicloInicio),
    fechaUltimoEnvio: fechaOnly(row.fechaUltimoEnvio),
    descansoHasta: fechaOnly(row.descansoHasta),
    rechazadoHasta: fechaOnly(row.rechazadoHasta),
    motivoRechazo: row.motivoRechazo,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class SqlServerPipelineRepository
  implements
    CrmPipelineRepositoryPort,
    CrmTransicionesRepositoryPort,
    CrmResultadosRepositoryPort,
    CrmHandoffsRepositoryPort,
    CrmActividadesRepositoryPort
{
  constructor(private readonly pool: mssql.ConnectionPool) {}

  async obtenerPorEmpresaId(empresaId: number): Promise<PipelineEmpresa | null> {
    const result = await this.pool
      .request()
      .input('empresaId', mssql.Int, empresaId)
      .query(`SELECT * FROM dbo.CRM_Pipeline WHERE empresaId = @empresaId`);
    const row = (result.recordset as PipelineRow[])[0];
    return row ? mapearFila(row) : null;
  }

  /**
   * The queue candidates (tasks pr13/WU2): every pipeline row joined
   * with its empresa display fields. The pipeline side rides the
   * covering queue index IX_CRM_Pipeline_Etapa (design §2) and the
   * join lands on the CRM_Empresas PK — one derived-on-request scan,
   * no background jobs. Pipeline-less empresas (origen null) have no
   * row to join, so they cannot appear.
   */
  async listarCandidatosCola(): Promise<CandidatoCola[]> {
    const result = await this.pool.request().query(`
      SELECT p.empresaId, p.flujo, p.etapa, p.ciclo, p.enviosCiclo,
             p.fechaCicloInicio, p.fechaUltimoEnvio, p.descansoHasta,
             p.rechazadoHasta, p.motivoRechazo, p.updatedBy, p.updatedAt,
             e.razonSocial, e.responsable
      FROM dbo.CRM_Pipeline p
      JOIN dbo.CRM_Empresas e ON e.id = p.empresaId
    `);
    return (result.recordset as (PipelineRow & { razonSocial: string; responsable: string | null })[]).map(
      (row) => ({
        ...mapearFila(row),
        razonSocial: row.razonSocial,
        responsable: row.responsable,
      }),
    );
  }

  async registrarTransicion(datos: TransicionAPersistir): Promise<PipelineEmpresa> {
    return withCrmTransaction(this.pool, async (tx) => {
      const update = await tx
        .request()
        .input('empresaId', mssql.Int, datos.empresaId)
        .input('flujo', mssql.VarChar(10), datos.estadoNuevo.flujo)
        .input('etapa', mssql.VarChar(20), datos.estadoNuevo.etapa)
        .input('ciclo', mssql.Int, datos.efectos.ciclo)
        .input('enviosCiclo', mssql.Int, datos.efectos.enviosCiclo)
        .input('fechaCicloInicio', mssql.Date, datos.efectos.fechaCicloInicio)
        .input('fechaUltimoEnvio', mssql.Date, datos.efectos.fechaUltimoEnvio)
        .input('descansoHasta', mssql.Date, datos.efectos.descansoHasta)
        .input('rechazadoHasta', mssql.Date, datos.efectos.rechazadoHasta)
        .input('motivoRechazo', mssql.NVarChar(300), datos.efectos.motivoRechazo)
        .input('usuario', mssql.NVarChar(200), datos.usuario).query(`
          UPDATE dbo.CRM_Pipeline
          SET flujo = @flujo, etapa = @etapa, ciclo = @ciclo, enviosCiclo = @enviosCiclo,
              fechaCicloInicio = @fechaCicloInicio, fechaUltimoEnvio = @fechaUltimoEnvio,
              descansoHasta = @descansoHasta, rechazadoHasta = @rechazadoHasta,
              motivoRechazo = @motivoRechazo, updatedBy = @usuario, updatedAt = SYSDATETIME()
          WHERE empresaId = @empresaId
        `);
      if ((update.rowsAffected[0] ?? 0) === 0) {
        throw new NotFoundError('La empresa no se encuentra en el pipeline');
      }

      await tx
        .request()
        .input('empresaId', mssql.Int, datos.empresaId)
        .input('flujoPrevio', mssql.VarChar(10), datos.estadoPrevio.flujo)
        .input('etapaPrevia', mssql.VarChar(20), datos.estadoPrevio.etapa)
        .input('flujoNuevo', mssql.VarChar(10), datos.estadoNuevo.flujo)
        .input('etapaNueva', mssql.VarChar(20), datos.estadoNuevo.etapa)
        .input('evento', mssql.VarChar(40), datos.evento)
        .input('motivo', mssql.NVarChar(300), datos.motivo)
        .input('usuario', mssql.NVarChar(200), datos.usuario).query(`
          INSERT INTO dbo.CRM_Transiciones
            (empresaId, flujoPrevio, etapaPrevia, flujoNuevo, etapaNueva, evento, motivo, usuario)
          VALUES (@empresaId, @flujoPrevio, @etapaPrevia, @flujoNuevo, @etapaNueva, @evento, @motivo, @usuario)
        `);

      if (datos.resultado !== null) {
        await tx
          .request()
          .input('empresaId', mssql.Int, datos.empresaId)
          .input('tipo', mssql.VarChar(40), datos.resultado)
          .input('usuario', mssql.NVarChar(200), datos.usuario)
          .input('fecha', mssql.Date, datos.hoy).query(`
            INSERT INTO dbo.CRM_Resultados (empresaId, tipo, usuario, fecha)
            VALUES (@empresaId, @tipo, @usuario, @fecha)
          `);
      }

      if (datos.handoff !== null) {
        await tx
          .request()
          .input('empresaId', mssql.Int, datos.empresaId)
          .input('area', mssql.NVarChar(100), datos.handoff.area)
          .input('nota', mssql.NVarChar(mssql.MAX), datos.handoff.nota ?? null)
          .input('usuario', mssql.NVarChar(200), datos.usuario).query(`
            INSERT INTO dbo.CRM_Handoffs (empresaId, area, nota, usuario)
            VALUES (@empresaId, @area, @nota, @usuario)
          `);
      }

      const fila = await this.cargar(tx, datos.empresaId);
      if (!fila) throw new Error('La fila de pipeline desapareció dentro de la transición');
      return fila;
    });
  }

  /**
   * The logged cadence send (tasks pr13/WU1, design §2c/§3) — ONE
   * transaction, three writes: the CRM_Actividades row first (the
   * activity IS the event the engine derives from), then the
   * CRM_Pipeline counter/state update, then the derived T8/T9 audit
   * row when the send moved the machine. A failure anywhere rolls the
   * activity back with the rest — no orphan activity rows.
   */
  async registrarEnvioCadencia(datos: EnvioCadenciaAPersistir): Promise<PipelineEmpresa> {
    return withCrmTransaction(this.pool, async (tx) => {
      await tx
        .request()
        .input('empresaId', mssql.Int, datos.empresaId)
        .input('contactoId', mssql.Int, datos.actividad.contactoId)
        .input('tipo', mssql.VarChar(20), 'ENVIO_CADENCIA')
        .input('asunto', mssql.NVarChar(300), datos.actividad.asunto)
        .input('detalle', mssql.NVarChar(mssql.MAX), datos.actividad.detalle)
        .input('usuario', mssql.NVarChar(200), datos.usuario)
        .input('fecha', mssql.Date, datos.hoy).query(`
          INSERT INTO dbo.CRM_Actividades (empresaId, contactoId, tipo, asunto, detalle, usuario, fecha)
          VALUES (@empresaId, @contactoId, @tipo, @asunto, @detalle, @usuario, @fecha)
        `);

      const update = await tx
        .request()
        .input('empresaId', mssql.Int, datos.empresaId)
        .input('flujo', mssql.VarChar(10), datos.estadoFinal.flujo)
        .input('etapa', mssql.VarChar(20), datos.estadoFinal.etapa)
        .input('ciclo', mssql.Int, datos.efectos.ciclo)
        .input('enviosCiclo', mssql.Int, datos.efectos.enviosCiclo)
        .input('fechaCicloInicio', mssql.Date, datos.efectos.fechaCicloInicio)
        .input('fechaUltimoEnvio', mssql.Date, datos.efectos.fechaUltimoEnvio)
        .input('descansoHasta', mssql.Date, datos.efectos.descansoHasta)
        .input('rechazadoHasta', mssql.Date, datos.efectos.rechazadoHasta)
        .input('motivoRechazo', mssql.NVarChar(300), datos.efectos.motivoRechazo)
        .input('usuario', mssql.NVarChar(200), datos.usuario).query(`
          UPDATE dbo.CRM_Pipeline
          SET flujo = @flujo, etapa = @etapa, ciclo = @ciclo, enviosCiclo = @enviosCiclo,
              fechaCicloInicio = @fechaCicloInicio, fechaUltimoEnvio = @fechaUltimoEnvio,
              descansoHasta = @descansoHasta, rechazadoHasta = @rechazadoHasta,
              motivoRechazo = @motivoRechazo, updatedBy = @usuario, updatedAt = SYSDATETIME()
          WHERE empresaId = @empresaId
        `);
      if ((update.rowsAffected[0] ?? 0) === 0) {
        throw new NotFoundError('La empresa no se encuentra en el pipeline');
      }

      if (datos.transicion) {
        await tx
          .request()
          .input('empresaId', mssql.Int, datos.empresaId)
          .input('flujoPrevio', mssql.VarChar(10), datos.transicion.estadoPrevio.flujo)
          .input('etapaPrevia', mssql.VarChar(20), datos.transicion.estadoPrevio.etapa)
          .input('flujoNuevo', mssql.VarChar(10), datos.transicion.estadoNuevo.flujo)
          .input('etapaNueva', mssql.VarChar(20), datos.transicion.estadoNuevo.etapa)
          .input('evento', mssql.VarChar(40), datos.transicion.evento)
          .input('usuario', mssql.NVarChar(200), datos.usuario).query(`
            INSERT INTO dbo.CRM_Transiciones
              (empresaId, flujoPrevio, etapaPrevia, flujoNuevo, etapaNueva, evento, motivo, usuario)
            VALUES (@empresaId, @flujoPrevio, @etapaPrevia, @flujoNuevo, @etapaNueva, @evento, NULL, @usuario)
          `);
      }

      const fila = await this.cargar(tx, datos.empresaId);
      if (!fila) throw new Error('La fila de pipeline desapareció dentro del envío de cadencia');
      return fila;
    });
  }

  async cambiarTipo(datos: CambiarTipoDatos): Promise<void> {    await withCrmTransaction(this.pool, async (tx) => {
      const update = await tx
        .request()
        .input('empresaId', mssql.Int, datos.empresaId)
        .input('tipo', mssql.VarChar(10), datos.nuevoTipo)
        .input('usuario', mssql.NVarChar(200), datos.usuario).query(`
          UPDATE dbo.CRM_Empresas
          SET tipo = @tipo, updatedBy = @usuario, updatedAt = SYSDATETIME()
          WHERE id = @empresaId
        `);
      if ((update.rowsAffected[0] ?? 0) === 0) {
        throw new NotFoundError('Empresa no encontrada');
      }

      // T16 (design D3/D4): the conversion event rides the same
      // transaction as the tipo update — an orphan result row is as
      // wrong as a missing one.
      if (datos.convertir) {
        await tx
          .request()
          .input('empresaId', mssql.Int, datos.empresaId)
          .input('usuario', mssql.NVarChar(200), datos.usuario)
          .input('fecha', mssql.Date, datos.hoy).query(`
            INSERT INTO dbo.CRM_Resultados (empresaId, tipo, usuario, fecha)
            VALUES (@empresaId, 'ConversiónProspectoACliente', @usuario, @fecha)
          `);
      }
    });
  }

  async listarTransiciones(empresaId: number): Promise<TransicionHistorial[]> {
    const result = await this.pool
      .request()
      .input('empresaId', mssql.Int, empresaId).query(`
        SELECT id, empresaId, flujoPrevio, etapaPrevia, flujoNuevo, etapaNueva,
               evento, motivo, usuario, createdAt
        FROM dbo.CRM_Transiciones
        WHERE empresaId = @empresaId
        ORDER BY createdAt DESC, id DESC
      `);
    return (result.recordset as FilaTransicionLeida[]).map((row) => ({
      id: Number(row.id),
      empresaId: row.empresaId,
      flujoPrevio: (row.flujoPrevio as TransicionHistorial['flujoPrevio']) ?? null,
      etapaPrevia: (row.etapaPrevia as TransicionHistorial['etapaPrevia']) ?? null,
      flujoNuevo: row.flujoNuevo as TransicionHistorial['flujoNuevo'],
      etapaNueva: row.etapaNueva as TransicionHistorial['etapaNueva'],
      evento: row.evento,
      motivo: row.motivo,
      usuario: row.usuario,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async listarHandoffs(empresaId: number): Promise<HandoffHistorial[]> {
    const result = await this.pool
      .request()
      .input('empresaId', mssql.Int, empresaId).query(`
        SELECT id, empresaId, area, nota, usuario, createdAt
        FROM dbo.CRM_Handoffs
        WHERE empresaId = @empresaId
        ORDER BY createdAt DESC, id DESC
      `);
    return (result.recordset as FilaHandoffLeida[]).map((row) => ({
      id: Number(row.id),
      empresaId: row.empresaId,
      area: row.area,
      nota: row.nota,
      usuario: row.usuario,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async registrar(fila: FilaTransicionAudit): Promise<number>;
  async registrar(fila: FilaResultadoAudit): Promise<number>;
  async registrar(fila: FilaHandoffAudit): Promise<number>;
  async registrar(fila: FilaTransicionAudit | FilaResultadoAudit | FilaHandoffAudit): Promise<number> {
    if ('flujoNuevo' in fila) {
      const result = await this.pool
        .request()
        .input('empresaId', mssql.Int, fila.empresaId)
        .input('flujoPrevio', mssql.VarChar(10), fila.flujoPrevio)
        .input('etapaPrevia', mssql.VarChar(20), fila.etapaPrevia)
        .input('flujoNuevo', mssql.VarChar(10), fila.flujoNuevo)
        .input('etapaNueva', mssql.VarChar(20), fila.etapaNueva)
        .input('evento', mssql.VarChar(40), fila.evento)
        .input('motivo', mssql.NVarChar(300), fila.motivo)
        .input('usuario', mssql.NVarChar(200), fila.usuario).query(`
          INSERT INTO dbo.CRM_Transiciones
            (empresaId, flujoPrevio, etapaPrevia, flujoNuevo, etapaNueva, evento, motivo, usuario)
          OUTPUT INSERTED.id
          VALUES (@empresaId, @flujoPrevio, @etapaPrevia, @flujoNuevo, @etapaNueva, @evento, @motivo, @usuario)
        `);
      return this.extraerId(result);
    }
    if ('tipo' in fila) {
      const result = await this.pool
        .request()
        .input('empresaId', mssql.Int, fila.empresaId)
        .input('tipo', mssql.VarChar(40), fila.tipo)
        .input('usuario', mssql.NVarChar(200), fila.usuario)
        .input('fecha', mssql.Date, fila.fecha).query(`
          INSERT INTO dbo.CRM_Resultados (empresaId, tipo, usuario, fecha)
          OUTPUT INSERTED.id
          VALUES (@empresaId, @tipo, @usuario, @fecha)
        `);
      return this.extraerId(result);
    }
    const result = await this.pool
      .request()
      .input('empresaId', mssql.Int, fila.empresaId)
      .input('area', mssql.NVarChar(100), fila.area)
      .input('nota', mssql.NVarChar(mssql.MAX), fila.nota)
      .input('usuario', mssql.NVarChar(200), fila.usuario).query(`
        INSERT INTO dbo.CRM_Handoffs (empresaId, area, nota, usuario)
        OUTPUT INSERTED.id
        VALUES (@empresaId, @area, @nota, @usuario)
      `);
    return this.extraerId(result);
  }

  private async cargar(source: RequestSource, empresaId: number): Promise<PipelineEmpresa | null> {
    const result = await source
      .request()
      .input('empresaId', mssql.Int, empresaId)
      .query(`SELECT * FROM dbo.CRM_Pipeline WHERE empresaId = @empresaId`);
    const row = (result.recordset as PipelineRow[])[0];
    return row ? mapearFila(row) : null;
  }

  private extraerId(result: { recordset: { id: number | string }[] }): number {
    // BIGINT OUTPUT columns cross tedious as strings (precision-safe);
    // the port contract is `number` — v1 volumes stay far below 2^53.
    const id = Number(result.recordset[0]?.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error('INSERT no devolvió id');
    return id;
  }
}

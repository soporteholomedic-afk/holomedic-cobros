import * as mssql from 'mssql';

import type { CrearMensajeInput, MensajeCrm } from '../../domain/entities';
import type { ListarMensajesOpciones, MensajeCrmRepository } from '../../domain/ports';

import { mapearConflictoUnico } from './conflictos';

/**
 * SQL Server adapter for the thread port (agente-ia-crm E1). Thin
 * persister over CRM_Mensajes: the webhook flow checks
 * `existePorIdempotenciaKey` BEFORE inserting and the filtered unique
 * index UX_CRM_Mensajes_Idempotencia is the race backstop (mapped to
 * the typed ConflictError via the shared mapearConflictoUnico).
 * Inserts + the ONE outbox-lite UPDATE (actualizarEnvio) — the conversation counters
 * (ultimoMensajeEn / noLeidos) are the webhook use case's explicit
 * writes, never a hidden side effect here. BIGINT ids cross tedious
 * as strings (Asignaciones precedent); the adapter maps them.
 */

/** CRM_Mensajes read row — BIGINT id as string, DECIMAL(4,3) as number. */
interface MensajeRow {
  id: number | string;
  conversacionId: number;
  direccion: string;
  emisor: string;
  cuerpo: string;
  tipo: string;
  canal: string;
  wamid: string | null;
  idempotenciaKey: string | null;
  estadoEnvio: string | null;
  fuentes: string | null;
  score: number | null;
  modelo: string | null;
  creadoEn: Date;
}

const COLUMNAS = `id, conversacionId, direccion, emisor, cuerpo, tipo, canal, wamid,
                  idempotenciaKey, estadoEnvio, fuentes, score, modelo, creadoEn`;

function mapearMensaje(row: MensajeRow): MensajeCrm {
  return {
    id: Number(row.id),
    conversacionId: row.conversacionId,
    direccion: row.direccion as MensajeCrm['direccion'],
    emisor: row.emisor as MensajeCrm['emisor'],
    cuerpo: row.cuerpo,
    tipo: row.tipo as MensajeCrm['tipo'],
    canal: row.canal as MensajeCrm['canal'],
    wamid: row.wamid,
    idempotenciaKey: row.idempotenciaKey,
    estadoEnvio: row.estadoEnvio as MensajeCrm['estadoEnvio'],
    fuentes: row.fuentes,
    score: row.score,
    modelo: row.modelo,
    creadoEn: row.creadoEn.toISOString(),
  };
}

export class SqlServerMensajeRepository implements MensajeCrmRepository {
  constructor(private readonly pool: mssql.ConnectionPool) {}

  async crear(datos: CrearMensajeInput): Promise<MensajeCrm> {
    try {
      const inserted = await this.pool
        .request()
        .input('conversacionId', mssql.Int, datos.conversacionId)
        .input('direccion', mssql.VarChar(3), datos.direccion)
        .input('emisor', mssql.VarChar(10), datos.emisor)
        .input('cuerpo', mssql.NVarChar(4000), datos.cuerpo)
        .input('tipo', mssql.NVarChar(12), datos.tipo ?? 'TEXTO')
        .input('canal', mssql.NVarChar(20), datos.canal ?? 'WHATSAPP')
        .input('wamid', mssql.VarChar(128), datos.wamid ?? null)
        .input('idempotenciaKey', mssql.VarChar(128), datos.idempotenciaKey ?? null)
        .input('estadoEnvio', mssql.VarChar(10), datos.estadoEnvio ?? null)
        .input('fuentes', mssql.NVarChar(mssql.MAX), datos.fuentes ?? null)
        .input('score', mssql.Decimal(4, 3), datos.score ?? null)
        .input('modelo', mssql.NVarChar(60), datos.modelo ?? null).query(`
          INSERT INTO dbo.CRM_Mensajes
            (conversacionId, direccion, emisor, cuerpo, tipo, canal, wamid,
             idempotenciaKey, estadoEnvio, fuentes, score, modelo)
          OUTPUT INSERTED.id
          VALUES (@conversacionId, @direccion, @emisor, @cuerpo, @tipo, @canal, @wamid,
                  @idempotenciaKey, @estadoEnvio, @fuentes, @score, @modelo)
        `);
      const id = Number((inserted.recordset as { id: number | string }[])[0]?.id);
      if (!Number.isFinite(id)) throw new Error('INSERT de CRM_Mensajes no devolvió id');
      return this.obtenerPorId(id);
    } catch (err: unknown) {
      throw mapearConflictoUnico(err);
    }
  }

  async existePorIdempotenciaKey(key: string): Promise<boolean> {
    const result = await this.pool
      .request()
      .input('idempotenciaKey', mssql.VarChar(128), key)
      .query(
        'SELECT TOP (1) 1 AS presente FROM dbo.CRM_Mensajes WHERE idempotenciaKey = @idempotenciaKey',
      );
    return (result.recordset as { presente: number }[]).length > 0;
  }

  async actualizarEnvio(
    id: number,
    datos: { estadoEnvio: 'ENVIADO' | 'FALLIDO'; wamid?: string | null },
  ): Promise<MensajeCrm | null> {
    // wamid ausente (undefined) = NO tocar el valor existente (un
    // FALLIDO reportado sin wamid no borra el wamid de un intento
    // previo — R3 fallido-borra-wamid); null EXPLÍCITO sí lo borra.
    const request = this.pool
      .request()
      .input('id', mssql.BigInt, id)
      .input('estadoEnvio', mssql.VarChar(10), datos.estadoEnvio);
    const sets = ['estadoEnvio = @estadoEnvio'];
    if (datos.wamid !== undefined) {
      sets.push('wamid = @wamid');
      request.input('wamid', mssql.VarChar(128), datos.wamid);
    }
    const result = await request.query(
      `UPDATE dbo.CRM_Mensajes SET ${sets.join(', ')} OUTPUT INSERTED.id WHERE id = @id`,
    );
    const actualizado = (result.recordset as { id: number | string }[])[0];
    return actualizado === undefined ? null : this.obtenerPorId(Number(actualizado.id));
  }

  async listarPorConversacion(
    conversacionId: number,
    opciones: ListarMensajesOpciones,
  ): Promise<MensajeCrm[]> {
    const request = this.pool
      .request()
      .input('conversacionId', mssql.Int, conversacionId)
      .input('limite', mssql.Int, opciones.limite)
      .input('antesDeId', mssql.BigInt, opciones.antesDeId ?? null);
    const result = await request.query(`
      SELECT TOP (@limite) ${COLUMNAS}
      FROM dbo.CRM_Mensajes
      WHERE conversacionId = @conversacionId
        AND (@antesDeId IS NULL OR id < @antesDeId)
      ORDER BY id DESC
    `);
    return (result.recordset as MensajeRow[]).map(mapearMensaje);
  }

  private async obtenerPorId(id: number): Promise<MensajeCrm> {
    const result = await this.pool
      .request()
      .input('id', mssql.BigInt, id)
      .query(`SELECT ${COLUMNAS} FROM dbo.CRM_Mensajes WHERE id = @id`);
    const row = (result.recordset as MensajeRow[])[0];
    if (!row) throw new Error('El mensaje recién creado no pudo releerse');
    return mapearMensaje(row);
  }
}

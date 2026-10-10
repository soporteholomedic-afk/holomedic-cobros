import * as mssql from 'mssql';

import { normalizarTelefonoE164, telefonoDigitosClave } from '../../domain/normalizar';
import type {
  CanalConversacion,
  ConversacionCrm,
  CrearConversacionInput,
} from '../../domain/entities';
import type {
  BuscarConversacionCanal,
  CandidatoVinculacion,
  ConversacionCrmRepository,
  FiltrosConversaciones,
  VincularConversacionDatos,
} from '../../domain/ports';

import { mapearConflictoUnico } from './conflictos';

/**
 * SQL Server adapter for the conversation port (agente-ia-crm E1).
 * Thin persister over CRM_Conversaciones — the policy lives in the
 * use cases: the webhook flow derives the E.164 telefono before any
 * write (domain normalizarTelefonoE164), and the filtered unique
 * indexes (canal+identificadorCanal / canal+telefono) are the race
 * backstops, mapped to the typed ConflictError via the shared
 * mapearConflictoUnico. Every write touches actualizadoEn. LIKE
 * filtering relies on the database's case-insensitive collation
 * (empresa registry precedent).
 */

/** CRM_Conversaciones read row — DATETIME2(0) crosses tedious as Date. */
interface ConversacionRow {
  id: number;
  empresaId: number | null;
  contactoId: number | null;
  canal: string;
  telefono: string | null;
  identificadorCanal: string | null;
  estado: string;
  asignadaA: string | null;
  modo: string;
  ultimoMensajeEn: Date | null;
  noLeidos: number;
  creadoEn: Date;
  actualizadoEn: Date;
}

const COLUMNAS = `id, empresaId, contactoId, canal, telefono, identificadorCanal,
                  estado, asignadaA, modo, ultimoMensajeEn, noLeidos, creadoEn, actualizadoEn`;

function mapearConversacion(row: ConversacionRow): ConversacionCrm {
  return {
    id: row.id,
    empresaId: row.empresaId,
    contactoId: row.contactoId,
    canal: row.canal as ConversacionCrm['canal'],
    telefono: row.telefono,
    identificadorCanal: row.identificadorCanal,
    estado: row.estado as ConversacionCrm['estado'],
    asignadaA: row.asignadaA,
    modo: row.modo as ConversacionCrm['modo'],
    ultimoMensajeEn: row.ultimoMensajeEn ? row.ultimoMensajeEn.toISOString() : null,
    noLeidos: row.noLeidos,
    creadoEn: row.creadoEn.toISOString(),
    actualizadoEn: row.actualizadoEn.toISOString(),
  };
}

export class SqlServerConversacionRepository implements ConversacionCrmRepository {
  constructor(private readonly pool: mssql.ConnectionPool) {}

  async crear(datos: CrearConversacionInput): Promise<ConversacionCrm> {
    try {
      const inserted = await this.pool
        .request()
        .input('empresaId', mssql.Int, datos.empresaId ?? null)
        .input('contactoId', mssql.Int, datos.contactoId ?? null)
        .input('canal', mssql.NVarChar(20), datos.canal)
        .input('telefono', mssql.VarChar(20), datos.telefono ?? null)
        .input('identificadorCanal', mssql.VarChar(64), datos.identificadorCanal ?? null)
        .input('estado', mssql.VarChar(24), datos.estado ?? 'PENDIENTE_VINCULACION')
        .input('asignadaA', mssql.NVarChar(200), datos.asignadaA ?? null)
        .input('modo', mssql.NVarChar(10), datos.modo ?? 'IA').query(`
          INSERT INTO dbo.CRM_Conversaciones
            (empresaId, contactoId, canal, telefono, identificadorCanal, estado, asignadaA, modo)
          OUTPUT INSERTED.id
          VALUES (@empresaId, @contactoId, @canal, @telefono, @identificadorCanal, @estado, @asignadaA, @modo)
        `);
      const id = (inserted.recordset as { id: number }[])[0]?.id;
      if (id === undefined) throw new Error('INSERT de CRM_Conversaciones no devolvió id');
      const conversacion = await this.obtenerPorId(id);
      if (!conversacion) throw new Error('La conversación recién creada no pudo releerse');
      return conversacion;
    } catch (err: unknown) {
      throw mapearConflictoUnico(err);
    }
  }

  async obtenerPorId(id: number): Promise<ConversacionCrm | null> {
    const result = await this.pool
      .request()
      .input('id', mssql.Int, id)
      .query(`SELECT ${COLUMNAS} FROM dbo.CRM_Conversaciones WHERE id = @id`);
    const row = (result.recordset as ConversacionRow[])[0];
    return row ? mapearConversacion(row) : null;
  }

  async buscarPorCanal(
    canal: CanalConversacion,
    clave: BuscarConversacionCanal,
  ): Promise<ConversacionCrm | null> {
    const request = this.pool.request().input('canal', mssql.NVarChar(20), canal);
    let filtro: string;
    if (clave.telefono !== undefined) {
      request.input('telefono', mssql.VarChar(20), clave.telefono);
      filtro = 'telefono = @telefono';
    } else if (clave.identificadorCanal !== undefined) {
      request.input('identificadorCanal', mssql.VarChar(64), clave.identificadorCanal);
      filtro = 'identificadorCanal = @identificadorCanal';
    } else {
      throw new Error('buscarPorCanal requiere telefono o identificadorCanal');
    }

    const result = await request.query(`
      SELECT TOP (1) ${COLUMNAS}
      FROM dbo.CRM_Conversaciones
      WHERE canal = @canal AND ${filtro}
      ORDER BY ultimoMensajeEn DESC, id DESC
    `);
    const row = (result.recordset as ConversacionRow[])[0];
    return row ? mapearConversacion(row) : null;
  }

  async listar(filtros?: FiltrosConversaciones): Promise<ConversacionCrm[]> {
    const clauses: string[] = [];
    const request = this.pool.request();
    const busqueda = filtros?.busqueda?.trim();
    if (busqueda !== undefined && busqueda !== '') {
      clauses.push(
        '(emp.razonSocial LIKE @busqueda OR con.nombre LIKE @busqueda OR c.telefono LIKE @busqueda)',
      );
      request.input('busqueda', mssql.NVarChar(200), `%${busqueda}%`);
    }
    if (filtros?.estado !== undefined) {
      clauses.push('c.estado = @estado');
      request.input('estado', mssql.VarChar(24), filtros.estado);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const limite = filtros?.limite ?? 50;
    const offset = filtros?.offset ?? 0;

    const result = await request
      .input('limite', mssql.Int, limite)
      .input('offset', mssql.Int, offset).query(`
        SELECT ${COLUMNAS}
        FROM dbo.CRM_Conversaciones c
        LEFT JOIN dbo.CRM_Empresas emp ON emp.id = c.empresaId
        LEFT JOIN dbo.CRM_Contactos con ON con.id = c.contactoId
        ${where}
        ORDER BY c.ultimoMensajeEn DESC, c.id DESC
        OFFSET @offset ROWS FETCH NEXT @limite ROWS ONLY
      `);
    return (result.recordset as ConversacionRow[]).map(mapearConversacion);
  }

  async vincular(
    id: number,
    datos: VincularConversacionDatos,
  ): Promise<ConversacionCrm | null> {
    const request = this.pool
      .request()
      .input('id', mssql.Int, id)
      .input('empresaId', mssql.Int, datos.empresaId)
      .input('contactoId', mssql.Int, datos.contactoId);
    const sets = [
      'empresaId = @empresaId',
      'contactoId = @contactoId',
      'actualizadoEn = SYSDATETIME()',
    ];
    if (datos.telefono !== undefined) {
      sets.push('telefono = @telefono');
      request.input('telefono', mssql.VarChar(20), datos.telefono);
    }
    if (datos.estado !== undefined) {
      sets.push('estado = @estado');
      request.input('estado', mssql.VarChar(24), datos.estado);
    }

    const result = await request.query(
      `UPDATE dbo.CRM_Conversaciones SET ${sets.join(', ')} WHERE id = @id`,
    );
    if ((result.rowsAffected[0] ?? 0) === 0) return null;
    return this.obtenerPorId(id);
  }

  async actualizarEstado(
    id: number,
    estado: ConversacionCrm['estado'],
    asignadaA?: string | null,
  ): Promise<ConversacionCrm | null> {
    const request = this.pool
      .request()
      .input('id', mssql.Int, id)
      .input('estado', mssql.VarChar(24), estado);
    const sets = ['estado = @estado', 'actualizadoEn = SYSDATETIME()'];
    if (asignadaA !== undefined) {
      sets.push('asignadaA = @asignadaA');
      request.input('asignadaA', mssql.NVarChar(200), asignadaA);
    }

    const result = await request.query(
      `UPDATE dbo.CRM_Conversaciones SET ${sets.join(', ')} WHERE id = @id`,
    );
    if ((result.rowsAffected[0] ?? 0) === 0) return null;
    return this.obtenerPorId(id);
  }

  async marcarMensajesLeidos(id: number): Promise<void> {
    await this.pool
      .request()
      .input('id', mssql.Int, id)
      .query(
        'UPDATE dbo.CRM_Conversaciones SET noLeidos = 0, actualizadoEn = SYSDATETIME() WHERE id = @id',
      );
  }

  async registrarActividad(id: number): Promise<void> {
    await this.pool
      .request()
      .input('id', mssql.Int, id)
      .query(
        `UPDATE dbo.CRM_Conversaciones
         SET ultimoMensajeEn = SYSDATETIME(), noLeidos = noLeidos + 1, actualizadoEn = SYSDATETIME()
         WHERE id = @id`,
      );
  }

  async buscarCandidatosVinculacion(telefonoE164: string): Promise<CandidatoVinculacion[]> {
    const result = await this.pool.request().query(`
      SELECT c.id, c.empresaId, c.nombre, c.telefono, e.razonSocial
      FROM dbo.CRM_Contactos c
      JOIN dbo.CRM_Empresas e ON e.id = c.empresaId
      WHERE c.telefono IS NOT NULL
    `);
    const claveEntrante = telefonoDigitosClave(telefonoE164);
    // teléfono es texto libre: la comparación se hace en TS tras
    // normalizar ambos lados (normalizarTelefonoE164 + digitos clave).
    // Optimizable con una columna normalizada si la tabla crece.
    const candidatos: CandidatoVinculacion[] = [];
    for (const row of result.recordset as Array<{
      id: number;
      empresaId: number;
      nombre: string;
      telefono: string;
      razonSocial: string;
    }>) {
      const e164 = normalizarTelefonoE164(row.telefono);
      if (e164 === null) continue;
      if (telefonoDigitosClave(e164) === claveEntrante) {
        candidatos.push({
          empresaId: row.empresaId,
          contactoId: row.id,
          nombreContacto: row.nombre,
          razonSocial: row.razonSocial,
          telefono: row.telefono,
        });
      }
    }
    return candidatos;
  }
}

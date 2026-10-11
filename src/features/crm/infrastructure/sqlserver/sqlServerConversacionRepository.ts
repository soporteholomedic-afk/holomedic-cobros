import * as mssql from 'mssql';

import { normalizarNombre, normalizarTelefonoE164, telefonoDigitosClave } from '../../domain/normalizar';
import type {
  CanalConversacion,
  ConversacionCrm,
  ConversacionListada,
  CrearConversacionInput,
} from '../../domain/entities';
import type {
  BuscarConversacionCanal,
  CandidatoVinculacion,
  ContactoConEmpresa,
  ConversacionCrmRepository,
  FiltrosConversaciones,
  ListadoConversaciones,
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

// listar() JOINea Empresas/Contactos: id/empresaId/telefono existen en
// varias tablas del JOIN, así que las columnas DEBEN calificarse con el
// alias c. (sin esto SQL Server responde "Ambiguous column name").
const COLUMNAS_CON_ALIAS = `c.id, c.empresaId, c.contactoId, c.canal, c.telefono, c.identificadorCanal,
                  c.estado, c.asignadaA, c.modo, c.ultimoMensajeEn, c.noLeidos, c.creadoEn, c.actualizadoEn`;

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

/**
 * Escapa los comodines LIKE de SQL Server ('[' → '[[]', '%' → '[%]',
 * '_' → '[_]') ANTES de envolver el input en '%…%'. Sin esto, buscar
 * '%' matchea TODAS las filas (R3 wildcards-sin-escape: input del
 * usuario interpolado como patrón). Se escapa ANTES de envolver para
 * que los '%' del wrapper sigan siendo comodines.
 */
function escaparLike(input: string): string {
  return input.replace(/[[%_]/g, (caracter) => `[${caracter}]`);
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

  async listar(filtros?: FiltrosConversaciones): Promise<ListadoConversaciones> {
    const clauses: string[] = [];
    const request = this.pool.request();
    const busqueda = filtros?.busqueda?.trim();
    if (busqueda !== undefined && busqueda !== '') {
      clauses.push(
        '(emp.razonSocial LIKE @busqueda OR con.nombre LIKE @busqueda OR c.telefono LIKE @busqueda)',
      );
      // NVarChar(600): hasta 200 chars de input × 3 por el escape de
      // comodines — el patrón escapado nunca revienta el parámetro.
      request.input('busqueda', mssql.NVarChar(600), `%${escaparLike(busqueda)}%`);
    }
    if (filtros?.estado !== undefined) {
      clauses.push('c.estado = @estado');
      request.input('estado', mssql.VarChar(24), filtros.estado);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const limite = filtros?.limite ?? 50;
    const offset = filtros?.offset ?? 0;

    // UNA sola query (R4 count-not-atomic / R3 total-page-drift): el
    // total viaja como COUNT(*) OVER() en cada fila de la MISMA
    // página, así página y total nunca divergen (los dos roundtrips
    // previos podían derivar entre el COUNT y el SELECT). La firma
    // {items, total} se mantiene; 0 filas → total 0.
    const result = await request
      .input('limite', mssql.Int, limite)
      .input('offset', mssql.Int, offset).query(`
        SELECT ${COLUMNAS_CON_ALIAS}, emp.razonSocial, con.nombre AS nombreContacto,
               COUNT(*) OVER() AS total
        FROM dbo.CRM_Conversaciones c
        LEFT JOIN dbo.CRM_Empresas emp ON emp.id = c.empresaId
        LEFT JOIN dbo.CRM_Contactos con ON con.id = c.contactoId
        ${where}
        ORDER BY c.ultimoMensajeEn DESC, c.id DESC
        OFFSET @offset ROWS FETCH NEXT @limite ROWS ONLY
      `);
    const filas = result.recordset as Array<
      ConversacionRow & { razonSocial: string | null; nombreContacto: string | null; total: number }
    >;
    const items: ConversacionListada[] = filas.map((row) => ({
      ...mapearConversacion(row),
      razonSocial: row.razonSocial,
      nombreContacto: row.nombreContacto,
    }));
    return { items, total: filas.length > 0 ? Number(filas[0]?.total ?? 0) : 0 };
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

  /**
   * Flip ONLY the modo column (E2·T5 born-state wiring): the SQL
   * container always provides it; the port keeps it optional so
   * non-SQL fakes stay valid. Mirrors actualizarEstado's shape.
   */
  async actualizarModo(id: number, modo: ConversacionCrm['modo']): Promise<ConversacionCrm | null> {
    const result = await this.pool
      .request()
      .input('id', mssql.Int, id)
      .input('modo', mssql.NVarChar(10), modo)
      .query(
        'UPDATE dbo.CRM_Conversaciones SET modo = @modo, actualizadoEn = SYSDATETIME() WHERE id = @id',
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

  async registrarActividad(id: number, direccion: 'IN' | 'OUT' = 'IN'): Promise<void> {
    // noLeidos crece SOLO en IN (E1): la respuesta del operador no debe
    // inflar su propio badge; ambos avanzan ultimoMensajeEn.
    const incrementoNoLeidos = direccion === 'IN' ? ', noLeidos = noLeidos + 1' : '';
    await this.pool
      .request()
      .input('id', mssql.Int, id)
      .query(
        `UPDATE dbo.CRM_Conversaciones
         SET ultimoMensajeEn = SYSDATETIME()${incrementoNoLeidos}, actualizadoEn = SYSDATETIME()
         WHERE id = @id`,
      );
  }

  async buscarCandidatosVinculacion(telefonoE164: string): Promise<CandidatoVinculacion[]> {
    // Deuda E2 (documentada): la resolución COMPLETA es una columna de
    // teléfono normalizada escrita por el feature de contactos + un
    // índice sobre ella. Mientras tanto el match es texto-libre → E.164
    // en TS y este SELECT lee TODOS los contactos con teléfono: el
    // TOP acota la lectura (R3 scan-tabla-completa) y el warn señala
    // el tope cuando se alcanza.
    const TOPE_CANDIDATOS = 5000;
    const result = await this.pool.request().query(`
      SELECT TOP (${TOPE_CANDIDATOS}) c.id, c.empresaId, c.nombre, c.telefono, e.razonSocial
      FROM dbo.CRM_Contactos c
      JOIN dbo.CRM_Empresas e ON e.id = c.empresaId
      WHERE c.telefono IS NOT NULL
    `);
    const leidos = result.recordset as Array<{
      id: number;
      empresaId: number;
      nombre: string;
      telefono: string;
      razonSocial: string;
    }>;
    if (leidos.length >= TOPE_CANDIDATOS) {
      console.warn(
        `buscarCandidatosVinculacion alcanzó el tope de ${TOPE_CANDIDATOS} contactos con teléfono; ` +
          'la autovinculación puede perder candidatos: migre a la columna de teléfono normalizada (deuda E2).',
      );
    }
    const claveEntrante = telefonoDigitosClave(telefonoE164);
    // teléfono es texto libre: la comparación se hace en TS tras
    // normalizar ambos lados (normalizarTelefonoE164 + digitos clave).
    const candidatos: CandidatoVinculacion[] = [];
    for (const row of leidos) {
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

  async crearContacto(
    empresaId: number,
    datos: { nombre: string; cargo?: string | null },
  ): Promise<{ contactoId: number }> {
    // nombreNormalizado se DERIVA acá (normalizarNombre — UQ_CRM_Contactos_
    // EmpresaNombre), nunca se confía del request; telefono queda null
    // (la vinculación re-keyea la CONVERSACIÓN, no el contacto). Espejo
    // del INSERT del importador (importadorCrm.ts), sin esPrincipal.
    try {
      const inserted = await this.pool
        .request()
        .input('empresaId', mssql.Int, empresaId)
        .input('nombre', mssql.NVarChar(200), datos.nombre)
        .input('nombreNormalizado', mssql.VarChar(200), normalizarNombre(datos.nombre))
        .input('cargo', mssql.NVarChar(120), datos.cargo ?? null).query(`
          INSERT INTO dbo.CRM_Contactos (empresaId, nombre, nombreNormalizado, telefono, cargo, esPrincipal)
          OUTPUT INSERTED.id
          VALUES (@empresaId, @nombre, @nombreNormalizado, NULL, @cargo, 0)
        `);
      const contactoId = (inserted.recordset as { id: number }[])[0]?.id;
      if (contactoId === undefined) throw new Error('INSERT de CRM_Contactos no devolvió id');
      return { contactoId };
    } catch (err: unknown) {
      throw mapearConflictoUnico(err);
    }
  }

  async obtenerContactoPorId(contactoId: number): Promise<ContactoConEmpresa | null> {
    const result = await this.pool
      .request()
      .input('contactoId', mssql.Int, contactoId)
      .query(`
        SELECT c.id AS contactoId, c.empresaId, c.nombre, c.telefono, e.razonSocial
        FROM dbo.CRM_Contactos c
        LEFT JOIN dbo.CRM_Empresas e ON e.id = c.empresaId
        WHERE c.id = @contactoId
      `);
    const row = (
      result.recordset as Array<{
        contactoId: number;
        empresaId: number;
        nombre: string;
        telefono: string | null;
        razonSocial: string | null;
      }>
    )[0];
    return row
      ? {
          contactoId: row.contactoId,
          empresaId: row.empresaId,
          nombreContacto: row.nombre,
          razonSocial: row.razonSocial,
          telefono: row.telefono,
        }
      : null;
  }

  async buscarContactosTexto(
    busqueda: string,
    limite = 20,
  ): Promise<ContactoConEmpresa[]> {
    // Buscador del panel de vinculación (E1): LIKE sobre nombre /
    // razón social — INNER JOIN porque un candidato SIN empresa no es
    // vinculable. TOP parametrizado; collation case-insensitive
    // (listar precedent). El input se escapa (escaparLike — R3): un
    // '%' del usuario matchea SOLO un '%' literal.
    const result = await this.pool
      .request()
      .input('busqueda', mssql.NVarChar(600), `%${escaparLike(busqueda.trim())}%`)
      .input('limite', mssql.Int, limite)
      .query(`
        SELECT TOP (@limite) c.id AS contactoId, c.empresaId, c.nombre, c.telefono, e.razonSocial
        FROM dbo.CRM_Contactos c
        JOIN dbo.CRM_Empresas e ON e.id = c.empresaId
        WHERE c.nombre LIKE @busqueda OR e.razonSocial LIKE @busqueda
        ORDER BY e.razonSocial, c.nombre
      `);
    return (
      result.recordset as Array<{
        contactoId: number;
        empresaId: number;
        nombre: string;
        telefono: string | null;
        razonSocial: string | null;
      }>
    ).map((row) => ({
      contactoId: row.contactoId,
      empresaId: row.empresaId,
      nombreContacto: row.nombre,
      razonSocial: row.razonSocial,
      telefono: row.telefono,
    }));
  }
}

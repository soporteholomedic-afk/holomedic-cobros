import * as mssql from 'mssql';

import { normalizarNombre, normalizarTelefonoE164, telefonoDigitosClave } from '../../domain/normalizar';
import { ConflictError, NotFoundError } from '../../domain/errors';
import type {
  CampoFicha,
  CanalConversacion,
  ConversacionCrm,
  ConversacionListada,
  CrearConversacionInput,
  ExtraccionFicha,
  OrigenDatoFicha,
  SolicitudAyuda,
} from '../../domain/entities';
import type {
  BuscarConversacionCanal,
  CandidatoVinculacion,
  ContactoConEmpresa,
  ConteoResumenConversaciones,
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
 * (empresa registry precedent). E3 appends the help-pattern tables:
 * CRM_SolicitudesAyuda (lifecycle + typed errors) and
 * CRM_ExtraccionesFicha (app-level dedup upsert — the human-confirmed
 * rule lives HERE, not in the schema).
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
  memoriaActiva: boolean;
  ultimoMensajeEn: Date | null;
  noLeidos: number;
  creadoEn: Date;
  actualizadoEn: Date;
}

const COLUMNAS = `id, empresaId, contactoId, canal, telefono, identificadorCanal,
                  estado, asignadaA, modo, memoriaActiva, ultimoMensajeEn, noLeidos, creadoEn, actualizadoEn`;

// listar() JOINea Empresas/Contactos: id/empresaId/telefono existen en
// varias tablas del JOIN, así que las columnas DEBEN calificarse con el
// alias c. (sin esto SQL Server responde "Ambiguous column name").
const COLUMNAS_CON_ALIAS = `c.id, c.empresaId, c.contactoId, c.canal, c.telefono, c.identificadorCanal,
                  c.estado, c.asignadaA, c.modo, c.memoriaActiva, c.ultimoMensajeEn, c.noLeidos, c.creadoEn, c.actualizadoEn`;

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
    memoriaActiva: row.memoriaActiva,
    ultimoMensajeEn: row.ultimoMensajeEn ? row.ultimoMensajeEn.toISOString() : null,
    noLeidos: row.noLeidos,
    creadoEn: row.creadoEn.toISOString(),
    actualizadoEn: row.actualizadoEn.toISOString(),
  };
}

/** JSON string array → string[]: malformed/non-array falls back to []. */
function parsearTerminosJson(raw: string | null): string[] {
  if (raw === null || raw === '') return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((termino): termino is string => typeof termino === 'string');
  } catch {
    return [];
  }
}

/** CRM_SolicitudesAyuda read row — DATETIME2 crosses tedious as Date; BIGINT ids cross as string (TareaAgente precedent) → Number(). */
interface SolicitudAyudaRow {
  id: number | string;
  conversacionId: number;
  mensajeId: number | string | null;
  consulta: string;
  terminosBuscados: string | null;
  score: number | null;
  estado: string;
  indicacion: string | null;
  resueltaPor: string | null;
  creadoEn: Date;
  resueltaEn: Date | null;
}

const COLUMNAS_SOLICITUD = `id, conversacionId, mensajeId, consulta, terminosBuscados,
                             score, estado, indicacion, resueltaPor, creadoEn, resueltaEn`;

function mapearSolicitudAyuda(row: SolicitudAyudaRow): SolicitudAyuda {
  return {
    id: Number(row.id),
    conversacionId: row.conversacionId,
    mensajeId: row.mensajeId === null ? null : Number(row.mensajeId),
    consulta: row.consulta,
    terminosBuscados: parsearTerminosJson(row.terminosBuscados),
    score: row.score,
    estado: row.estado as SolicitudAyuda['estado'],
    indicacion: row.indicacion,
    resueltaPor: row.resueltaPor,
    creadoEn: row.creadoEn,
    resueltaEn: row.resueltaEn,
  };
}

/** CRM_ExtraccionesFicha read row — BIGINT id crosses tedious as string (TareaAgente precedent). */
interface ExtraccionFichaRow {
  id: number | string;
  contactoId: number | null;
  empresaId: number | null;
  campo: string;
  valor: string;
  origen: string;
  confirmado: boolean;
  actualizadoEn: Date;
}

const COLUMNAS_EXTRACCION = 'id, contactoId, empresaId, campo, valor, origen, confirmado, actualizadoEn';

function mapearExtraccionFicha(row: ExtraccionFichaRow): ExtraccionFicha {
  return {
    id: Number(row.id),
    contactoId: row.contactoId,
    empresaId: row.empresaId,
    campo: row.campo as ExtraccionFicha['campo'],
    valor: row.valor,
    origen: row.origen as ExtraccionFicha['origen'],
    confirmado: row.confirmado,
    actualizadoEn: row.actualizadoEn,
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

/** CRM_Contactos JOIN CRM_Empresas row as read by the candidate queries. */
interface FilaCandidatoVinculacion {
  id: number;
  empresaId: number;
  nombre: string;
  telefono: string;
  razonSocial: string;
}

/** Row → CandidatoVinculacion (same fields both query paths share). */
function mapearCandidatoVinculacion(row: FilaCandidatoVinculacion): CandidatoVinculacion {
  return {
    empresaId: row.empresaId,
    contactoId: row.id,
    nombreContacto: row.nombre,
    razonSocial: row.razonSocial,
    telefono: row.telefono,
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
        .input('modo', mssql.NVarChar(10), datos.modo ?? 'IA')
        .input('memoriaActiva', mssql.Bit, 1).query(`
          INSERT INTO dbo.CRM_Conversaciones
            (empresaId, contactoId, canal, telefono, identificadorCanal, estado, asignadaA, modo, memoriaActiva)
          OUTPUT INSERTED.id
          VALUES (@empresaId, @contactoId, @canal, @telefono, @identificadorCanal, @estado, @asignadaA, @modo, @memoriaActiva)
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
    //
    // E2·T6 preview: OUTER APPLY TOP (1) por id DESC resuelve el
    // último mensaje de cada fila (mismo criterio de orden que el
    // hilo) en el mismo roundtrip; LEFT(…,120) evita cruzar cuerpos
    // NVARCHAR(4000) completos a la lista. Conversación sin mensajes
    // → columnas NULL (null-safe en el mapping).
    const result = await request
      .input('limite', mssql.Int, limite)
      .input('offset', mssql.Int, offset).query(`
        SELECT ${COLUMNAS_CON_ALIAS}, emp.razonSocial, con.nombre AS nombreContacto,
               LEFT(ult.cuerpo, 120) AS ultimoMensajeCuerpo,
               ult.emisor AS ultimoMensajeEmisor,
               COUNT(*) OVER() AS total
        FROM dbo.CRM_Conversaciones c
        LEFT JOIN dbo.CRM_Empresas emp ON emp.id = c.empresaId
        LEFT JOIN dbo.CRM_Contactos con ON con.id = c.contactoId
        OUTER APPLY (
          SELECT TOP (1) m.cuerpo, m.emisor
          FROM dbo.CRM_Mensajes m
          WHERE m.conversacionId = c.id
          ORDER BY m.id DESC
        ) ult
        ${where}
        ORDER BY c.ultimoMensajeEn DESC, c.id DESC
        OFFSET @offset ROWS FETCH NEXT @limite ROWS ONLY
      `);
    const filas = result.recordset as Array<
      ConversacionRow & {
        razonSocial: string | null;
        nombreContacto: string | null;
        ultimoMensajeCuerpo: string | null;
        ultimoMensajeEmisor: string | null;
        total: number;
      }
    >;
    const items: ConversacionListada[] = filas.map((row) => ({
      ...mapearConversacion(row),
      razonSocial: row.razonSocial,
      nombreContacto: row.nombreContacto,
      ultimoMensajeCuerpo: row.ultimoMensajeCuerpo,
      ultimoMensajeEmisor: row.ultimoMensajeEmisor as ConversacionListada['ultimoMensajeEmisor'],
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

  /**
   * E3·T5 settings panel: flip ONLY memoriaActiva (the privacy
   * toggle) + actualizadoEn, then re-read the row (actualizarModo
   * precedent — the returned ConversacionCrm is the post-write
   * truth, never a stitched local copy).
   */
  async actualizarMemoriaActiva(id: number, activa: boolean): Promise<ConversacionCrm | null> {
    const result = await this.pool
      .request()
      .input('id', mssql.Int, id)
      .input('memoriaActiva', mssql.Bit, activa)
      .query(
        'UPDATE dbo.CRM_Conversaciones SET memoriaActiva = @memoriaActiva, actualizadoEn = SYSDATETIME() WHERE id = @id',
      );
    if ((result.rowsAffected[0] ?? 0) === 0) return null;
    return this.obtenerPorId(id);
  }

  /**
   * Flip asignadaA + modo TOGETHER (E3 take/return handoff):
   * actualizarEstado moves estado (opt. asignadaA) and actualizarModo
   * moves modo — the operator take needs both columns in one write,
   * and the return-to-IA needs asignadaA back to NULL.
   */
  async actualizarAsignacion(
    id: number,
    asignadaA: string | null,
    modo: ConversacionCrm['modo'],
  ): Promise<void> {
    await this.pool
      .request()
      .input('id', mssql.Int, id)
      .input('asignadaA', mssql.NVarChar(200), asignadaA)
      .input('modo', mssql.NVarChar(10), modo)
      .query(
        'UPDATE dbo.CRM_Conversaciones SET asignadaA = @asignadaA, modo = @modo, actualizadoEn = SYSDATETIME() WHERE id = @id',
      );
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
    // E2·T8 (remediación del advisory E1 R3-scan-tabla-complea): la vía
    // PRIMARIA es un seek exacto y tipado sobre CRM_Contactos.
    // telefonoNormalizado (IX_CRM_Contactos_TelefonoNormalizado) — sin
    // scan ni tope. El FALLBACK conserva la semántica texto-libre de
    // hoy para las filas aún sin normalizar (telefonoNormalizado IS
    // NULL): lectura TOP-acotada + match en TS. Una vez que
    // scripts/crm-normalizar-telefonos.mjs --apply rellene el histórico
    // y los escritores (importador) mantengan la columna al día, el
    // subconjunto sin normalizar se encoge a CERO y el fallback deja
    // de leer filas.
    const e164 = normalizarTelefonoE164(telefonoE164);
    if (e164 === null) return [];

    // Seek exacto. El residual `telefono IS NOT NULL` protege el tipo
    // `telefono: string` del candidato: los escritores y el backfill
    // derivan la columna DESDE telefono, así que normalizado no-nulo
    // implica telefono no-nulo (un drift manual no rompe el mapping).
    // La columna normalizada es AUTORIZITATIVA: una fila con normalizado
    // fijado a otro valor NUNCA re-matchea por el fallback.
    const exactos = await this.pool
      .request()
      .input('telefonoNormalizado', mssql.VarChar(30), e164)
      .query(`
        SELECT c.id, c.empresaId, c.nombre, c.telefono, e.razonSocial
        FROM dbo.CRM_Contactos c
        JOIN dbo.CRM_Empresas e ON e.id = c.empresaId
        WHERE c.telefonoNormalizado = @telefonoNormalizado AND c.telefono IS NOT NULL
        ORDER BY c.id
      `);

    // Fallback texto-libre: SOLO el subconjunto sin normalizar (antes:
    // toda la tabla con telefono). Mismo TOP + mismo match en TS que la
    // versión E1 (normalizarTelefonoE164 + clave de dígitos).
    const TOPE_FALLBACK = 5000;
    const pendientes = await this.pool.request().query(`
      SELECT TOP (${TOPE_FALLBACK}) c.id, c.empresaId, c.nombre, c.telefono, e.razonSocial
      FROM dbo.CRM_Contactos c
      JOIN dbo.CRM_Empresas e ON e.id = c.empresaId
      WHERE c.telefonoNormalizado IS NULL AND c.telefono IS NOT NULL
      ORDER BY c.id
    `);
    const leidos = pendientes.recordset as FilaCandidatoVinculacion[];
    if (leidos.length >= TOPE_FALLBACK) {
      console.warn(
        `buscarCandidatosVinculacion: el fallback texto-libre alcanzó el tope de ${TOPE_FALLBACK} ` +
          'contactos SIN normalizar; la autovinculación puede perder candidatos: ejecute ' +
          'scripts/crm-normalizar-telefonos.mjs --apply para encoger el subconjunto a cero.',
      );
    }
    const claveEntrante = telefonoDigitosClave(e164);
    const candidatos: CandidatoVinculacion[] = (
      exactos.recordset as FilaCandidatoVinculacion[]
    ).map(mapearCandidatoVinculacion);
    // teléfono es texto libre: la comparación del fallback se hace en TS
    // tras normalizar ambos lados (normalizarTelefonoE164 + digitos clave).
    for (const row of leidos) {
      const e164Fila = normalizarTelefonoE164(row.telefono);
      if (e164Fila === null) continue;
      if (telefonoDigitosClave(e164Fila) === claveEntrante) {
        candidatos.push(mapearCandidatoVinculacion(row));
      }
    }
    // Orden determinista id ASC — el orden de-facto de la versión E1
    // (scan del índice clustered, sin ORDER BY explícito), ahora
    // garantizado: ambas queries vienen ordenadas por id y la mezcla
    // final se re-ordena por contactoId. Una fila por contacto, mismos
    // campos — semántica de resultado idéntica a la de E1.
    candidatos.sort((a, b) => a.contactoId - b.contactoId);
    return candidatos;
  }

  async crearContacto(
    empresaId: number,
    datos: { nombre: string; cargo?: string | null },
  ): Promise<{ contactoId: number }> {
    // nombreNormalizado se DERIVA acá (normalizarNombre — UQ_CRM_Contactos_
    // EmpresaNombre), nunca se confía del request; telefono queda null
    // (la vinculación re-keyea la CONVERSACIÓN, no el contacto) y por lo
    // mismo telefonoNormalizado queda null por defecto — derivaría del
    // telefono inexistente (E2·T8). Espejo del INSERT del importador
    // (importadorCrm.ts), sin esPrincipal.
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
    // E3·T4: c.cargo viaja en el SELECT — la ficha viva lee la columna
    // canónica sin un segundo repositorio de contactos.
    const result = await this.pool
      .request()
      .input('contactoId', mssql.Int, contactoId)
      .query(`
        SELECT c.id AS contactoId, c.empresaId, c.nombre, c.telefono, c.cargo, e.razonSocial
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
        cargo: string | null;
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
          cargo: row.cargo ?? null,
        }
      : null;
  }

  /**
   * E3·T4 cargo promotion (ficha viva confirm): flip ONLY
   * CRM_Contactos.cargo — same table as crearContacto, mirror of
   * actualizarEstado's shape (UPDATE + re-read; rowsAffected 0 →
   * null). NVarChar(120) = the column width.
   */
  async actualizarCargoContacto(
    contactoId: number,
    cargo: string,
  ): Promise<ContactoConEmpresa | null> {
    const result = await this.pool
      .request()
      .input('contactoId', mssql.Int, contactoId)
      .input('cargo', mssql.NVarChar(120), cargo)
      .query('UPDATE dbo.CRM_Contactos SET cargo = @cargo WHERE id = @contactoId');
    if ((result.rowsAffected[0] ?? 0) === 0) return null;
    return this.obtenerContactoPorId(contactoId);
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

  /**
   * E3·T3 notification badge: ONE SELECT with conditional COUNTs +
   * MAX(ultimoMensajeEn) over CRM_Conversaciones — single roundtrip,
   * no per-estado query. The conditional estado COUNTs are covered by
   * IX_CRM_Conversaciones_EstadoUltimo (estado leading key; the table
   * is small by construction — one row per channel thread — so even a
   * full scan would be trivial). SUM over an empty table is NULL →
   * ISNULL(...,0); COUNT(*) and MAX are naturally 0/NULL.
   */
  async contarResumen(): Promise<ConteoResumenConversaciones> {
    const result = await this.pool.request().query(`
      SELECT
        COUNT(*) AS total,
        ISNULL(SUM(CASE WHEN estado = 'REQUIERE_HUMANO' THEN 1 ELSE 0 END), 0) AS requiereAyuda,
        ISNULL(SUM(CASE WHEN estado = 'PENDIENTE_VINCULACION' THEN 1 ELSE 0 END), 0) AS pendienteVinculacion,
        MAX(ultimoMensajeEn) AS ultimaActividad
      FROM dbo.CRM_Conversaciones
    `);
    const fila = (
      result.recordset as Array<{
        total: number;
        requiereAyuda: number;
        pendienteVinculacion: number;
        ultimaActividad: Date | null;
      }>
    )[0];
    if (fila === undefined) {
      throw new Error('el COUNT de resumen de conversaciones no devolvió filas');
    }
    return {
      requiereAyuda: Number(fila.requiereAyuda),
      pendienteVinculacion: Number(fila.pendienteVinculacion),
      total: Number(fila.total),
      ultimaActividad: fila.ultimaActividad ?? null,
    };
  }

  // ---- E3 (agente-ia-crm): solicitudes de ayuda humana ----

  private async obtenerSolicitudPorId(id: number): Promise<SolicitudAyuda | null> {
    const result = await this.pool
      .request()
      .input('id', mssql.BigInt, id)
      .query(`SELECT ${COLUMNAS_SOLICITUD} FROM dbo.CRM_SolicitudesAyuda WHERE id = @id`);
    const row = (result.recordset as SolicitudAyudaRow[])[0];
    return row ? mapearSolicitudAyuda(row) : null;
  }

  async crearSolicitudAyuda(entrada: {
    conversacionId: number;
    mensajeId?: number | null;
    consulta: string;
    terminosBuscados: string[];
    score: number | null;
  }): Promise<SolicitudAyuda> {
    const inserted = await this.pool
      .request()
      .input('conversacionId', mssql.Int, entrada.conversacionId)
      .input('mensajeId', mssql.BigInt, entrada.mensajeId ?? null)
      .input('consulta', mssql.NVarChar(2000), entrada.consulta)
      .input('terminosBuscados', mssql.NVarChar(mssql.MAX), JSON.stringify(entrada.terminosBuscados))
      .input('score', mssql.Float, entrada.score).query(`
        INSERT INTO dbo.CRM_SolicitudesAyuda
          (conversacionId, mensajeId, consulta, terminosBuscados, score)
        OUTPUT INSERTED.id
        VALUES (@conversacionId, @mensajeId, @consulta, @terminosBuscados, @score)
      `);
    const id = Number((inserted.recordset as { id: number | string }[])[0]?.id);
    if (Number.isNaN(id)) throw new Error('INSERT de CRM_SolicitudesAyuda no devolvió id');
    const solicitud = await this.obtenerSolicitudPorId(id);
    if (!solicitud) throw new Error('La solicitud recién creada no pudo releerse');
    return solicitud;
  }

  async obtenerSolicitudAyudaPendiente(conversacionId: number): Promise<SolicitudAyuda | null> {
    const result = await this.pool
      .request()
      .input('conversacionId', mssql.Int, conversacionId).query(`
        SELECT TOP (1) ${COLUMNAS_SOLICITUD}
        FROM dbo.CRM_SolicitudesAyuda
        WHERE conversacionId = @conversacionId AND estado = 'PENDIENTE'
        ORDER BY id DESC
      `);
    const row = (result.recordset as SolicitudAyudaRow[])[0];
    return row ? mapearSolicitudAyuda(row) : null;
  }

  async obtenerUltimaSolicitudResuelta(conversacionId: number): Promise<SolicitudAyuda | null> {
    const result = await this.pool
      .request()
      .input('conversacionId', mssql.Int, conversacionId).query(`
        SELECT TOP (1) ${COLUMNAS_SOLICITUD}
        FROM dbo.CRM_SolicitudesAyuda
        WHERE conversacionId = @conversacionId AND estado = 'RESUELTA'
        ORDER BY resueltaEn DESC, id DESC
      `);
    const row = (result.recordset as SolicitudAyudaRow[])[0];
    return row ? mapearSolicitudAyuda(row) : null;
  }

  async resolverSolicitudAyuda(
    id: number,
    indicacion: string,
    resueltaPor: string,
  ): Promise<SolicitudAyuda> {
    // UPDATE condicional (WHERE estado = 'PENDIENTE'): sin ventana
    // read-then-write — dos resoluciones concurrentes no pueden
    // ganar; la que llega tarde cae en el ConflictError tipado.
    const result = await this.pool
      .request()
      .input('id', mssql.BigInt, id)
      .input('indicacion', mssql.NVarChar(2000), indicacion)
      .input('resueltaPor', mssql.NVarChar(100), resueltaPor).query(`
        UPDATE dbo.CRM_SolicitudesAyuda
        SET estado = 'RESUELTA',
            indicacion = @indicacion,
            resueltaPor = @resueltaPor,
            resueltaEn = SYSUTCDATETIME()
        WHERE id = @id AND estado = 'PENDIENTE'
      `);
    if ((result.rowsAffected[0] ?? 0) === 0) {
      const existente = await this.obtenerSolicitudPorId(id);
      if (!existente) throw new NotFoundError('Solicitud de ayuda no encontrada');
      throw new ConflictError('La solicitud de ayuda ya no está pendiente');
    }
    const resuelta = await this.obtenerSolicitudPorId(id);
    if (!resuelta) throw new Error('La solicitud resuelta no pudo releerse');
    return resuelta;
  }

  // ---- E3 (agente-ia-crm): extracciones de ficha ----

  private async obtenerExtraccionPorId(id: number): Promise<ExtraccionFicha | null> {
    const result = await this.pool
      .request()
      .input('id', mssql.BigInt, id)
      .query(`SELECT ${COLUMNAS_EXTRACCION} FROM dbo.CRM_ExtraccionesFicha WHERE id = @id`);
    const row = (result.recordset as ExtraccionFichaRow[])[0];
    return row ? mapearExtraccionFicha(row) : null;
  }

  async upsertExtraccionFicha(extraccion: {
    contactoId: number | null;
    empresaId: number | null;
    campo: CampoFicha;
    valor: string;
    origen: OrigenDatoFicha;
    confirmado: boolean;
  }): Promise<ExtraccionFicha> {
    // Dedup app-level por (contactoId, empresaId, campo) — claves
    // NULL-safe: en SQL 'NULL = NULL' jamás matchea, así que cada lado
    // se compara con '= @param' O '(IS NULL AND @param IS NULL)'.
    const existenteResult = await this.pool
      .request()
      .input('contactoId', mssql.Int, extraccion.contactoId)
      .input('empresaId', mssql.Int, extraccion.empresaId)
      .input('campo', mssql.NVarChar(50), extraccion.campo).query(`
        SELECT ${COLUMNAS_EXTRACCION}
        FROM dbo.CRM_ExtraccionesFicha
        WHERE (contactoId = @contactoId OR (contactoId IS NULL AND @contactoId IS NULL))
          AND (empresaId = @empresaId OR (empresaId IS NULL AND @empresaId IS NULL))
          AND campo = @campo
      `);
    const existente = (existenteResult.recordset as ExtraccionFichaRow[])[0];

    // REGLA E3: la re-extracción IA NUNCA sobrescribe una fila que el
    // humano confirmó (confirmado = 1 AND origen 'HUMANO') — gana el
    // humano; se devuelve la fila intacta sin tocar actualizadoEn.
    if (
      existente &&
      existente.confirmado &&
      existente.origen === 'HUMANO' &&
      extraccion.origen === 'IA'
    ) {
      return mapearExtraccionFicha(existente);
    }

    if (existente) {
      await this.pool
        .request()
        .input('id', mssql.BigInt, Number(existente.id))
        .input('valor', mssql.NVarChar(500), extraccion.valor)
        .input('origen', mssql.NVarChar(10), extraccion.origen)
        .input('confirmado', mssql.Bit, extraccion.confirmado).query(`
          UPDATE dbo.CRM_ExtraccionesFicha
          SET valor = @valor, origen = @origen, confirmado = @confirmado, actualizadoEn = SYSUTCDATETIME()
          WHERE id = @id
        `);
      const actualizada = await this.obtenerExtraccionPorId(Number(existente.id));
      if (!actualizada) throw new Error('La extracción actualizada no pudo releerse');
      return actualizada;
    }

    const inserted = await this.pool
      .request()
      .input('contactoId', mssql.Int, extraccion.contactoId)
      .input('empresaId', mssql.Int, extraccion.empresaId)
      .input('campo', mssql.NVarChar(50), extraccion.campo)
      .input('valor', mssql.NVarChar(500), extraccion.valor)
      .input('origen', mssql.NVarChar(10), extraccion.origen)
      .input('confirmado', mssql.Bit, extraccion.confirmado).query(`
        INSERT INTO dbo.CRM_ExtraccionesFicha (contactoId, empresaId, campo, valor, origen, confirmado)
        OUTPUT INSERTED.id
        VALUES (@contactoId, @empresaId, @campo, @valor, @origen, @confirmado)
      `);
    const id = Number((inserted.recordset as { id: number | string }[])[0]?.id);
    if (Number.isNaN(id)) throw new Error('INSERT de CRM_ExtraccionesFicha no devolvió id');
    const creada = await this.obtenerExtraccionPorId(id);
    if (!creada) throw new Error('La extracción recién creada no pudo releerse');
    return creada;
  }

  async listarExtraccionesFicha(
    contactoId: number | null,
    empresaId: number | null,
  ): Promise<ExtraccionFicha[]> {
    // Ambos null no identifican nada (la ficha SIEMPRE consulta por
    // un contacto o por una empresa) — contrato: [] sin tocar la base.
    if (contactoId === null && empresaId === null) return [];
    const request = this.pool.request();
    const condiciones: string[] = [];
    if (contactoId !== null) {
      request.input('contactoId', mssql.Int, contactoId);
      condiciones.push('contactoId = @contactoId');
    }
    if (empresaId !== null) {
      request.input('empresaId', mssql.Int, empresaId);
      condiciones.push('empresaId = @empresaId');
    }
    const result = await request.query(`
      SELECT ${COLUMNAS_EXTRACCION}
      FROM dbo.CRM_ExtraccionesFicha
      WHERE ${condiciones.join(' OR ')}
      ORDER BY campo, id
    `);
    return (result.recordset as ExtraccionFichaRow[]).map(mapearExtraccionFicha);
  }
}

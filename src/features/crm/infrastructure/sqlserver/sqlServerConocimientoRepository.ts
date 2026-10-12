import * as mssql from 'mssql';

import type { EntradaConocimiento, HuecoConocimiento, OrigenConocimiento } from '../../domain/entities';
import type { ConocimientoCrmRepository } from '../../domain/ports';

/**
 * SQL Server adapter for the knowledge-base port (agente-ia-crm E2·T1).
 * Read-only thin reader over CRM_Conocimiento — the ranking policy
 * lives in the application layer (recuperarConocimiento); the CRUD
 * editor arrives in E5. `buscarPorTexto` is the RAG prefilter: a
 * case-insensitive LIKE over titulo/contenido (database collation
 * precedent) whose wildcards are ALWAYS escaped (E1 lesson — a
 * client '%' must match a literal '%', never every row). Both reads
 * only ever return activo = 1 rows. E3 appends `crearHueco`: the
 * append-only KB-gap log over CRM_ConocimientoHuecos. E4·T7 appends
 * `crearEntrada`: the write side the knowledge ingestion (and the E5
 * editor) uses — nuevas entradas sirven al RAG de inmediato.
 */

/** CRM_Conocimiento read row — DATETIME2 crosses tedious as Date. */
interface ConocimientoRow {
  id: number;
  titulo: string;
  contenido: string;
  etiquetas: string;
  vigenciaDesde: Date | null;
  vigenciaHasta: Date | null;
  activo: boolean;
}

const COLUMNAS =
  'id, titulo, contenido, etiquetas, vigenciaDesde, vigenciaHasta, activo';

/** etiquetas CSV → string[]: trimmed, empty segments dropped. */
function mapearEtiquetas(csv: string): string[] {
  return csv
    .split(',')
    .map((etiqueta) => etiqueta.trim())
    .filter((etiqueta) => etiqueta !== '');
}

/**
 * Términos de búsqueda del texto libre del cliente (E2·T5 regresión):
 * lowercase + NFD sin diacríticos + split no-alfanumérico, longitud > 2,
 * máx MAX_TERMINOS_LIKE. Los stopwords NO se filtran acá: sumar
 * candidatos extra es inofensivo (el ranking de la aplicación les da
 * puntaje 0) y mantener una sola noción de término simplifica el
 * contrato con el ranker.
 */
const MAX_TERMINOS_LIKE = 8;
function extraerTerminosBusqueda(texto: string): string[] {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((termino) => termino.length > 2)
    .slice(0, MAX_TERMINOS_LIKE);
}

function mapearEntrada(row: ConocimientoRow): EntradaConocimiento {
  return {
    id: row.id,
    titulo: row.titulo,
    contenido: row.contenido,
    etiquetas: mapearEtiquetas(row.etiquetas),
    vigenciaDesde: row.vigenciaDesde,
    vigenciaHasta: row.vigenciaHasta,
    activo: row.activo,
  };
}

/** CRM_ConocimientoHuecos read row — DATETIME2 as Date; BIGINT ids cross tedious as string (TareaAgente precedent) → Number(). */
interface HuecoRow {
  id: number | string;
  consulta: string;
  terminos: string | null;
  estado: string;
  origenSolicitudId: number | string | null;
  /** E4·T5: la respuesta IA deficiente que dejó este hueco. */
  origenMensajeId: number | string | null;
  creadoEn: Date;
}

const COLUMNAS_HUECO = 'id, consulta, terminos, estado, origenSolicitudId, origenMensajeId, creadoEn';

function mapearHueco(row: HuecoRow): HuecoConocimiento {
  return {
    id: Number(row.id),
    consulta: row.consulta,
    terminos: parsearTerminosJson(row.terminos),
    estado: row.estado as HuecoConocimiento['estado'],
    origenSolicitudId: row.origenSolicitudId === null ? null : Number(row.origenSolicitudId),
    origenMensajeId: row.origenMensajeId === null ? null : Number(row.origenMensajeId),
    creadoEn: row.creadoEn,
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

/**
 * Escapa los comodines LIKE de SQL Server ('[' → '[[]', '%' → '[%]',
 * '_' → '[_]') ANTES de envolver el input en '%…%'. Sin esto, buscar
 * '%' matchea TODAS las filas (E1 lesson, R3 wildcards-sin-escape:
 * input del cliente interpolado como patrón). Se escapa ANTES de
 * envolver para que los '%' del wrapper sigan siendo comodines.
 */
function escaparLike(input: string): string {
  return input.replace(/[[%_]/g, (caracter) => `[${caracter}]`);
}

export class SqlServerConocimientoRepository implements ConocimientoCrmRepository {
  constructor(private readonly pool: mssql.ConnectionPool) {}

  async listarActivas(): Promise<EntradaConocimiento[]> {
    const result = await this.pool.request().query(
      `SELECT ${COLUMNAS} FROM dbo.CRM_Conocimiento WHERE activo = 1 ORDER BY id`,
    );
    return (result.recordset as ConocimientoRow[]).map(mapearEntrada);
  }

  async buscarPorTexto(texto: string): Promise<EntradaConocimiento[]> {
    const terminos = extraerTerminosBusqueda(texto);
    if (terminos.length === 0) return [];
    // Prefilter POR TÉRMINOS (regresión del ensayo live E2·T5): una
    // pregunta natural («Hola, ¿cuánto tardan los certificados médicos?»)
    // nunca contiene frases literales de la KB — la frase completa como
    // LIKE devolvía SIEMPRE vacío y todo escalaba. Cada término (>2
    // chars, sin diacríticos, máximo 8) genera un LIKE propio OR-eado
    // sobre titulo/contenido; el ranking fino sigue en la aplicación.
    // NVarChar(MAX): contenido es NVARCHAR(MAX) y el escape ×3 infla.
    const request = this.pool.request();
    const condiciones: string[] = [];
    terminos.forEach((termino, i) => {
      request.input(`t${i}`, mssql.NVarChar(mssql.MAX), `%${escaparLike(termino)}%`);
      condiciones.push(`(titulo LIKE @t${i} OR contenido LIKE @t${i})`);
    });
    const result = await request.query(`
      SELECT ${COLUMNAS}
      FROM dbo.CRM_Conocimiento
      WHERE activo = 1 AND (${condiciones.join(' OR ')})
      ORDER BY id
    `);
    return (result.recordset as ConocimientoRow[]).map(mapearEntrada);
  }

  // ---- E3 (agente-ia-crm): huecos de conocimiento ----

  async crearHueco(entrada: {
    consulta: string;
    terminos: string[];
    origenSolicitudId?: number | null;
    origenMensajeId?: number | null;
    estado?: HuecoConocimiento['estado'];
  }): Promise<HuecoConocimiento> {
    const inserted = await this.pool
      .request()
      .input('consulta', mssql.NVarChar(2000), entrada.consulta)
      .input('terminos', mssql.NVarChar(mssql.MAX), JSON.stringify(entrada.terminos))
      .input('estado', mssql.NVarChar(20), entrada.estado ?? 'ABIERTO')
      .input('origenSolicitudId', mssql.BigInt, entrada.origenSolicitudId ?? null)
      .input('origenMensajeId', mssql.BigInt, entrada.origenMensajeId ?? null).query(`
        INSERT INTO dbo.CRM_ConocimientoHuecos (consulta, terminos, estado, origenSolicitudId, origenMensajeId)
        OUTPUT INSERTED.id
        VALUES (@consulta, @terminos, @estado, @origenSolicitudId, @origenMensajeId)
      `);
    const id = Number((inserted.recordset as { id: number | string }[])[0]?.id);
    if (Number.isNaN(id)) throw new Error('INSERT de CRM_ConocimientoHuecos no devolvió id');
    const releido = await this.pool
      .request()
      .input('id', mssql.BigInt, id)
      .query(`SELECT ${COLUMNAS_HUECO} FROM dbo.CRM_ConocimientoHuecos WHERE id = @id`);
    const row = (releido.recordset as HuecoRow[])[0];
    if (!row) throw new Error('El hueco recién creado no pudo releerse');
    return mapearHueco(row);
  }

  /**
   * E4·T5: el ÚLTIMO hueco que dejó UNA respuesta IA deficiente —
   * TOP (1) con ORDER BY id DESC (re-marcar el mismo mensaje jamás
   * crea un segundo, así que en la práctica es único; el DESC es el
   * desempate determinista si una corrección manual lo duplica).
   */
  async obtenerHuecoPorMensaje(mensajeId: number): Promise<HuecoConocimiento | null> {
    const result = await this.pool
      .request()
      .input('mensajeId', mssql.BigInt, mensajeId)
      .query(`
        SELECT TOP (1) ${COLUMNAS_HUECO}
        FROM dbo.CRM_ConocimientoHuecos
        WHERE origenMensajeId = @mensajeId
        ORDER BY id DESC
      `);
    const row = (result.recordset as HuecoRow[])[0];
    return row ? mapearHueco(row) : null;
  }

  // ---- E4·T7 (agente-ia-crm): escritura por la ingesta de conocimiento ----

  async crearEntrada(entrada: {
    titulo: string;
    contenido: string;
    etiquetas: string[];
    vigenciaDesde?: Date | null;
    vigenciaHasta?: Date | null;
    origen?: OrigenConocimiento;
  }): Promise<EntradaConocimiento> {
    // El titulo vive en NVARCHAR(200): el adapter acota (tareas.fallar
    // precedent — el límite de columna es del adapter, no del caller).
    const titulo = entrada.titulo.slice(0, 200);
    const csv = entrada.etiquetas
      .map((etiqueta) => etiqueta.trim())
      .filter((etiqueta) => etiqueta !== '')
      .join(',');
    const inserted = await this.pool
      .request()
      .input('titulo', mssql.NVarChar(200), titulo)
      .input('contenido', mssql.NVarChar(mssql.MAX), entrada.contenido)
      .input('etiquetas', mssql.NVarChar(300), csv)
      .input('vigenciaDesde', mssql.DateTime2, entrada.vigenciaDesde ?? null)
      .input('vigenciaHasta', mssql.DateTime2, entrada.vigenciaHasta ?? null)
      .input('origen', mssql.NVarChar(20), entrada.origen ?? 'MANUAL').query(`
        INSERT INTO dbo.CRM_Conocimiento
          (titulo, contenido, etiquetas, vigenciaDesde, vigenciaHasta, origen)
        OUTPUT INSERTED.id
        VALUES (@titulo, @contenido, @etiquetas, @vigenciaDesde, @vigenciaHasta, @origen)
      `);
    const id = (inserted.recordset as { id: number }[])[0]?.id;
    if (id === undefined) throw new Error('INSERT de CRM_Conocimiento no devolvió id');
    const releido = await this.pool
      .request()
      .input('id', mssql.Int, id)
      .query(`SELECT ${COLUMNAS} FROM dbo.CRM_Conocimiento WHERE id = @id`);
    const row = (releido.recordset as ConocimientoRow[])[0];
    if (!row) throw new Error('La entrada recién creada no pudo releerse');
    return mapearEntrada(row);
  }
}

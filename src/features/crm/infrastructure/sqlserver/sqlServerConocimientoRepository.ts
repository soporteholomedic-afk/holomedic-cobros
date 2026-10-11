import * as mssql from 'mssql';

import type { EntradaConocimiento } from '../../domain/entities';
import type { ConocimientoCrmRepository } from '../../domain/ports';

/**
 * SQL Server adapter for the knowledge-base port (agente-ia-crm E2·T1).
 * Read-only thin reader over CRM_Conocimiento — the ranking policy
 * lives in the application layer (recuperarConocimiento); the CRUD
 * editor arrives in E5. `buscarPorTexto` is the RAG prefilter: a
 * case-insensitive LIKE over titulo/contenido (database collation
 * precedent) whose wildcards are ALWAYS escaped (E1 lesson — a
 * client '%' must match a literal '%', never every row). Both reads
 * only ever return activo = 1 rows.
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
}

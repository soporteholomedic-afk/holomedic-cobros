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
    const limpio = texto.trim();
    if (limpio === '') return [];
    // NVarChar(MAX): contenido es NVARCHAR(MAX) — la consulta del
    // cliente puede superar cualquier límite fijo tras el escape ×3.
    const result = await this.pool
      .request()
      .input('texto', mssql.NVarChar(mssql.MAX), `%${escaparLike(limpio)}%`)
      .query(`
        SELECT ${COLUMNAS}
        FROM dbo.CRM_Conocimiento
        WHERE activo = 1 AND (titulo LIKE @texto OR contenido LIKE @texto)
        ORDER BY id
      `);
    return (result.recordset as ConocimientoRow[]).map(mapearEntrada);
  }
}

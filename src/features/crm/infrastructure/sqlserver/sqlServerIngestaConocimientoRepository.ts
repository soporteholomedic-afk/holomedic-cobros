import * as mssql from 'mssql';

import type { EstadoIngesta, IngestaConocimiento, TipoIngesta } from '../../domain/entities';
import type { EntradaCrearIngestaConocimiento, IngestaConocimientoRepository } from '../../domain/ports';

/**
 * SQL Server adapter for the knowledge-ingestion port (agente-ia-crm
 * E4·T7). Thin persister over CRM_IngestasConocimiento — el POLICY del
 * ciclo (PENDIENTE → PROCESANDO → COMPLETADA/FALLIDA y el contenido de
 * cada entrada) vive en las use cases (iniciarIngestaConocimiento /
 * procesarIngestaConocimiento); este adapter solo traduce filas. Los
 * BIGINT ids cruzan tedious como strings (TareaAgente/Hueco precedent)
 * y se mapean a number; los DATETIME2 cruzan como Date.
 *
 * El estado FALLIDA es terminal POR CONTRATO del dominio (un PDF
 * corrupto no mejora con reintentos) — el adapter no lo impide, pero
 * tampoco ofrece reencolar: no existe esa operación acá.
 */

/** CRM_IngestasConocimiento read row — BIGINT id as string, DATETIME2 as Date. */
interface IngestaRow {
  id: number | string;
  nombre: string;
  tipo: string;
  tamanoBytes: number;
  contenidoCrudo: string | null;
  estado: string;
  error: string | null;
  entradasCreadas: number;
  creadoPor: string | null;
  creadoEn: Date;
  procesadoEn: Date | null;
  vigenciaDesde: Date | null;
  vigenciaHasta: Date | null;
}

const COLUMNAS =
  'id, nombre, tipo, tamanoBytes, contenidoCrudo, estado, error, entradasCreadas, ' +
  'creadoPor, creadoEn, procesadoEn, vigenciaDesde, vigenciaHasta';

function mapearIngesta(row: IngestaRow): IngestaConocimiento {
  return {
    id: Number(row.id),
    nombre: row.nombre,
    tipo: row.tipo as TipoIngesta,
    tamanoBytes: row.tamanoBytes,
    contenidoCrudo: row.contenidoCrudo,
    estado: row.estado as EstadoIngesta,
    error: row.error,
    entradasCreadas: row.entradasCreadas,
    creadoPor: row.creadoPor,
    creadoEn: row.creadoEn,
    procesadoEn: row.procesadoEn,
    vigenciaDesde: row.vigenciaDesde,
    vigenciaHasta: row.vigenciaHasta,
  };
}

export class SqlServerIngestaConocimientoRepository implements IngestaConocimientoRepository {
  constructor(private readonly pool: mssql.ConnectionPool) {}

  async crear(entrada: EntradaCrearIngestaConocimiento): Promise<IngestaConocimiento> {
    const inserted = await this.pool
      .request()
      .input('nombre', mssql.NVarChar(260), entrada.nombre)
      .input('tipo', mssql.NVarChar(10), entrada.tipo)
      .input('tamanoBytes', mssql.Int, entrada.tamanoBytes)
      .input('contenidoCrudo', mssql.NVarChar(mssql.MAX), entrada.contenidoCrudo)
      .input('creadoPor', mssql.NVarChar(60), entrada.creadoPor ?? null)
      .input('vigenciaDesde', mssql.DateTime2, entrada.vigenciaDesde ?? null)
      .input('vigenciaHasta', mssql.DateTime2, entrada.vigenciaHasta ?? null).query(`
        INSERT INTO dbo.CRM_IngestasConocimiento
          (nombre, tipo, tamanoBytes, contenidoCrudo, creadoPor, vigenciaDesde, vigenciaHasta)
        OUTPUT INSERTED.id
        VALUES (@nombre, @tipo, @tamanoBytes, @contenidoCrudo, @creadoPor, @vigenciaDesde, @vigenciaHasta)
      `);
    const id = Number((inserted.recordset as { id: number | string }[])[0]?.id);
    if (Number.isNaN(id)) throw new Error('INSERT de CRM_IngestasConocimiento no devolvió id');
    const releida = await this.obtenerPorId(id);
    if (releida === null) throw new Error('La ingesta recién creada no pudo releerse');
    return releida;
  }

  async obtenerPorId(id: number): Promise<IngestaConocimiento | null> {
    const result = await this.pool
      .request()
      .input('id', mssql.BigInt, id)
      .query(`SELECT ${COLUMNAS} FROM dbo.CRM_IngestasConocimiento WHERE id = @id`);
    const row = (result.recordset as IngestaRow[])[0];
    return row ? mapearIngesta(row) : null;
  }

  async listarRecientes(limite: number): Promise<IngestaConocimiento[]> {
    const result = await this.pool
      .request()
      .input('limite', mssql.Int, limite)
      .query(`
        SELECT TOP (@limite) ${COLUMNAS}
        FROM dbo.CRM_IngestasConocimiento
        ORDER BY id DESC
      `);
    return (result.recordset as IngestaRow[]).map(mapearIngesta);
  }

  async marcarProcesando(id: number): Promise<void> {
    await this.pool
      .request()
      .input('id', mssql.BigInt, id)
      .query(`UPDATE dbo.CRM_IngestasConocimiento SET estado = 'PROCESANDO' WHERE id = @id`);
  }

  async marcarCompletada(id: number, entradasCreadas: number): Promise<void> {
    await this.pool
      .request()
      .input('id', mssql.BigInt, id)
      .input('entradasCreadas', mssql.Int, entradasCreadas)
      .query(`
        UPDATE dbo.CRM_IngestasConocimiento
        SET estado = 'COMPLETADA',
            entradasCreadas = @entradasCreadas,
            procesadoEn = SYSUTCDATETIME(),
            error = NULL
        WHERE id = @id
      `);
  }

  async marcarFallida(id: number, error: string): Promise<void> {
    await this.pool
      .request()
      .input('id', mssql.BigInt, id)
      .input('error', mssql.NVarChar(mssql.MAX), error)
      .query(`
        UPDATE dbo.CRM_IngestasConocimiento
        SET estado = 'FALLIDA',
            error = @error,
            procesadoEn = SYSUTCDATETIME()
        WHERE id = @id
      `);
  }
}

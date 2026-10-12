import * as mssql from 'mssql';

import type { ResumenCalidad } from '../../domain/entities';
import type { CalidadRepository } from '../../domain/ports';

/**
 * SQL Server adapter for the quality-metrics port (agente-ia-crm
 * E4·T6). Pure READ-ONLY aggregate behind GET /api/crm/calidad: three
 * parameterized SELECTs (mensajes / solicitudes / huecos), no user
 * input beyond the `desde` window parameter. Every column is
 * table-qualified (E1 lesson: ambiguous columns on joins) — these
 * queries have no join, the alias keeps the contract anyway.
 *
 * Metric definitions (window = `creadoEn >= @desde`; huecos SIN
 * ventana):
 *  - respuestasIa      = COUNT emisor='IA' AND score IS NOT NULL
 *                        (solo generaciones reales; la escalación sin
 *                        LLM no estampa score y no cuenta).
 *  - scorePromedio     = AVG(score) sobre esas filas; NULL si no hay.
 *  - fidelidadPromedio = AVG(fidelidad) sobre emisor='IA' con
 *                        fidelidad; NULL si no hay (NULL es 'sin
 *                        dato', nunca 0).
 *  - porcentajeConFuentes = generadas con fuentes NOT NULL y <> '[]'
 *                        * 100.0 / generadas; NULLIF deja NULL cuando
 *                        no hay generadas (división por cero imposible).
 *  - marcadasDeficiente = COUNT emisor='IA' AND deficiente=1 (creadoEn
 *                        del mensaje IA, en ventana).
 *  - solicitudesAyuda  = COUNT CRM_SolicitudesAyuda en ventana.
 *  - huecosAbiertos    = COUNT CRM_ConocimientoHuecos estado='ABIERTO'
 *                        (TOTAL acumulado — el backlog de curación no
 *                        caduca con la ventana).
 *  - intervencionesHumanas = COUNT emisor='HUMANO' AND direccion='OUT'
 *                        en ventana.
 *
 * Clock note: CRM_Mensajes/CRM_Conversaciones stamp SYSDATETIME()
 * (server-local) while CRM_SolicitudesAyuda/CRM_ConocimientoHuecos
 * stamp SYSUTCDATETIME() (UTC). The 30-day window absorbs the offset
 * for product purposes; the window boundary is identical for both
 * tables by design decision (fixed window, no cross-table boundaries).
 */

/** Aggregate row over CRM_Mensajes (COUNT never NULL; AVG/percent NULL without rows). */
interface FilasMensajes {
  respuestasIa: number;
  scorePromedio: number | null;
  fidelidadPromedio: number | null;
  porcentajeConFuentes: number | null;
  marcadasDeficiente: number;
  intervencionesHumanas: number;
}

interface FilaConteo {
  total: number;
}

export class SqlServerCalidadRepository implements CalidadRepository {
  constructor(private readonly pool: mssql.ConnectionPool) {}

  async obtenerResumen(desde: Date): Promise<ResumenCalidad> {
    const [mensajes, solicitudes, huecos] = await Promise.all([
      this.pool
        .request()
        .input('desde', mssql.DateTime2, desde)
        .query(`
          SELECT
            COUNT(CASE WHEN m.emisor = 'IA' AND m.score IS NOT NULL THEN 1 END) AS respuestasIa,
            AVG(CASE WHEN m.emisor = 'IA' AND m.score IS NOT NULL THEN m.score END)
              AS scorePromedio,
            AVG(CASE WHEN m.emisor = 'IA' AND m.fidelidad IS NOT NULL THEN m.fidelidad END)
              AS fidelidadPromedio,
            COUNT(CASE WHEN m.emisor = 'IA' AND m.score IS NOT NULL
                        AND m.fuentes IS NOT NULL AND m.fuentes <> '[]' THEN 1 END) * 100.0
              / NULLIF(COUNT(CASE WHEN m.emisor = 'IA' AND m.score IS NOT NULL THEN 1 END), 0)
              AS porcentajeConFuentes,
            COUNT(CASE WHEN m.emisor = 'IA' AND m.deficiente = 1 THEN 1 END)
              AS marcadasDeficiente,
            COUNT(CASE WHEN m.emisor = 'HUMANO' AND m.direccion = 'OUT' THEN 1 END)
              AS intervencionesHumanas
          FROM dbo.CRM_Mensajes m
          WHERE m.creadoEn >= @desde
        `),
      this.pool
        .request()
        .input('desde', mssql.DateTime2, desde)
        .query(`
          SELECT COUNT(*) AS total
          FROM dbo.CRM_SolicitudesAyuda s
          WHERE s.creadoEn >= @desde
        `),
      this.pool.request().query(`
        SELECT COUNT(*) AS total
        FROM dbo.CRM_ConocimientoHuecos h
        WHERE h.estado = 'ABIERTO'
      `),
    ]);

    const f = (mensajes.recordset as FilasMensajes[])[0];
    if (!f) throw new Error('El agregado de CRM_Mensajes no devolvió fila');

    return {
      desde: desde.toISOString(),
      respuestasIa: Number(f.respuestasIa),
      scorePromedio: f.scorePromedio === null ? null : Number(f.scorePromedio),
      fidelidadPromedio: f.fidelidadPromedio === null ? null : Number(f.fidelidadPromedio),
      porcentajeConFuentes:
        f.porcentajeConFuentes === null ? null : Number(f.porcentajeConFuentes),
      marcadasDeficiente: Number(f.marcadasDeficiente),
      solicitudesAyuda: Number(((solicitudes.recordset as FilaConteo[])[0] ?? { total: 0 }).total),
      huecosAbiertos: Number(((huecos.recordset as FilaConteo[])[0] ?? { total: 0 }).total),
      intervencionesHumanas: Number(f.intervencionesHumanas),
    };
  }
}

import mssql from 'mssql';
import type { JjcEvaluacion, LesionPoint } from '@/types/jjc';
import type { IJjcEvaluacionRepository } from '@/features/jjc-mapper/domain/ports';
import { getHolomedicPool } from '@/lib/db';
import { parseFototipo } from '@/features/jjc-mapper/domain/entities';

/**
 * SQL Server adapter for `IJjcEvaluacionRepository`.
 *
 * Persists evaluations to `dbo.JjcEvaluacion` in the HOLOMEDIC database.
 * Lesion points are round-tripped through a JSON column (`lesionesJson`).
 * The save method uses upsert (MERGE) — one evaluation per `idAtencion`.
 */
export class SqlServerJjcEvaluacionRepository implements IJjcEvaluacionRepository {
  async save(evaluacion: JjcEvaluacion): Promise<void> {
    const pool = await getHolomedicPool();
    const lesionesJson = JSON.stringify(evaluacion.lesiones);
    const now = new Date();

    await pool
      .request()
      .input('idAtencion', mssql.VarChar(50), evaluacion.idAtencion)
      .input('fechaEvaluacion', mssql.Date, new Date(evaluacion.fechaEvaluacion))
      .input('lugar', mssql.VarChar(100), evaluacion.lugar)
      .input('fototipo', mssql.VarChar(20), evaluacion.fototipo)
      .input('observaciones', mssql.NVarChar(500), evaluacion.observaciones)
      .input('lesionesJson', mssql.NVarChar(mssql.MAX), lesionesJson)
      .input('updatedAt', mssql.DateTime, now)
      .query(`
        MERGE dbo.JjcEvaluacion AS target
        USING (SELECT @idAtencion AS idAtencion) AS source
        ON target.idAtencion = source.idAtencion
        WHEN MATCHED THEN
          UPDATE SET
            fechaEvaluacion = @fechaEvaluacion,
            lugar           = @lugar,
            fototipo        = @fototipo,
            observaciones   = @observaciones,
            lesionesJson    = @lesionesJson,
            updatedAt       = @updatedAt
        WHEN NOT MATCHED THEN
          INSERT (idAtencion, fechaEvaluacion, lugar, fototipo, observaciones, lesionesJson, createdAt, updatedAt)
          VALUES (@idAtencion, @fechaEvaluacion, @lugar, @fototipo, @observaciones, @lesionesJson, @updatedAt, @updatedAt);
      `);
  }

  async loadByAtencion(idAtencion: string): Promise<JjcEvaluacion | null> {
    const pool = await getHolomedicPool();

    const result = await pool
      .request()
      .input('idAtencion', mssql.VarChar(50), idAtencion)
      .query<JjcEvaluacionRow>(`
        SELECT idAtencion, fechaEvaluacion, lugar, fototipo, observaciones, lesionesJson
        FROM dbo.JjcEvaluacion
        WHERE idAtencion = @idAtencion
      `);

    const rows = result.recordset;
    return rows.length > 0 ? mapRow(rows[0]) : null;
  }
}

interface JjcEvaluacionRow {
  idAtencion: string;
  fechaEvaluacion: Date;
  lugar: string;
  fototipo: string;
  observaciones: string | null;
  lesionesJson: string;
}

function mapRow(row: JjcEvaluacionRow): JjcEvaluacion | null {
  const fototipo = parseFototipo(row.fototipo);
  if (!fototipo) return null;

  let lesiones: LesionPoint[] = [];
  try {
    const parsed = JSON.parse(row.lesionesJson);
    if (Array.isArray(parsed)) lesiones = parsed as LesionPoint[];
  } catch {
    lesiones = [];
  }

  const dateStr =
    row.fechaEvaluacion instanceof Date
      ? row.fechaEvaluacion.toISOString().slice(0, 10)
      : String(row.fechaEvaluacion);

  return {
    idAtencion: row.idAtencion,
    fechaEvaluacion: dateStr,
    lugar: 'HOLOMEDIC',
    fototipo,
    observaciones: row.observaciones ?? '',
    lesiones,
  };
}

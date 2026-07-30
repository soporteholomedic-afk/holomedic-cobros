import mssql from 'mssql';
import type { JjcEvaluacion, LesionPoint, CuestionarioPiel } from '@/types/jjc';
import type { IJjcEvaluacionRepository } from '@/features/jjc-mapper/domain/ports';
import { getHolomedicPool } from '@/lib/db';
import { parseFototipo, parseFotoprotector } from '@/features/jjc-mapper/domain/entities';

/**
 * SQL Server adapter for `IJjcEvaluacionRepository`.
 *
 * Persists medicina-specific evaluations to two tables in HOLOMEDIC:
 *   - `dbo.Evaluacion`           — generic base (idAtencion, area, fecha, lugar, observaciones, createdBy)
 *   - `dbo.EvaluacionMedicina`   — medicina-specific (fototipo, fotoprotector, lesionesJson, preguntasJson)
 *
 * Both writes are committed in a single transaction so the 1:1 invariant is
 * always satisfied. The companion table `dbo.EvaluacionMusculoEsqueletica` is
 * reserved for future musculo-specific columns.
 */
export class SqlServerJjcEvaluacionRepository implements IJjcEvaluacionRepository {
  async save(evaluacion: JjcEvaluacion): Promise<void> {
    const pool = await getHolomedicPool();
    await pool.connect();
    const lesionesJson = JSON.stringify(evaluacion.lesiones);
    const preguntasJson = evaluacion.preguntas ? JSON.stringify(evaluacion.preguntas) : null;
    const now = new Date();

    const transaction = new mssql.Transaction(pool);
    await transaction.begin();

    try {
      // 1. UPSERT into Evaluacion (generic base)
      const req1 = new mssql.Request(transaction);
      req1
        .input('idAtencion', mssql.VarChar(50), evaluacion.idAtencion)
        .input('area', mssql.VarChar(50), evaluacion.area)
        .input('fechaEvaluacion', mssql.Date, new Date(evaluacion.fechaEvaluacion))
        .input('lugar', mssql.VarChar(100), evaluacion.lugar)
        .input('observaciones', mssql.NVarChar(500), evaluacion.observaciones)
        .input('createdBy', mssql.NVarChar(100), evaluacion.createdBy)
        .input('updatedAt', mssql.DateTime, now);
      await req1.query(`
        MERGE dbo.Evaluacion AS target
        USING (SELECT @idAtencion AS idAtencion, @area AS area) AS source
        ON target.idAtencion = source.idAtencion AND target.area = source.area
        WHEN MATCHED THEN
          UPDATE SET
            fechaEvaluacion = @fechaEvaluacion,
            lugar           = @lugar,
            observaciones   = @observaciones,
            updatedAt       = @updatedAt
        WHEN NOT MATCHED THEN
          INSERT (idAtencion, area, fechaEvaluacion, lugar, observaciones, createdBy, createdAt, updatedAt)
          VALUES (@idAtencion, @area, @fechaEvaluacion, @lugar, @observaciones, @createdBy, @updatedAt, @updatedAt);
      `);

      // 2. UPSERT into EvaluacionMedicina (medicina-specific)
      const req2 = new mssql.Request(transaction);
      req2
        .input('idAtencion', mssql.VarChar(50), evaluacion.idAtencion)
        .input('area', mssql.VarChar(50), evaluacion.area)
        .input('fototipo', mssql.VarChar(20), evaluacion.fototipo)
        .input('fotoprotector', mssql.VarChar(30), evaluacion.fotoprotector)
        .input('lesionesJson', mssql.NVarChar(mssql.MAX), lesionesJson)
        .input('preguntasJson', mssql.NVarChar(mssql.MAX), preguntasJson);
      await req2.query(`
        MERGE dbo.EvaluacionMedicina AS target
        USING (SELECT @idAtencion AS idAtencion, @area AS area) AS source
        ON target.idAtencion = source.idAtencion AND target.area = source.area
        WHEN MATCHED THEN
          UPDATE SET
            fototipo      = @fototipo,
            fotoprotector = @fotoprotector,
            lesionesJson  = @lesionesJson,
            preguntasJson = @preguntasJson
        WHEN NOT MATCHED THEN
          INSERT (idAtencion, area, fototipo, fotoprotector, lesionesJson, preguntasJson)
          VALUES (@idAtencion, @area, @fototipo, @fotoprotector, @lesionesJson, @preguntasJson);
      `);

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }

  async loadByAtencion(idAtencion: string, area: string): Promise<JjcEvaluacion | null> {
    const pool = await getHolomedicPool();
    await pool.connect();

    const result = await pool
      .request()
      .input('idAtencion', mssql.VarChar(50), idAtencion)
      .input('area', mssql.VarChar(50), area)
      .query<JjcEvaluacionRow>(`
        SELECT
          e.idAtencion, e.area, e.fechaEvaluacion, e.lugar, e.observaciones, e.createdBy,
          m.fototipo, m.fotoprotector, m.lesionesJson, m.preguntasJson
        FROM dbo.Evaluacion e
        LEFT JOIN dbo.EvaluacionMedicina m
          ON e.idAtencion = m.idAtencion AND e.area = m.area
        WHERE e.idAtencion = @idAtencion AND e.area = @area
      `);

    const rows = result.recordset;
    return rows.length > 0 ? mapRow(rows[0]) : null;
  }
}

interface JjcEvaluacionRow {
  idAtencion: string;
  area: string;
  fechaEvaluacion: Date;
  lugar: string;
  observaciones: string | null;
  createdBy: string | null;
  fototipo: string | null;
  fotoprotector: string | null;
  lesionesJson: string | null;
  preguntasJson: string | null;
}

function mapRow(row: JjcEvaluacionRow): JjcEvaluacion | null {
  // Without medicina-specific data, we can't construct a JjcEvaluacion.
  if (!row.fototipo) return null;
  const fototipo = parseFototipo(row.fototipo);
  if (!fototipo) return null;

  let lesiones: LesionPoint[] = [];
  if (row.lesionesJson) {
    try {
      const parsed = JSON.parse(row.lesionesJson);
      if (Array.isArray(parsed)) lesiones = parsed as LesionPoint[];
    } catch {
      lesiones = [];
    }
  }

  const dateStr =
    row.fechaEvaluacion instanceof Date
      ? row.fechaEvaluacion.toISOString().slice(0, 10)
      : String(row.fechaEvaluacion);

  let preguntas: CuestionarioPiel | null = null;
  if (row.preguntasJson) {
    try {
      const parsed = JSON.parse(row.preguntasJson);
      if (parsed && typeof parsed === 'object') preguntas = parsed as CuestionarioPiel;
    } catch {
      preguntas = null;
    }
  }

  const fotoprotector = parseFotoprotector(row.fotoprotector ?? '');

  return {
    idAtencion: row.idAtencion,
    area: row.area,
    fechaEvaluacion: dateStr,
    lugar: 'HOLOMEDIC',
    fototipo,
    fotoprotector: fotoprotector ?? 'FPS recomendado +90',
    observaciones: row.observaciones ?? '',
    lesiones,
    preguntas,
    createdBy: row.createdBy ?? null,
  };
}

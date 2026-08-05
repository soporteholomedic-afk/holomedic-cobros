import mssql from 'mssql';
import type { EvaluacionOsteomuscular } from '@/types/evaluacion-osteomuscular';
import type { IEvaluacionOsteomuscularRepository } from '@/features/evaluacion-osteomuscular/domain/ports';
import { getHolomedicPool } from '@/lib/db';

/** Area discriminator used in the generic `dbo.Evaluacion` base table. */
export const AREA_MUSCULOESQUELETICA = 'musculoesqueletica';

/**
 * SQL Server adapter for `IEvaluacionOsteomuscularRepository`.
 *
 * Persists the osteomuscular clinical evaluation to two tables in HOLOMEDIC:
 *   - `dbo.Evaluacion`                 — generic base (idAtencion, area, fecha)
 *   - `dbo.EvaluacionMusculoEsqueletica` — musculo-specific (evaluacionJson)
 *
 * Both writes are committed in a single transaction so the 1:1 invariant is
 * always satisfied. The full evaluation travels as a JSON document. The base
 * row is shared with the interview (same idAtencion + area).
 */
export class SqlServerEvaluacionOsteomuscularRepository
  implements IEvaluacionOsteomuscularRepository {
  async save(evaluacion: EvaluacionOsteomuscular): Promise<void> {
    const pool = await getHolomedicPool();
    await pool.connect();
    const evaluacionJson = JSON.stringify(evaluacion);
    const now = new Date();

    const transaction = new mssql.Transaction(pool);
    await transaction.begin();

    try {
      // 1. UPSERT into Evaluacion (generic base)
      const req1 = new mssql.Request(transaction);
      req1
        .input('idAtencion', mssql.VarChar(50), evaluacion.idAtencion)
        .input('area', mssql.VarChar(50), AREA_MUSCULOESQUELETICA)
        .input('fechaEvaluacion', mssql.Date, now)
        .input('updatedAt', mssql.DateTime, now);
      await req1.query(`
        MERGE dbo.Evaluacion AS target
        USING (SELECT @idAtencion AS idAtencion, @area AS area) AS source
        ON target.idAtencion = source.idAtencion AND target.area = source.area
        WHEN MATCHED THEN
          UPDATE SET
            fechaEvaluacion = @fechaEvaluacion,
            updatedAt       = @updatedAt
        WHEN NOT MATCHED THEN
          INSERT (idAtencion, area, fechaEvaluacion, lugar, createdAt, updatedAt)
          VALUES (@idAtencion, @area, @fechaEvaluacion, 'HOLOMEDIC', @updatedAt, @updatedAt);
      `);

      // 2. UPSERT into EvaluacionMusculoEsqueletica (evaluation JSON)
      const req2 = new mssql.Request(transaction);
      req2
        .input('idAtencion', mssql.VarChar(50), evaluacion.idAtencion)
        .input('area', mssql.VarChar(50), AREA_MUSCULOESQUELETICA)
        .input('evaluacionJson', mssql.NVarChar(mssql.MAX), evaluacionJson);
      await req2.query(`
        MERGE dbo.EvaluacionMusculoEsqueletica AS target
        USING (SELECT @idAtencion AS idAtencion, @area AS area) AS source
        ON target.idAtencion = source.idAtencion AND target.area = source.area
        WHEN MATCHED THEN
          UPDATE SET evaluacionJson = @evaluacionJson
        WHEN NOT MATCHED THEN
          INSERT (idAtencion, area, evaluacionJson)
          VALUES (@idAtencion, @area, @evaluacionJson);
      `);

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }

  async loadByAtencion(idAtencion: string): Promise<EvaluacionOsteomuscular | null> {
    const pool = await getHolomedicPool();
    await pool.connect();

    const result = await pool
      .request()
      .input('idAtencion', mssql.VarChar(50), idAtencion)
      .input('area', mssql.VarChar(50), AREA_MUSCULOESQUELETICA)
      .query<EvaluacionRow>(`
        SELECT evaluacionJson
        FROM dbo.EvaluacionMusculoEsqueletica
        WHERE idAtencion = @idAtencion AND area = @area
      `);

    const row = result.recordset[0];
    if (!row?.evaluacionJson) return null;

    try {
      const parsed: unknown = JSON.parse(row.evaluacionJson);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed as EvaluacionOsteomuscular;
    } catch {
      return null;
    }
  }
}

interface EvaluacionRow {
  evaluacionJson: string | null;
}

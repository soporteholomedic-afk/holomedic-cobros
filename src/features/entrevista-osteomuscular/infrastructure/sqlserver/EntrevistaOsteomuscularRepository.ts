import mssql from 'mssql';
import type { EntrevistaOsteomuscular } from '@/types/entrevista-osteomuscular';
import type { IEntrevistaOsteomuscularRepository } from '@/features/entrevista-osteomuscular/domain/ports';
import { getHolomedicPool } from '@/lib/db';

/** Area discriminator used in the generic `dbo.Evaluacion` base table. */
export const AREA_MUSCULOESQUELETICA = 'musculoesqueletica';

/**
 * SQL Server adapter for `IEntrevistaOsteomuscularRepository`.
 *
 * Persists the osteomuscular interview to two tables in HOLOMEDIC:
 *   - `dbo.Evaluacion`                 — generic base (idAtencion, area, fecha)
 *   - `dbo.EvaluacionMusculoEsqueletica` — musculo-specific (entrevistaJson)
 *
 * Both writes are committed in a single transaction so the 1:1 invariant is
 * always satisfied. The full interview (including the `detalleIrradiacion`
 * fields of CERVICAL / DORSAL / LUMBO SACRA) travels as a JSON document.
 */
export class SqlServerEntrevistaOsteomuscularRepository
  implements IEntrevistaOsteomuscularRepository {
  async save(entrevista: EntrevistaOsteomuscular): Promise<void> {
    const pool = await getHolomedicPool();
    await pool.connect();
    const entrevistaJson = JSON.stringify(entrevista);
    const fechaEvaluacion = parseFecha(entrevista.datosGenerales?.fechaEntrevista);
    const now = new Date();

    const transaction = new mssql.Transaction(pool);
    await transaction.begin();

    try {
      // 1. UPSERT into Evaluacion (generic base)
      const req1 = new mssql.Request(transaction);
      req1
        .input('idAtencion', mssql.VarChar(50), entrevista.idAtencion)
        .input('area', mssql.VarChar(50), AREA_MUSCULOESQUELETICA)
        .input('fechaEvaluacion', mssql.Date, fechaEvaluacion)
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

      // 2. UPSERT into EvaluacionMusculoEsqueletica (interview JSON)
      const req2 = new mssql.Request(transaction);
      req2
        .input('idAtencion', mssql.VarChar(50), entrevista.idAtencion)
        .input('area', mssql.VarChar(50), AREA_MUSCULOESQUELETICA)
        .input('entrevistaJson', mssql.NVarChar(mssql.MAX), entrevistaJson);
      await req2.query(`
        MERGE dbo.EvaluacionMusculoEsqueletica AS target
        USING (SELECT @idAtencion AS idAtencion, @area AS area) AS source
        ON target.idAtencion = source.idAtencion AND target.area = source.area
        WHEN MATCHED THEN
          UPDATE SET entrevistaJson = @entrevistaJson
        WHEN NOT MATCHED THEN
          INSERT (idAtencion, area, entrevistaJson)
          VALUES (@idAtencion, @area, @entrevistaJson);
      `);

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }

  async loadByAtencion(idAtencion: string): Promise<EntrevistaOsteomuscular | null> {
    const pool = await getHolomedicPool();
    await pool.connect();

    const result = await pool
      .request()
      .input('idAtencion', mssql.VarChar(50), idAtencion)
      .input('area', mssql.VarChar(50), AREA_MUSCULOESQUELETICA)
      .query<EntrevistaRow>(`
        SELECT entrevistaJson
        FROM dbo.EvaluacionMusculoEsqueletica
        WHERE idAtencion = @idAtencion AND area = @area
      `);

    const row = result.recordset[0];
    if (!row?.entrevistaJson) return null;

    try {
      const parsed: unknown = JSON.parse(row.entrevistaJson);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed as EntrevistaOsteomuscular;
    } catch {
      return null;
    }
  }
}

interface EntrevistaRow {
  entrevistaJson: string | null;
}

function parseFecha(value: string | undefined): Date {
  if (value) {
    const date = new Date(value);
    if (!isNaN(date.getTime())) return date;
  }
  return new Date();
}

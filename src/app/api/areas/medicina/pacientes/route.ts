import { NextResponse } from 'next/server';
import mssql from 'mssql';
import { getHolomedicPool, getPool } from '@/lib/db';
import type { PacientePorEmpresaRow } from '@/types/sp-result';

/**
 * GET /api/areas/medicina/pacientes
 *
 * Returns patients attended within a date range for a given company.
 * Filters by exact Cliente.CodCli match (not by name).
 *
 * Query params:
 *   company      (required, integer) — Cliente.CodCli, e.g. 149 for JJC
 *   fechaInicio  (optional, YYYY-MM-DD) — start date; defaults to today
 *   fechaFin     (optional, YYYY-MM-DD) — end date; defaults to today
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);

    // ---- Validate company ----
    const rawCompany = searchParams.get('company');
    if (!rawCompany) {
      return NextResponse.json(
        { error: 'El parámetro "company" es obligatorio.' },
        { status: 400 },
      );
    }
    const codCli = Number(rawCompany);
    if (!Number.isInteger(codCli) || codCli <= 0) {
      return NextResponse.json(
        { error: 'El parámetro "company" debe ser un número entero válido.' },
        { status: 400 },
      );
    }

    // ---- Parse date range ----
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const rawFechaInicio = searchParams.get('fechaInicio') || todayStr;
    const rawFechaFin = searchParams.get('fechaFin') || todayStr;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawFechaInicio) || !/^\d{4}-\d{2}-\d{2}$/.test(rawFechaFin)) {
      return NextResponse.json(
        { error: 'Las fechas deben tener formato YYYY-MM-DD.' },
        { status: 400 },
      );
    }

    if (rawFechaInicio > rawFechaFin) {
      return NextResponse.json(
        { error: 'La fecha de inicio no puede ser mayor a la fecha final.' },
        { status: 400 },
      );
    }

    const fechaInicio = `${rawFechaInicio} 00:00:00`;
    const fechaFin = `${rawFechaFin} 23:59:59`;

    // ---- Query ----
    const pool = await getPool();
    await pool.connect();

    const result = await pool
      .request()
      .input('CodCli', mssql.Int, codCli)
      .input('FecIni', mssql.VarChar, fechaInicio)
      .input('FecFin', mssql.VarChar, fechaFin)
      .query(`
        SELECT
          CASE WHEN O.CodSed <= 9 THEN '0' ELSE '' END
            + CONVERT(VARCHAR, O.CodSed)
            + CONVERT(VARCHAR, O.CodTCl)
            + CONVERT(VARCHAR, O.NumOrd) AS idAtencion,
          P.NroDId AS dni,
          CASE WHEN ISNULL(O.ApmPac, '') = ''
            THEN O.AppPac + ' ' + O.NomPac
            ELSE O.AppPac + ' ' + O.ApmPac + ' ' + O.NomPac
          END AS paciente,
          O.SexPac AS sexo,
          CONVERT(VARCHAR, O.FecNac, 103) AS fechaNac,
          O.EdaPac AS edad,
          CONVERT(VARCHAR, O.FecAte, 103) AS fechaAtencion,
          C.NomCom AS empresa,
          TC.DesTCh AS tipoExamen,
          O.DesPue AS puesto
        FROM Orden O
        INNER JOIN Cliente C ON C.CodCli = O.CodCli
        INNER JOIN Persona P ON P.CodPer = O.CodPac
        LEFT JOIN TipoChequeo TC ON TC.CodTCh = O.CodTCh
        WHERE O.IndReg = 1
          AND C.CodCli = @CodCli
          AND O.FecAte >= @FecIni
          AND O.FecAte <= @FecFin
          AND EXISTS (
            SELECT 1
            FROM OrdenxServicio OS2
            INNER JOIN Servicio S2 ON S2.CodSer = OS2.CodSer
            INNER JOIN Especialidad E2 ON E2.CodEsp = S2.CodEsp
            WHERE OS2.CodEmp = O.CodEmp
              AND OS2.CodSed = O.CodSed
              AND OS2.CodTCl = O.CodTCl
              AND OS2.NumOrd = O.NumOrd
              AND E2.NomEsp = 'MEDICINA GENERAL'
          )
        ORDER BY paciente
      `);

    const rows = result.recordset as PacientePorEmpresaRow[];

    // ---- Determine which idAtencion values have saved evaluations ----
    let evaluacionIds = new Set<string>();
    if (rows.length > 0) {
      try {
        const hPool = await getHolomedicPool();
        await hPool.connect();
        const conditions = rows.map((_, i) => `@id${i}`);
        const evalRequest = hPool.request();
        for (let i = 0; i < rows.length; i++) {
          evalRequest.input(`id${i}`, mssql.VarChar(50), rows[i].idAtencion);
        }
        const evalResult = await evalRequest.query(`
          SELECT DISTINCT idAtencion FROM dbo.JjcEvaluacion
          WHERE idAtencion IN (${conditions.join(', ')})
        `);
        evaluacionIds = new Set<string>(
          (evalResult.recordset as { idAtencion: string }[]).map((r) => r.idAtencion),
        );
      } catch {
        // If HOLOMEDIC is unreachable, treat all as not evaluated (graceful fallback)
        console.warn('areas/medicina/pacientes: could not query evaluations from HOLOMEDIC');
      }
    }

    const enriched = rows.map((row) => ({
      ...row,
      hasEvaluacion: evaluacionIds.has(row.idAtencion),
    }));

    return NextResponse.json(enriched);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('areas/medicina/pacientes route error:', message);
    return NextResponse.json(
      { error: 'Error al consultar los pacientes. Intente nuevamente.' },
      { status: 500 },
    );
  }
}

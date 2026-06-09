import { NextResponse } from 'next/server';
import mssql from 'mssql';
import { getPool } from '@/lib/db';
import { groupByCompany } from '@/lib/group-by-company';
import type { SpResultRow } from '@/types/sp-result';

/**
 * GET /api/consolidados/results
 *
 * Executes SP_RPT_MATRIZICCGSA on SQL Server, groups results by company,
 * and returns them as JSON.
 *
 * Query params (optional):
 *   fechaInicio - Start date for the SP (format: YYYY-MM-DD)
 *   fechaFin    - End date for the SP (format: YYYY-MM-DD)
 *
 * If omitted, NULL is passed to the SP parameters.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    // ---- Parse query params ----
    const { searchParams } = new URL(request.url);
    const rawFechaInicio = searchParams.get('fechaInicio') || null;
    const rawFechaFin = searchParams.get('fechaFin') || null;

    const fechaInicio = rawFechaInicio
      ? (rawFechaInicio.includes(' ') ? rawFechaInicio : `${rawFechaInicio} 00:00:00`)
      : null;
    const fechaFin = rawFechaFin
      ? (rawFechaFin.includes(' ') ? rawFechaFin : `${rawFechaFin} 23:59:59`)
      : null;

    // ---- Get DB connection pool ----
    const pool = await getPool();
    await pool.connect();

    console.log('fechaInicio', fechaInicio);
    console.log('fechaFin', fechaFin);
    // ---- Execute stored procedure ----
    const result = await pool
      .request()
      .input('FecIni', mssql.VarChar, fechaInicio)
      .input('FecFin', mssql.VarChar, fechaFin)
      .input('CodCli', mssql.Int, null)
      .input('CodDes', mssql.Int, null)
      .input('CodSed', mssql.Int, null)
      .execute('SP_RPT_MATRIZICCGSA');

    const rows = result.recordset as SpResultRow[];

    // ---- Group by company ----
    const companies = groupByCompany(rows);

    return NextResponse.json({ companies });
  } catch (error) {
    // Production-safe error — never expose raw DB details, SP names, or data
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred';

    console.error('consolidados results route error:', message);

    return NextResponse.json(
      { error: 'Error al consultar los consolidados. Intente nuevamente.' },
      { status: 500 },
    );
  }
}

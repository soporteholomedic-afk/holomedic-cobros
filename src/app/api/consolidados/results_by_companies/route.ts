import { NextResponse } from 'next/server';
import mssql from 'mssql';
import { getPool } from '@/lib/db';
import type { OrderRow } from '@/types/sp-result';

/**
 * GET /api/consolidados/results_by_companies
 *
 * Executes SP_SEL_ORDEN on SQL Server filtered by company name and optional
 * date range. Returns patient/work-order rows as a flat JSON array.
 *
 * Query params:
 *   companyName - (required) Company legal name to filter by
 *   fechaInicio - (optional) Start date (format: YYYY-MM-DD)
 *   fechaFin    - (optional) End date (format: YYYY-MM-DD)
 */

function buildWhere(
  companyName: string,
  fechaInicio: string | null,
  fechaFin: string | null,
): string {
  // Escape single quotes, strip semicolons to prevent SQL injection
  const safe = companyName.replace(/'/g, "''").replace(/;/g, '');
  let where = `NomCFa LIKE '%${safe}%'`;
  if (fechaInicio) where += ` AND FecAte >= '${fechaInicio}'`;
  if (fechaFin) where += ` AND FecAte <= '${fechaFin}'`;
  return where;
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    // ---- Parse query params ----
    const { searchParams } = new URL(request.url);
    const companyName = searchParams.get('companyName');

    if (!companyName) {
      return NextResponse.json(
        { error: "El parámetro 'companyName' es requerido." },
        { status: 400 },
      );
    }

    const rawFechaInicio = searchParams.get('fechaInicio') || null;
    const rawFechaFin = searchParams.get('fechaFin') || null;

    const fechaInicio = rawFechaInicio
      ? (rawFechaInicio.includes(' ') ? rawFechaInicio : `${rawFechaInicio} 00:00:00`)
      : null;
    const fechaFin = rawFechaFin
      ? (rawFechaFin.includes(' ') ? rawFechaFin : `${rawFechaFin} 23:59:59`)
      : null;

    // ---- Build sanitized WHERE clause ----
    const where = buildWhere(companyName, fechaInicio, fechaFin);

    // ---- Execute stored procedure ----
    const pool = await getPool();
    await pool.connect();

    const result = await pool
      .request()
      .input('WHERE', mssql.VarChar, where)
      .input('ORDER', mssql.VarChar, 'CodEmp,CodSed,NumOrd')
      .input('WHEREAREAS', mssql.VarChar, '')
      .execute('SP_SEL_ORDEN');

    const rows = result.recordset as OrderRow[];

    return NextResponse.json(rows);
  } catch (error) {
    // Production-safe error — never expose raw DB details, SP names, or data
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred';

    console.error('consolidados results by companies route error:', message);

    return NextResponse.json(
      { error: 'Error al consultar los consolidados. Intente nuevamente.' },
      { status: 500 },
    );
  }
}

import { NextResponse } from 'next/server';
import mssql from 'mssql';
import { getPool } from '@/lib/db';
import type { SedeRow } from '@/types/sp-result';

/**
 * GET /api/consolidados/sedes
 *
 * Executes SP_SEL_SEDE on SQL Server and returns the active locations
 * (IndReg = 1) ordered by CodSed. No query params.
 */
export async function GET(): Promise<NextResponse> {
  try {
    // ---- Get DB connection pool ----
    const pool = await getPool();
    await pool.connect();

    // ---- Execute stored procedure ----
    const result = await pool
      .request()
      .input('WHERE', mssql.VarChar, 'IndReg = 1')
      .input('ORDER', mssql.VarChar, 'CodSed')
      .execute('SP_SEL_SEDE');

    const rows = result.recordset as Array<{ CodSed: number; NomSed: string | null }>;

    const sedes: SedeRow[] = rows.map((row) => ({
      codSed: row.CodSed,
      nomSed: row.NomSed?.trim() ?? '',
    }));

    return NextResponse.json({ sedes });
  } catch (error) {
    // Production-safe error — never expose raw DB details, SP names, or data
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred';

    console.error('consolidados sedes route error:', message);

    return NextResponse.json(
      { error: 'Error al cargar las sedes. Intente nuevamente.' },
      { status: 500 },
    );
  }
}

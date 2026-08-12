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
 *   fechaFin    - (optional) End date (format: YYYY-MM-DD, inclusive)
 *   codSed      - (optional) SIGLA location id (positive integer) to filter by
 *
 * Dates are inlined into the WHERE clause as style-120
 * `CONVERT(datetime,'YYYY-MM-DD HH:mm:ss',120)` literals. The SP
 * accepts only a textual WHERE, so scalar `mssql.DateTime` params are
 * impossible; a raw ISO literal like `'2026-07-02'` is parsed
 * according to the session's login language and could become
 * February 7 under a Spanish dmy session. The explicit style-120
 * conversion makes the requested calendar date unambiguous.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True when `value` is a real calendar date in `YYYY-MM-DD` (not just a shape match). */
function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Thrown by `buildWhere` when a date param fails `YYYY-MM-DD`
 * validation. Caught in `GET` and mapped to HTTP 400.
 */
class InvalidDateError extends Error {}

/** Adds whole days to a `YYYY-MM-DD` date using UTC arithmetic (DST-safe). */
function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildWhere(
  companyName: string,
  fechaInicio: string | null,
  fechaFin: string | null,
  codSed: string | null,
): string {
  // Escape single quotes, strip semicolons to prevent SQL injection
  const safe = companyName.replace(/'/g, "''").replace(/;/g, '');
  let where = `(NomCFa LIKE '%${safe}%' OR NomCom LIKE '%${safe}%')`;
  if (fechaInicio) {
    if (!isValidIsoDate(fechaInicio)) {
      throw new InvalidDateError('fechaInicio debe tener formato YYYY-MM-DD.');
    }
    where += ` AND FecAte >= CONVERT(datetime,'${fechaInicio} 00:00:00',120)`;
  }
  if (fechaFin) {
    if (!isValidIsoDate(fechaFin)) {
      throw new InvalidDateError('fechaFin debe tener formato YYYY-MM-DD.');
    }
    // Inclusive end: exclusive start of the following day.
    const nextDay = addDays(fechaFin, 1);
    where += ` AND FecAte < CONVERT(datetime,'${nextDay} 00:00:00',120)`;
  }
  // Safe by construction: codSed is validated against `^\d+$` in GET.
  if (codSed) {
    where += ` AND CodSed = ${codSed}`;
  }
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

    const fechaInicio = searchParams.get('fechaInicio') || null;
    const fechaFin = searchParams.get('fechaFin') || null;

    const rawCodSed = searchParams.get('codSed');
    let codSed: string | null = null;
    if (rawCodSed) {
      if (!/^\d+$/.test(rawCodSed)) {
        return NextResponse.json(
          { error: 'El parámetro codSed debe ser un entero válido.' },
          { status: 400 },
        );
      }
      codSed = rawCodSed;
    }

    // ---- Build sanitized WHERE clause ----
    const where = buildWhere(companyName, fechaInicio, fechaFin, codSed);

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
    // Invalid date params are client errors, not server failures.
    if (error instanceof InvalidDateError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

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

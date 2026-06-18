import { NextResponse } from 'next/server';
import mssql from 'mssql';
import { getPool } from '@/lib/db';
import { COD_SED } from '@/features/envio-resultados/infrastructure/informes/constants';
import type { InformeNoCerradoRow } from '@/types/informe';

/**
 * GET /api/informes/[idAten]/lookup?fecAte=dd/MM/yyyy
 *
 * Resolves the order metadata for a given `idAten` on a specific
 * attendance date. Drives `SP_SEL_INFORMESNOCERRADOS` with a WHERE
 * clause that scopes the lookup to the day of `fecAte` and the
 * configured `CodSed`.
 *
 * Status codes:
 * - 200: row found, returns `InformeNoCerradoRow`.
 * - 400: missing or non-digit `idAten`, missing or malformed `fecAte`.
 * - 404: SP returns zero rows for the (idAten, fecAte) pair.
 * - 500: unexpected error (DB unreachable, SP not found, etc.).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ idAten: string }> },
): Promise<NextResponse> {
  try {
    console.log('[GET] INICIO DE CONSULTA')
    const { idAten } = await params;
    const { searchParams } = new URL(request.url);
    const fecAte = searchParams.get('fecAte')?.trim() ?? '';
    console.log('[idAten]:', idAten, '[fecAte]:', fecAte);
    if (!/^\d+$/.test(idAten)) {
      console.log('ERROR EN idAten');
      return NextResponse.json(
        { code: 'VALIDATION_ERROR', message: 'idAten debe ser numérico.' },
        { status: 400 },
      );
    }
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(fecAte)) {
      console.log('ERROR EN fecAte');
      return NextResponse.json(
        { code: 'VALIDATION_ERROR', message: 'fecAte debe tener formato dd/MM/yyyy.' },
        { status: 400 },
      );
    }

    console.log('[lookup] Validation passed. idAten=%s fecAte=%s', idAten, fecAte);

    // Convert the operator-facing dd/MM/yyyy date into an ISO-8601
    // date (yyyy-MM-dd) before embedding it in the SP WHERE clause.
    // SQL Server's implicit conversion is locale-sensitive; dd/MM/yyyy
    // literals such as '17/06/2026' are parsed as MM/dd/yyyy on many
    // default configurations, producing an out-of-range datetime error.
    const [day, month, year] = fecAte.split('/');
    const isoDate = `${year}-${month}-${day}`;

    // The SP expects a single string that combines a WHERE clause
    // (using doubled single-quotes for literals) and a CodSed filter
    // baked in. Built defensively from the validated `fecAte` to
    // avoid any string interpolation on `idAten` — that one is
    // already digit-only and goes in as-is.
    const filter = `FecAte >= '${isoDate}' AND FecAte < DATEADD(DD,1,'${isoDate}') AND CodSed = '${COD_SED}' AND IdAten = ${idAten}`;
    const order = 'FecAte DESC';
    console.log('[lookup] SP filter: %s', filter);

    const pool = await getPool();
    await pool.connect();
    console.log('[lookup] Pool connected');

    const result = await pool
      .request()
      .input('WHERE', mssql.VarChar, filter)
      .input('ORDER', mssql.VarChar, order)
      .input('TipEva', mssql.Int, 4)
      .execute('SP_SEL_INFORMESNOCERRADOS');

    const rawRows = (result.recordset ?? []) as Array<Record<string, unknown>>;
    console.log('[lookup] SP returned %d row(s)', rawRows.length);
    if (rawRows.length === 0) {
      console.log('[lookup] 404 — no rows for idAten=%s fecAte=%s', idAten, fecAte);
      return NextResponse.json(
        {
          code: 'NOT_FOUND',
          message: `No se encontró la orden ${idAten} en ${fecAte}`,
        },
        { status: 404 },
      );
    }

    const row = rawRows[0];
    const normalized: InformeNoCerradoRow = {
      idAten: String(row['IdAten'] ?? idAten),
      codEmp: Number(row['CodEmp'] ?? 0),
      codSed: Number(row['CodSed'] ?? COD_SED),
      codTCl: Number(row['CodTCl'] ?? 0),
      numOrd: Number(row['NumOrd'] ?? 0),
      fecAte: String(row['FecAte'] ?? fecAte),
      codCli: row['CodCli'] === null || row['CodCli'] === undefined ? null : Number(row['CodCli']),
      codDCo: row['CodDCo'] === null || row['CodDCo'] === undefined ? null : Number(row['CodDCo']),
    };
    console.log('[lookup] Normalized row:', JSON.stringify(normalized));

    return NextResponse.json(normalized, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unexpected error';
    const stack = error instanceof Error ? error.stack : undefined;
    console.error('[api/informes/lookup] error:', message);
    if (stack) console.error('[api/informes/lookup] stack:', stack);
    return NextResponse.json(
      { code: 'INTERNAL_ERROR', message: 'Error al consultar la orden. Intente nuevamente.' },
      { status: 500 },
    );
  }
}

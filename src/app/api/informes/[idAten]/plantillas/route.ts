import { NextResponse } from 'next/server';
import mssql from 'mssql';
import { getPool } from '@/lib/db';
import type { PlantillasQuery, PlantillaRow } from '@/types/informe';

/**
 * GET /api/informes/[idAten]/plantillas?codCli=…&emiAfi=…&incExp=…&codDCo=…
 *
 * Lists the available exam templates for a given order via
 * `SP_SEL_PLANTILLAMEDICAXCLIENTE`. The SP signature is positional:
 *
 *   SP_SEL_PLANTILLAMEDICAXCLIENTE '<idAten>',<codCli>,<emiAfi>,<incExp>,<codDCo-or-NULL>
 *
 * The route is a thin pass-through: it validates the inputs, decodes
 * an absent/`null` `codDCo` to a typed JS `null` (bound as
 * `mssql.Int`, never the string `'NULL'`), and returns the SP rows
 * mapped to `PlantillaRow[]` ordered by `ordPri`.
 *
 * Status codes:
 * - 200: list of plantillas (possibly empty).
 * - 400: missing or non-digit `idAten` / `codCli`, or non-integer `emiAfi` / `incExp` / `codDCo`.
 * - 500: unexpected error.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ idAten: string }> },
): Promise<NextResponse> {
  try {
    const { idAten } = await params;
    const { searchParams } = new URL(request.url);
    const codCliRaw = searchParams.get('codCli') ?? '';
    const emiAfiRaw = searchParams.get('emiAfi') ?? '';
    const incExpRaw = searchParams.get('incExp') ?? '';
    const codDCoRaw = searchParams.get('codDCo') ?? '';

    if (!/^\d+$/.test(idAten)) {
      return NextResponse.json(
        { code: 'VALIDATION_ERROR', message: 'idAten debe ser numérico.' },
        { status: 400 },
      );
    }
    if (!/^\d+$/.test(codCliRaw)) {
      return NextResponse.json(
        { code: 'VALIDATION_ERROR', message: 'codCli debe ser numérico.' },
        { status: 400 },
      );
    }
    if (!/^\d+$/.test(emiAfiRaw)) {
      return NextResponse.json(
        { code: 'VALIDATION_ERROR', message: 'emiAfi debe ser numérico.' },
        { status: 400 },
      );
    }
    if (!/^\d+$/.test(incExpRaw)) {
      return NextResponse.json(
        { code: 'VALIDATION_ERROR', message: 'incExp debe ser numérico.' },
        { status: 400 },
      );
    }

    // `codDCo` is optional. Absent or the literal `null` decode to
    // SQL `NULL` — bound as `mssql.Int` with a JS `null` so the
    // driver sends a typed NULL. (The previous implementation
    // serialised the string `'NULL'` under `mssql.VarChar`, which
    // mis-typed the parameter and could 500 on orders without a
    // `CodDCo`.)
    let codDCo: number | null = null;
    if (codDCoRaw !== '' && codDCoRaw.toLowerCase() !== 'null') {
      if (!/^\d+$/.test(codDCoRaw)) {
        return NextResponse.json(
          { code: 'VALIDATION_ERROR', message: 'codDCo debe ser numérico o ausente.' },
          { status: 400 },
        );
      }
      codDCo = Number(codDCoRaw);
    }

    const pool = await getPool();
    await pool.connect();

    const spParams: PlantillasQuery = {
      idAten,
      codCli: Number(codCliRaw),
      emiAfi: Number(emiAfiRaw),
      incExp: Number(incExpRaw),
      codDCo,
    };

    const result = await pool
      .request()
      .input('IdAten', mssql.VarChar, spParams.idAten)
      .input('CodCli', mssql.Int, spParams.codCli)
      .input('EmiAfi', mssql.Int, spParams.emiAfi)
      .input('IncExp', mssql.Int, spParams.incExp)
      .input('CodDCo', mssql.Int, spParams.codDCo)
      .execute('SP_SEL_PLANTILLAMEDICAXCLIENTE');

    const rawRows = (result.recordset ?? []) as Array<Record<string, unknown>>;

    const plantillas: PlantillaRow[] = rawRows.map((row) => ({
      codPMe: Number(row['CodPMe'] ?? 0),
      arcPla: String(row['ArcPla'] ?? ''),
      ordPri: Number(row['OrdPri'] ?? 0),
      idePMe: Number(row['IdePMe'] ?? 0),
      ideFMe: row['IdeFMe'] === null || row['IdeFMe'] === undefined ? null : Number(row['IdeFMe']),
    }))

    plantillas.sort((a, b) => a.ordPri - b.ordPri);

    return NextResponse.json(plantillas, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unexpected error';
    console.error('[api/informes/plantillas] error:', message);
    return NextResponse.json(
      { code: 'INTERNAL_ERROR', message: 'Error al consultar las plantillas. Intente nuevamente.' },
      { status: 500 },
    );
  }
}

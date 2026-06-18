import { NextResponse } from 'next/server';
import mssql from 'mssql';
import { getPool } from '@/lib/db';
import type { PlantillaRow } from '@/types/informe';

/**
 * GET /api/informes/[idAten]/plantillas?codCli=…&emiAfi=…&incExp=…&codDCo=…
 *
 * Lists the available exam templates for a given order via
 * `SP_SEL_PLANTILLAMEDICAXCLIENTE`. The SP signature is positional:
 *
 *   SP_SEL_PLANTILLAMEDICAXCLIENTE '<idAten>',<codCli>,<emiAfi>,<incExp>,<codDCo-or-NULL>
 *
 * The route is a thin pass-through: it validates the inputs,
 * serialises `null` as the literal `NULL` for `codDCo`, and returns
 * the SP rows mapped to `PlantillaRow[]` ordered by `ordPri`.
 *
 * Status codes:
 * - 200: list of plantillas (possibly empty).
 * - 400: missing or non-digit `idAten` / `codCli`, or non-integer `emiAfi` / `incExp`.
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

    // `codDCo` is optional. When absent or the literal `null`, the
    // SP receives the string `NULL` instead of a numeric. The query
    // param contract is "omit the key OR send the literal string
    // `null`" — both decode to the same `null` payload.
    const codDCoLiteral =
      codDCoRaw === '' || codDCoRaw.toLowerCase() === 'null'
        ? 'NULL'
        : /^\d+$/.test(codDCoRaw)
          ? codDCoRaw
          : null;

    if (codDCoLiteral === null) {
      return NextResponse.json(
        { code: 'VALIDATION_ERROR', message: 'codDCo debe ser numérico o ausente.' },
        { status: 400 },
      );
    }

    const pool = await getPool();
    await pool.connect();

    const spParams = {
      IdAten: idAten,
      CodCli: Number(codCliRaw),
      EmiAfi: Number(emiAfiRaw),
      IncExp: Number(incExpRaw),
      CodDCo: codDCoLiteral,
    };

    // --- AQUÍ SE GENERA LA CONSULTA EN UNA SOLA LÍNEA ---
    const formatStr = (val: unknown) => (typeof val === 'string' ? `'${val}'` : val ?? 'NULL');

    const sqlInline = `EXEC SP_SEL_PLANTILLAMEDICAXCLIENTE ${formatStr(spParams.IdAten)}, ${spParams.CodCli}, ${spParams.EmiAfi}, ${spParams.IncExp}, ${formatStr(spParams.CodDCo)}`;

    console.log('--- CONSULTA SQL GENERADA ---');
    console.log(sqlInline);
    console.log('-----------------------------');

    const result = await pool
      .request()
      .input('IdAten', mssql.VarChar, spParams.IdAten)
      .input('CodCli', mssql.Int, spParams.CodCli)
      .input('EmiAfi', mssql.Int, spParams.EmiAfi)
      .input('IncExp', mssql.Int, spParams.IncExp)
      .input('CodDCo', mssql.VarChar, spParams.CodDCo)
      .execute('SP_SEL_PLANTILLAMEDICAXCLIENTE');

    const rawRows = (result.recordset ?? []) as Array<Record<string, unknown>>;
    console.table(rawRows);

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

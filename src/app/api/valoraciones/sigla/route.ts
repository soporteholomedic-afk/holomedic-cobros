import { NextResponse } from 'next/server';

import type { ValoracionesFilter } from '@/features/valoraciones/domain/entities';
import { getValoracionesDb } from '@/features/valoraciones/infrastructure/getValoracionesDb';

/**
 * GET /api/valoraciones/sigla
 *
 * Executes `SP_RPT_REPFACTURACION` through the SIGLA read-only pool with
 * the 11 REQ-03 §2 filters (validated here; the repository owns the typed
 * binds and the `00:00:00`/`23:59:59` period bounds).
 *
 * Query params:
 *  - fecIni, fecFin (required, YYYY-MM-DD, fecIni <= fecFin)
 *  - codMon (required, 1 = SOLES | 2 = DOLARES)
 *  - indFac (tri-state: 0 | 1 | null; DEFAULT 0 = No Facturados)
 *  - inFsta (boolean; true switches the date mode to FecSTA)
 *  - codCli, codCfa, codDes, codPac, codSed, tipTra (optional; absent or
 *    <= 0 are sent to the SP as NULL)
 *
 * Invalid input → 400 (Spanish, no SP call). SP/pool failures → 500 with
 * a user-safe message that never leaks SP names or internals.
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface ValidationError {
  error: string;
}

function isValidIsoDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/** Parse an optional numeric filter; absent/<=0 → undefined (NULL bind). */
function parseOptionalId(
  params: URLSearchParams,
  name: string,
  errors: string[],
): number | undefined {
  const raw = params.get(name);
  if (raw === null || raw.trim() === '') return undefined;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    errors.push(`"${name}" debe ser un número entero`);
    return undefined;
  }
  return parsed > 0 ? parsed : undefined;
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);

    // ---- Periodo (required) ----
    const fecIni = url.searchParams.get('fecIni') ?? '';
    const fecFin = url.searchParams.get('fecFin') ?? '';
    if (!isValidIsoDate(fecIni) || !isValidIsoDate(fecFin)) {
      return NextResponse.json(
        { error: '"fecIni" y "fecFin" son obligatorios con formato YYYY-MM-DD' } satisfies ValidationError,
        { status: 400 },
      );
    }
    if (fecIni > fecFin) {
      return NextResponse.json(
        { error: 'El período es inválido: "fecIni" no puede ser posterior a "fecFin"' } satisfies ValidationError,
        { status: 400 },
      );
    }

    // ---- Moneda (required, 1 | 2) ----
    const codMonRaw = url.searchParams.get('codMon') ?? '';
    if (codMonRaw !== '1' && codMonRaw !== '2') {
      return NextResponse.json(
        { error: '"codMon" es obligatorio y debe ser 1 (SOLES) o 2 (DOLARES)' } satisfies ValidationError,
        { status: 400 },
      );
    }
    const codMon = codMonRaw === '1' ? 1 : 2;

    // ---- IndFac tri-state (default 0 = No Facturados) ----
    const indFacRaw = (url.searchParams.get('indFac') ?? '0').trim().toLowerCase();
    let indFac: 0 | 1 | null;
    if (indFacRaw === '0') indFac = 0;
    else if (indFacRaw === '1') indFac = 1;
    else if (indFacRaw === 'null' || indFacRaw === 'todos') indFac = null;
    else {
      return NextResponse.json(
        { error: '"indFac" debe ser 0, 1 o null' } satisfies ValidationError,
        { status: 400 },
      );
    }

    // ---- InFsta boolean date-mode toggle ----
    const inFstaRaw = (url.searchParams.get('inFsta') ?? 'false').trim().toLowerCase();
    if (!['true', 'false', '1', '0'].includes(inFstaRaw)) {
      return NextResponse.json(
        { error: '"inFsta" debe ser true o false' } satisfies ValidationError,
        { status: 400 },
      );
    }
    const inFsta = inFstaRaw === 'true' || inFstaRaw === '1';

    // ---- Optional numeric filters ----
    const numericErrors: string[] = [];
    const codCli = parseOptionalId(url.searchParams, 'codCli', numericErrors);
    const codCfa = parseOptionalId(url.searchParams, 'codCfa', numericErrors);
    const codDes = parseOptionalId(url.searchParams, 'codDes', numericErrors);
    const codPac = parseOptionalId(url.searchParams, 'codPac', numericErrors);
    const codSed = parseOptionalId(url.searchParams, 'codSed', numericErrors);
    const tipTra = parseOptionalId(url.searchParams, 'tipTra', numericErrors);
    if (numericErrors.length > 0) {
      return NextResponse.json({ error: numericErrors.join('; ') } satisfies ValidationError, { status: 400 });
    }

    const filtro: ValoracionesFilter = {
      fecIni,
      fecFin,
      codMon,
      indFac,
      inFsta,
      codCli,
      codCfa,
      codDes,
      codPac,
      codSed,
      tipTra,
    };

    const repo = await getValoracionesDb();
    const resultados = await repo.buscarValoraciones(filtro);

    return NextResponse.json({ resultados });
  } catch (error) {
    // User-safe message — never expose raw DB errors, SP names or config.
    console.error('valoraciones sigla route error:', error);
    return NextResponse.json(
      { error: 'Error al consultar las valorizaciones. Intente nuevamente.' },
      { status: 500 },
    );
  }
}

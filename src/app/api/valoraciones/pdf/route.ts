import fs from 'fs';
import path from 'path';

import { NextResponse } from 'next/server';

import { EdgeUnavailableError } from '@/features/musculoesqueletica-pdf/domain/errors';
import { agruparPorDestino } from '@/features/valoraciones/domain/agrupacion';
import type { ValoracionesFilter } from '@/features/valoraciones/domain/entities';
import { getValoracionesDb } from '@/features/valoraciones/infrastructure/getValoracionesDb';
import {
  getValoracionesPdfPrinter,
} from '@/features/valoraciones/infrastructure/pdf/HtmlValoracionPdfPrinter';
import {
  MEMBRETE_HOLOMEDIC,
  buildValoracionHtml,
} from '@/features/valoraciones/infrastructure/pdf/template';

/**
 * POST /api/valoraciones/pdf (REQ-03 E-R1/E-R2, slice 2)
 *
 * Re-executes the SIGLA query from the posted filter DTO (design D4 —
 * tamper-proof: attachments regenerate from the source, never from
 * client-held rows), groups rows by destino with per-group SubTotal /
 * IGV 18% / Total, renders the membretado A4 HTML template and prints it
 * through the shared EdgePrinter port with footer page numbering
 * (spike-2.0 validated). All assets are data URIs — no network calls.
 *
 * Body: the `ValoracionesFilter` JSON (fecIni/fecFin/codMon required).
 * Edge unavailable → 502 (user-safe, no stack); other failures → 500.
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface ValidationError {
  error: string;
}

/** Parse + validate the JSON filter body; returns a 400 response on error. */
function parseFiltro(body: unknown): { filtro?: ValoracionesFilter; error?: NextResponse } {
  if (typeof body !== 'object' || body === null) {
    return { error: NextResponse.json({ error: 'Cuerpo de la solicitud inválido' } satisfies ValidationError, { status: 400 }) };
  }
  const raw = body as Record<string, unknown>;

  const fecIni = typeof raw.fecIni === 'string' ? raw.fecIni : '';
  const fecFin = typeof raw.fecFin === 'string' ? raw.fecFin : '';
  if (!DATE_PATTERN.test(fecIni) || !DATE_PATTERN.test(fecFin) || fecIni > fecFin) {
    return {
      error: NextResponse.json(
        { error: '"fecIni" y "fecFin" son obligatorios (YYYY-MM-DD) y fecIni no puede ser posterior a fecFin' } satisfies ValidationError,
        { status: 400 },
      ),
    };
  }

  if (raw.codMon !== 1 && raw.codMon !== 2) {
    return {
      error: NextResponse.json(
        { error: '"codMon" es obligatorio y debe ser 1 (SOLES) o 2 (DOLARES)' } satisfies ValidationError,
        { status: 400 },
      ),
    };
  }

  let indFac: 0 | 1 | null = 0;
  if (raw.indFac !== undefined) {
    if (raw.indFac === 0 || raw.indFac === 1 || raw.indFac === null) indFac = raw.indFac;
    else {
      return {
        error: NextResponse.json({ error: '"indFac" debe ser 0, 1 o null' } satisfies ValidationError, { status: 400 }),
      };
    }
  }

  if (raw.inFsta !== undefined && typeof raw.inFsta !== 'boolean') {
    return {
      error: NextResponse.json({ error: '"inFsta" debe ser true o false' } satisfies ValidationError, { status: 400 }),
    };
  }

  const idOpcional = (nombre: string): number | undefined => {
    const valor = raw[nombre];
    if (valor === undefined || valor === null) return undefined;
    return typeof valor === 'number' && Number.isInteger(valor) && valor > 0 ? valor : undefined;
  };

  return {
    filtro: {
      fecIni,
      fecFin,
      codMon: raw.codMon,
      indFac,
      inFsta: raw.inFsta === true,
      codCli: idOpcional('codCli'),
      codCfa: idOpcional('codCfa'),
      codDes: idOpcional('codDes'),
      codPac: idOpcional('codPac'),
      codSed: idOpcional('codSed'),
      tipTra: idOpcional('tipTra'),
    },
  };
}

let logoCache: string | null = null;

/**
 * Read the Holomedic logo as a base64 data URI (cached; empty string when
 * the asset is missing — the template degrades to a text-only membrete
 * instead of failing the whole export).
 */
function readLogoDataUri(): string {
  if (logoCache !== null) return logoCache;
  try {
    const logoPath = path.join(process.cwd(), 'public', 'logo-holomedic.png');
    logoCache = `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`;
  } catch {
    logoCache = '';
  }
  return logoCache;
}

/** `dd/MM/yyyy` emission date in local time (server TZ, es-PE context). */
function fechaEmisionHoy(): string {
  const ahora = new Date();
  const dd = String(ahora.getDate()).padStart(2, '0');
  const mm = String(ahora.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${ahora.getFullYear()}`;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body: unknown = await request.json().catch(() => null);
    const { filtro, error } = parseFiltro(body);
    if (error || !filtro) return error ?? NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 });

    // D4: re-execute the query from the posted filter — never trust rows.
    const repo = await getValoracionesDb();
    const rows = await repo.buscarValoraciones(filtro);

    // Client header: RUC lookup by codCli (OQ-3), name fallback from rows.
    let cliente: { nombre: string; ruc: string } | null = null;
    if (filtro.codCli !== undefined) {
      const lookup = await repo.buscarClientePorCodigo(filtro.codCli).catch(() => null);
      if (lookup) cliente = { nombre: lookup.nomCom, ruc: lookup.nroRuc ?? '' };
    }
    if (cliente === null && rows.length > 0) {
      cliente = { nombre: rows[0].NomCFa || rows[0].NomCli, ruc: '' };
    }

    const html = buildValoracionHtml({
      logoDataUri: readLogoDataUri(),
      membrete: MEMBRETE_HOLOMEDIC,
      cliente,
      fecIni: filtro.fecIni,
      fecFin: filtro.fecFin,
      moneda: filtro.codMon === 2 ? 'DOLARES' : 'SOLES',
      fechaEmision: fechaEmisionHoy(),
      grupos: agruparPorDestino(rows, filtro.codMon),
    });

    const printer = getValoracionesPdfPrinter();
    const pdf = await printer.print(html);

    const nombre = `valoraciones_${filtro.fecIni}_${filtro.fecFin}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="${nombre}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof EdgeUnavailableError) {
      // E-R2 scenario: user-safe 502, no stack/internals leakage.
      return NextResponse.json(
        { error: 'El generador de PDF no está disponible en este servidor. Contacte al administrador.' },
        { status: 502 },
      );
    }
    // User-safe message — never expose raw DB/browser errors.
    console.error('valoraciones pdf route error:', error);
    return NextResponse.json(
      { error: 'Error al generar el PDF. Intente nuevamente.' },
      { status: 500 },
    );
  }
}

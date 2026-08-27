import fs from 'fs';
import path from 'path';

import { agruparPorDestino } from '../../domain/agrupacion';
import type { ValoracionesFilter } from '../../domain/entities';
import type { ISiglaValoracionesRepository } from '../../domain/ports';
import { getValoracionesPdfPrinter } from './HtmlValoracionPdfPrinter';
import { MEMBRETE_HOLOMEDIC, buildValoracionHtml } from './template';

/**
 * Shared valoraciones PDF renderer (REQ-03 M-R1/M-R4, design D4).
 *
 * Both `/api/valoraciones/pdf` (download) and `/api/valoraciones/send`
 * (email attachment) MUST regenerate IDENTICAL bytes from the posted
 * filter — this function is that single truth. Re-queries the SP, groups
 * by destino, renders the membretado A4 HTML and prints it through the
 * shared printer (footer numbering via the factory default overrides).
 */

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

/**
 * Render the valorización PDF for a filter (D4: re-execute the query —
 * never trust client-held rows).
 *
 * @throws whatever the printer throws (`EdgeUnavailableError` when the
 *   browser binary is missing) — the caller maps to its user-safe
 *   response.
 */
export async function renderValoracionesPdf(
  repo: ISiglaValoracionesRepository,
  filtro: ValoracionesFilter,
): Promise<Uint8Array> {
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

  return getValoracionesPdfPrinter().print(html);
}

/**
 * Canonical attachment filename shared by the PDF download route and the
 * email attachment (`valoraciones_<fecIni>_<fecFin>.pdf`).
 */
export function nombrePdf(filtro: ValoracionesFilter): string {
  return `valoraciones_${filtro.fecIni}_${filtro.fecFin}.pdf`;
}

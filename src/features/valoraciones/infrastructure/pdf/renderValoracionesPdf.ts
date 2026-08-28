import fs from 'fs';
import path from 'path';

import { agruparPorDestino, nombreEmpresa } from '../../domain/agrupacion';
import type { ValoracionesFilter } from '../../domain/entities';
import type { ISiglaValoracionesRepository } from '../../domain/ports';
import { nombreArchivoExportacion } from '../filename';
import { getValoracionesPdfPrinter } from './HtmlValoracionPdfPrinter';
import { MEMBRETE_HOLOMEDIC, buildValoracionHtml } from './template';

/**
 * Shared valoraciones PDF renderer (REQ-03 M-R1/M-R4, design D4; per-empresa
 * scoping per the U6 user fix).
 *
 * Both `/api/valoraciones/pdf` (download) and `/api/valoraciones/send`
 * (email attachment) MUST regenerate IDENTICAL bytes from the posted
 * filter — this function is that single truth. Re-queries the SP (D4),
 * optionally scopes the rows to one empresa group key (U6: the per-row
 * export buttons act ONLY on their row's empresa), groups by destino,
 * renders the membretado A4 LANDSCAPE HTML and prints it through the
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
 * never trust client-held rows). When `empresa` is provided (U6 per-row
 * export), the re-queried rows are scoped in memory to that empresa group
 * key (`NomCFa` falling back to `NomCli` — `nombreEmpresa`).
 *
 * @throws whatever the printer throws (`EdgeUnavailableError` when the
 *   browser binary is missing) — the caller maps to its user-safe
 *   response.
 */
export async function renderValoracionesPdf(
  repo: ISiglaValoracionesRepository,
  filtro: ValoracionesFilter,
  empresa?: string,
): Promise<Uint8Array> {
  const todas = await repo.buscarValoraciones(filtro);
  const rows =
    empresa === undefined ? todas : todas.filter((row) => nombreEmpresa(row) === empresa);

  // Client header (U6): the scoped empresa name wins; otherwise the RUC
  // lookup by codCli (OQ-3), falling back to the first row's names.
  let rucCliente = '';
  let nombrePorLookup: string | null = null;
  if (filtro.codCli !== undefined) {
    const lookup = await repo.buscarClientePorCodigo(filtro.codCli).catch(() => null);
    if (lookup) {
      rucCliente = lookup.nroRuc ?? '';
      nombrePorLookup = lookup.nomCom;
    }
  }
  const nombreCliente =
    empresa ??
    nombrePorLookup ??
    (todas.length > 0 ? todas[0].NomCFa || todas[0].NomCli : null);
  const cliente =
    nombreCliente !== null && nombreCliente !== ''
      ? { nombre: nombreCliente, ruc: rucCliente }
      : null;

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
 * email attachment: `[NombreEmpresa]_[fecIni].pdf` for per-empresa exports
 * (U6), the legacy `valoraciones_<fecIni>_<fecFin>.pdf` otherwise.
 */
export function nombrePdf(filtro: ValoracionesFilter, empresa?: string): string {
  return nombreArchivoExportacion(empresa, filtro.fecIni, 'pdf', filtro.fecFin);
}

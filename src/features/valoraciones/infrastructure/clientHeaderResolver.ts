import fs from 'fs';
import path from 'path';

import type { ValoracionesFilter } from '../domain/entities';
import type { RepFacturacion } from '../domain/entities';
import type { ISiglaValoracionesRepository } from '../domain/ports';

/**
 * Shared client-header context for the valoraciones exports (change: flat
 * list with one grand-total block — design §1). Extracted verbatim from
 * `renderValoracionesPdf.ts` so the PDF and Excel adapters never import
 * each other: both consume this neutral infrastructure module.
 *
 * Exports:
 *  - `resolveClienteCabecera` — the U6/OQ-3 client fallback chain.
 *  - `fechaEmisionHoy` — `dd/MM/yyyy` emission date (server TZ).
 *  - `readLogoBuffer` — cached logo bytes (`null` when the asset is
 *    missing — branding must never fail an export).
 *  - `Membrete` / `MEMBRETE_HOLOMEDIC` — moved from `pdf/template.ts`
 *    (which re-exports them for its existing consumers).
 */

/** Institutional membrete data (RUC sourced from `paymentInfo.ts`). */
export interface Membrete {
  nombre: string;
  ruc: string;
  direccion?: string;
  telefono?: string;
}

export const MEMBRETE_HOLOMEDIC: Membrete = {
  nombre: 'HOLOMEDIC SERVICIOS INTEGRALES S.A.C.',
  ruc: '20556200328',
  // Address/phone are not yet sourced from a system of record — render
  // only when provided (ops can extend `Membrete` without template work).
};

let logoCache: Buffer | null = null;

/**
 * Read the Holomedic logo as raw PNG bytes (cached; `null` when the asset
 * is missing or unreadable — callers degrade to a logo-less export
 * instead of failing the whole report).
 */
export function readLogoBuffer(): Buffer | null {
  if (logoCache !== null) return logoCache;
  try {
    const logoPath = path.join(process.cwd(), 'public', 'logo-holomedic.png');
    logoCache = fs.readFileSync(logoPath);
  } catch {
    logoCache = null;
  }
  return logoCache;
}

/** `dd/MM/yyyy` emission date in local time (server TZ, es-PE context). */
export function fechaEmisionHoy(): string {
  const ahora = new Date();
  const dd = String(ahora.getDate()).padStart(2, '0');
  const mm = String(ahora.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${ahora.getFullYear()}`;
}

/**
 * Resolve the client header for an export (U6 per-empresa scoping +
 * OQ-3 RUC lookup). Chain (verbatim from the PDF renderer):
 * `empresa ?? lookup(codCli) ?? first row (NomCFa || NomCli)`. The RUC
 * comes from the lookup whenever it hits — even when the scoped empresa
 * supplies the name. A failed/rejected lookup degrades to `null` (never
 * throws); a missing name yields `null` and callers omit the client rows
 * (D3 — omit, never fake).
 */
export async function resolveClienteCabecera(
  repo: ISiglaValoracionesRepository,
  filtro: ValoracionesFilter,
  empresa: string | undefined,
  todas: readonly RepFacturacion[],
): Promise<{ nombre: string; ruc: string } | null> {
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
  return nombreCliente !== null && nombreCliente !== ''
    ? { nombre: nombreCliente, ruc: rucCliente }
    : null;
}

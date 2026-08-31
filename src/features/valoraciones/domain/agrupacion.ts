import type { CodigoMoneda, EmpresaGrupo, RepFacturacion } from './entities';

/** IGV percentage mirroring SIGLA's `ParametrosGen.ImpIgv`. */
export const IGV_PORCENTAJE = 18;

/** Round to two decimals (avoids classic 0.1 + 0.2 drift). */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Moneda-aware sale amount: `VVtaMN` for SOLES (1), `VVtaMO` for DOLARES (2). */
export function ventaPorMoneda(row: RepFacturacion, codMon: CodigoMoneda): number {
  return codMon === 2 ? row.VVtaMO : row.VVtaMN;
}

/** True when the moneda-aware sale value renders "0.00" (round2-based, A4). */
export function esVentaCero(row: RepFacturacion, codMon: CodigoMoneda): boolean {
  return round2(ventaPorMoneda(row, codMon)) === 0;
}

/** Moneda-aware taxable amount: `VImpMN` for SOLES (1), `VImpMO` for DOLARES (2). */
export function importePorMoneda(row: RepFacturacion, codMon: CodigoMoneda): number {
  return codMon === 2 ? row.VImpMO : row.VImpMN;
}

const SIN_EMPRESA = 'SIN EMPRESA';
const SIN_DESTINO = 'SIN DESTINO';

/**
 * Group key for a row: facturar-a (`NomCFa`) first, falling back to the
 * client name (`NomCli`) for particulares without a facturar-a, then a
 * placeholder. Mirrors the legacy CSV grouping by "facturar a".
 */
export function nombreEmpresa(row: RepFacturacion): string {
  const facturarA = row.NomCFa?.trim() ?? '';
  if (facturarA !== '') return facturarA;
  const cliente = row.NomCli?.trim() ?? '';
  return cliente !== '' ? cliente : SIN_EMPRESA;
}

/** Common moneda-aware totals over a group of rows (round2 everywhere). */
export interface GrupoTotales {
  rows: RepFacturacion[];
  cantidad: number;
  subtotal: number;
  igv: number;
  total: number;
  simbol: string;
}

export function totalesDe(rows: RepFacturacion[], codMon: CodigoMoneda): GrupoTotales {
  const subtotal = round2(rows.reduce((acc, row) => acc + ventaPorMoneda(row, codMon), 0));
  const igv = round2((subtotal * IGV_PORCENTAJE) / 100);
  return {
    rows,
    cantidad: rows.length,
    subtotal,
    igv,
    total: round2(subtotal + igv),
    simbol: rows[0]?.Simbol ?? '',
  };
}

/**
 * Group rows by facturar-a with moneda-aware totals. Pure: no IO, no
 * mutation of the input rows. Groups come out alphabetically sorted so
 * the table renders a stable order; rows keep their original relative
 * order inside each group.
 */
export function agruparPorEmpresa(
  rows: RepFacturacion[],
  codMon: CodigoMoneda,
): EmpresaGrupo[] {
  const groups = new Map<string, RepFacturacion[]>();

  for (const row of rows) {
    const key = nombreEmpresa(row);
    const existing = groups.get(key);
    if (existing) {
      existing.push(row);
    } else {
      groups.set(key, [row]);
    }
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'es'))
    .map(([empresa, groupRows]) => ({ empresa, ...totalesDe(groupRows, codMon) }));
}

/** A destino group (PDF export, spec E-R2): key + moneda-aware totals. */
export interface DestinoGrupo extends GrupoTotales {
  destino: string;
}

/**
 * Group rows by destino (`DesDes`) with moneda-aware totals — the PDF
 * export's grouping (spec E-R2). Pure; groups keep first-appearance
 * order; blank destinos collapse into `SIN DESTINO`.
 */
export function agruparPorDestino(
  rows: RepFacturacion[],
  codMon: CodigoMoneda,
): DestinoGrupo[] {
  const groups = new Map<string, RepFacturacion[]>();

  for (const row of rows) {
    const key = row.DesDes?.trim() || SIN_DESTINO;
    const existing = groups.get(key);
    if (existing) {
      existing.push(row);
    } else {
      groups.set(key, [row]);
    }
  }

  return [...groups.entries()].map(([destino, groupRows]) => ({
    destino,
    ...totalesDe(groupRows, codMon),
  }));
}

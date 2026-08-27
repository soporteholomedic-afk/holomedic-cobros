import { IGV_PORCENTAJE, round2 } from './agrupacion';

/**
 * Consolidado domain (REQ-03 Q-R6, slice 2) — a faithful port of SIGLA's
 * `RptFacturacionForm.ConsFacturacion` client-side adjustment (lines 144–291)
 * over `SP_RPT_CONSOLIDADOFACTURACION` + `SP_RPT_CONSOLIDADOFACTURACION_ADICIONALES`.
 *
 * All amounts are MN (soles): SIGLA's consolidado branch drops `@CodMon` and
 * its report tables only carry `VImpMN`/`VVtaMN`.
 */

/**
 * `Constante.CIdeTCh*` values (SIGLA `Entidad/Constante.cs` 2582–2592) —
 * they select the adjustment arithmetic per tipo de chequeo.
 */
export const IDE_TCH_PREOCUPACIONAL = 510001;
export const IDE_TCH_ADICIONALES = 510011;

/**
 * Row of `SP_RPT_CONSOLIDADOFACTURACION` (exact SP casing, verified against
 * the SIGLA reader `InformesD.ConsolidadoFacturacionD`).
 */
export interface ConsolidadoRow {
  CodCli: number;
  NomCom: string;
  CodDes: number | null;
  DesDes: string;
  IdeTCh: number | null;
  DesTCh: string;
  CanEva: number;
  VImpMN: number;
  VImpMO: number;
  VVtaMN: number;
  VVtaMO: number;
}

/**
 * Row of `SP_RPT_CONSOLIDADOFACTURACION_ADICIONALES` (reader
 * `InformesD.ConsolidadoFacturacionAdicionalesD`).
 */
export interface ConsolidadoAdicional {
  CodCli: number;
  NomCom: string;
  CodDes: number | null;
  DesDes: string;
  NomSer: string;
  CanEva: number;
  ValImp: number;
  ValVta: number;
}

/** Post-adjustment printable row (mirrors SIGLA's `ConsolidadoFacturacion` print list). */
export interface ConsolidadoFila {
  codCli: number;
  nomCom: string;
  codDes: number | null;
  desDes: string;
  desTCh: string;
  canEva: number;
  /** Adjusted `VImpMN`. */
  importe: number;
  /** Adjusted `VVtaMN` — the base for per-destino SubTotal. */
  venta: number;
}

/** Per-destino totals row (mirrors SIGLA's `ConsolidadoFacturacionTotales` table). */
export interface DestinoTotal {
  nomCom: string;
  desDes: string;
  codDes: number;
  subtotal: number;
  igv: number;
  total: number;
}

/**
 * SIGLA destino match: `t.CodDes == iCodDes` on `int?` treats `null == null`
 * as a match — mirrored here with strict equality over `number | null`.
 */
function mismoDestino(a: number | null, b: number | null): boolean {
  return a === b;
}

/**
 * Apply the Adicionales adjustment and append the adicionales as printable
 * rows, exactly like SIGLA `RptFacturacionForm.cs` lines 151–207:
 *
 *  - start from `round2` of the main row's `VVtaMN`/`VImpMN`;
 *  - for every adicional sharing the destino:
 *      - preocupacional → `venta -= ValVta` (accumulates);
 *      - adicionales    → `venta = round2(VVtaMN original) - ValVta`
 *        (REPLACED from the original on each adicional);
 *      - always `importe -= ValImp` (accumulates);
 *  - adjusted mains come out rounded to 2 decimals (SIGLA rounds at the
 *    DataTable write; we round at the fila so display and totals share one
 *    canonical value — sub-cent identical for 2-decimal currency data);
 *  - then every adicional is appended as its own row (`NomSer` as
 *    description, `ValVta`/`ValImp` as amounts).
 *
 * Pure: inputs are never mutated.
 */
export function aplicarAjusteAdicionales(
  principales: readonly ConsolidadoRow[],
  adicionales: readonly ConsolidadoAdicional[],
): ConsolidadoFila[] {
  const filas: ConsolidadoFila[] = [];

  for (const principal of principales) {
    let venta = round2(principal.VVtaMN);
    let importe = round2(principal.VImpMN);

    for (const adicional of adicionales) {
      if (!mismoDestino(adicional.CodDes, principal.CodDes)) continue;
      switch (principal.IdeTCh) {
        case IDE_TCH_PREOCUPACIONAL:
          venta -= adicional.ValVta;
          break;
        case IDE_TCH_ADICIONALES:
          venta = round2(principal.VVtaMN) - adicional.ValVta;
          break;
        default:
          break;
      }
      importe -= adicional.ValImp;
    }

    filas.push({
      codCli: principal.CodCli,
      nomCom: principal.NomCom,
      codDes: principal.CodDes,
      desDes: principal.DesDes,
      desTCh: principal.DesTCh,
      canEva: principal.CanEva,
      importe: round2(importe),
      venta: round2(venta),
    });
  }

  for (const adicional of adicionales) {
    filas.push({
      codCli: adicional.CodCli,
      nomCom: adicional.NomCom,
      codDes: adicional.CodDes,
      desDes: adicional.DesDes,
      desTCh: adicional.NomSer,
      canEva: adicional.CanEva,
      importe: round2(adicional.ValImp),
      venta: round2(adicional.ValVta),
    });
  }

  return filas;
}

/**
 * Per-destino SubTotal (Σ venta, round2), IGV 18%, Total — mirroring SIGLA
 * lines 242–262. Only destinos present in the adjusted rows produce totals
 * (SIGLA matches against the client's destino list; rows with a NULL destino
 * never match and are excluded). Group order: first appearance in `filas`.
 * `nomCom`/`desDes` come from the group's rows (SIGLA's loop ends on the last
 * row's values; groups share both in practice — we take the first).
 */
export function consolidarPorDestino(filas: readonly ConsolidadoFila[]): DestinoTotal[] {
  const grupos = new Map<number, ConsolidadoFila[]>();
  for (const fila of filas) {
    if (fila.codDes === null) continue; // SIGLA destino list never contains NULL
    const existing = grupos.get(fila.codDes);
    if (existing) existing.push(fila);
    else grupos.set(fila.codDes, [fila]);
  }

  const totales: DestinoTotal[] = [];
  for (const [codDes, groupRows] of grupos) {
    const subtotal = round2(groupRows.reduce((acc, fila) => acc + fila.venta, 0));
    const igv = round2((subtotal * IGV_PORCENTAJE) / 100);
    totales.push({
      nomCom: groupRows[0].nomCom,
      desDes: groupRows[0].desDes,
      codDes,
      subtotal,
      igv,
      total: round2(subtotal + igv),
    });
  }
  return totales;
}

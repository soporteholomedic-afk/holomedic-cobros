import type { OrderRow, SpResultRow } from '@/types/sp-result';
import { normalizeDni } from '@/lib/normalize-dni';

/**
 * Normalize a raw attendance date for comparison.
 *
 * Accepts either the canonical `dd/MM/yyyy` shape (returned as-is) or an
 * ISO date string (converted to `dd/MM/yyyy` using UTC parts). Anything
 * unparseable becomes `''` so it can never false-positive a match.
 * Mirrors the normalization the UI previously inlined in the `/consolidados`
 * handler so order matching compares like-for-like.
 */
export function normalizeFecAte(raw: string | undefined): string {
  if (!raw) return '';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Return a comparable key for a raw `NumOrd`, or `undefined` when the value
 * is absent or blank. `number | string | null` mirrors the wire shape raw
 * SQL/JSON may produce even though the interfaces declare `number | string`.
 *
 * Exported so the NumOrd-based ficha matcher (`buildUnifiedFichas`) compares
 * keys exactly like this resolver — a single normalization for every NumOrd
 * correlation in the feature (trim, blank/absent → `undefined`).
 */
export function numOrdKey(value: number | string | null | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

/**
 * Resolve the exact order behind a consolidated results row.
 *
 * Matching precedence:
 *  1. Explicit `NumOrd` — the row's order number wins. An explicit but
 *     unmatched `NumOrd` returns `undefined`: opening a different order
 *     (via DNI/date fallback) would show the wrong patient's files.
 *  2. Legacy rows without `NumOrd` — DNI + `FecAte`, then DNI only,
 *     preserving the previous `/consolidados` fallback behavior.
 */
export function resolveMatchingOrder(
  orders: readonly OrderRow[],
  row: Pick<SpResultRow, 'NroDId' | 'FecAte' | 'NumOrd'>,
): OrderRow | undefined {
  const rowNumOrd = numOrdKey(row.NumOrd);
  if (rowNumOrd !== undefined) {
    return orders.find((order) => numOrdKey(order.NumOrd) === rowNumOrd);
  }

  const normalizedDni = normalizeDni(row.NroDId);
  const normalizedFec = normalizeFecAte(row.FecAte);

  const byDniAndDate = orders.find(
    (order) =>
      normalizeDni(order.NroDId) === normalizedDni &&
      normalizeFecAte(order.FecAte) === normalizedFec,
  );
  if (byDniAndDate) return byDniAndDate;

  return orders.find((order) => normalizeDni(order.NroDId) === normalizedDni);
}

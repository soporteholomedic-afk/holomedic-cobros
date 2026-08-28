/**
 * Presentation formatting helpers for the valoraciones UI (REQ-03).
 *
 * Amounts render with two decimals (es-PE); dates render `dd/MM/yyyy`
 * per the domain contract (ISO-8601 at the boundary, display format in
 * the UI).
 */

const MONTO_FORMATTER = new Intl.NumberFormat('es-PE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format an amount with two decimals (`1234.5` → `1,234.50`). */
export function formatMonto(value: number): string {
  return MONTO_FORMATTER.format(value);
}

/** Render an ISO date (`YYYY-MM-DD` or ISO datetime) as `dd/MM/yyyy`. */
export function formatFechaDisplay(iso: string | null): string {
  if (!iso) return '';
  const [datePart] = iso.split('T');
  const [y, m, d] = datePart.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/** Today's LOCAL date as `YYYY-MM-DD` (the periodo default). */
export function hoyIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

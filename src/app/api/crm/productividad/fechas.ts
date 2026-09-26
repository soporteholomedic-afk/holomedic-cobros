/**
 * Shared period validation for the `/api/crm/productividad` routes
 * (JSON read pr16 + Excel export pr17). ONE source for the date
 * contract — both endpoints must accept exactly the same windows.
 */

const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Strict 'YYYY-MM-DD' shape + real calendar validity (regex alone
 * would accept 2026-02-31). Dates are naive America/Lima wall-clock
 * strings end to end (ADR-9); no timezone conversion anywhere.
 */
export function esFechaValida(valor: string): boolean {
  if (!REGEX_FECHA.test(valor)) return false;
  const [anio, mes, dia] = valor.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio ?? 0, (mes ?? 1) - 1, dia ?? 1));
  return (
    fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === (mes ?? 0) - 1 && fecha.getUTCDate() === dia
  );
}

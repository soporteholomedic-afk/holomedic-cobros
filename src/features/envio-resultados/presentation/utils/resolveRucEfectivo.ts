/**
 * Derive the effective RUC for a patient ficha.
 *
 * Company patients have a real 11-digit `nroRuc` on the ficha. "Cliente
 * particular" patients reuse their DNI as RUC, and `SP_SEL_ORDEN`
 * surfaces the missing RUC as the string `"null"` (or an empty value)
 * on `UnifiedFicha.nroRuc`. The LAN share stores those patients under
 * `sigla\<dni>\<dni>\<idAten>\<LEGAJOS>`, so the effective RUC must
 * fall back to the person's DNI or every file request resolves to a
 * path that does not exist.
 *
 * Garbage values (`null`, `undefined`, `"null"`, `"undefined"`,
 * whitespace) fall back to `dni`. Any other non-empty value wins.
 */
export function resolveRucEfectivo(
  nroRuc: string | null | undefined,
  dni: string,
): string {
  const trimmed = (nroRuc ?? '').trim();
  if (
    trimmed === '' ||
    trimmed.toLowerCase() === 'null' ||
    trimmed.toLowerCase() === 'undefined'
  ) {
    return dni;
  }
  return trimmed;
}
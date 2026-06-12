/**
 * Normalizes a raw DNI string by stripping ALL non-numeric characters.
 *
 * Handles the "DNI " prefix commonly found in SP_RPT_MATRIZICCGSA output
 * as well as any other formatting (dots, dashes, colons, whitespace).
 *
 * STRICT mode: only digits survive. If the result is empty, the input
 * contained no digits.
 *
 * @param raw - Raw DNI string from either SpResultRow.NroDId or OrderRow.NroDId
 * @returns Normalized DNI string containing only digits (0-9)
 */
export function normalizeDni(raw: string): string {
  return raw.replace(/\D/g, '');
}

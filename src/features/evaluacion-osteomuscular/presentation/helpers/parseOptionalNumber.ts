/**
 * Parses an optional numeric input from a form control.
 * Empty, whitespace-only, or non-numeric values become `null` so invalid
 * text can never become a valid numeric state.
 */
export function parseOptionalNumber(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

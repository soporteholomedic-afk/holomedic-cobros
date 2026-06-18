/**
 * Date helpers for query-string params used by the `/consolidados` views.
 *
 * The page reads `fechaInicio` / `fechaFin` from the URL on mount and
 * keeps them in local state; both views (PatientsList and CompanySelector)
 * receive them as props.
 *
 * Spec: R-PG-2 (date filter lifted to page.tsx).
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Return today's date in `YYYY-MM-DD` using the local timezone.
 * Mirrors the previous `CompanySelector.getLocalDateString` helper so
 * existing tests that depend on the value continue to match.
 */
export function getLocalDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse a single date param from the URL. Returns `fallback` when the
 * value is null, malformed, or doesn't match the `YYYY-MM-DD` shape.
 */
export function parseDateParam(value: string | null, fallback: string): string {
  if (value === null) return fallback;
  return DATE_PATTERN.test(value) ? value : fallback;
}

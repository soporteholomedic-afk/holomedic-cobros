/**
 * Transient Windows auth-error matcher for the PDF CLI.
 *
 * The .NET CLI sporadically fails with a Windows domain-controller auth
 * error surfaced by Crystal Reports. Step-1 verification (#243) proved
 * the failure is intermittent — re-running the CLI on the same args
 * usually succeeds. The route uses this matcher to decide whether a
 * manifest `failed` row should trigger a retry.
 *
 * Why substring (not regex): the full Windows error message includes a
 * trailing "Inténtelo de nuevo más tarde." whose exact punctuation
 * (\r\n, spacing) can vary across Windows locales and updates. Matching
 * on the STABLE leading clause — "El sistema no puede ponerse en
 * contacto con un controlador de dominio" — is resilient to that
 * trailing drift. A regex would add complexity without materially
 * improving robustness; if Microsoft rewrites the leading clause itself,
 * neither approach would catch it, and the `console.warn` log in the
 * route surfaces the actual `reason` so ops can detect a rephrase and
 * update the constant.
 *
 * The match is intentionally CASE-SENSITIVE. A future Windows rephrase
 * that changes capitalisation should NOT be silently masked — it is
 * better for the matcher to become a no-op (and the bug to surface as
 * `summary.failed >= 1` without retry) than to retry on a message we
 * have not validated.
 */

/**
 * The stable leading clause of the Windows domain-controller auth
 * error. Option A (user-approved per #246): literal substring match on
 * this exact Spanish text.
 */
export const TRANSIENT_AUTH_ERROR_CLAUSE =
  'El sistema no puede ponerse en contacto con un controlador de dominio';

/**
 * Pure function: returns `true` iff `reason` is a non-empty string
 * containing {@link TRANSIENT_AUTH_ERROR_CLAUSE} as a case-sensitive
 * substring. Returns `false` for `null`, `undefined`, the empty string,
 * and any string that does not contain the clause. No side effects.
 */
export function isTransientAuthError(reason: string | null | undefined): boolean {
  return reason != null && reason.length > 0 && reason.includes(TRANSIENT_AUTH_ERROR_CLAUSE);
}

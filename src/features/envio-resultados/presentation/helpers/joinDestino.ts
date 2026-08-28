/**
 * `joinDestino` composes the email-level `destino` for the wizard
 * handoff (REQ-105, design D5).
 *
 * The joined value describes the proyectos of the refs ACTUALLY
 * INCLUDED in the send — not the first patient's scalar. Rules:
 *
 *  - Only trimmed non-empty `proyecto` values participate.
 *  - Duplicates collapse to the FIRST appearance (insertion order of
 *    `refs`, which is the bridge's ficha order — the stable
 *    first-appearance order the pipeline relies on).
 *  - The survivors join with `", "`.
 *  - The result caps at 200 chars (the history column is
 *    NVARCHAR(200), migrate.ts): overflow truncates to 197 chars +
 *    `'...'` (exactly 200 chars, S-105.3).
 *  - When NO ref carries a proyecto (legacy Ver Archivos flow,
 *    all-empty stamps), the request-level fallback — today's
 *    derivation — is returned unchanged (S-105.2 holds for
 *    single-proyecto sends: the bare proyecto is identical to
 *    today's value).
 *
 * Pure — no I/O, no React. Tested in `__tests__/joinDestino.test.ts`.
 */
const DESTINO_MAX_LENGTH = 200;

/** Length of the `'...'` ellipsis appended on overflow. */
const ELLIPSIS_LENGTH = 3;

export function joinDestino(
  refs: ReadonlyArray<{ proyecto?: string }>,
  fallback: string,
): string {
  const seen = new Set<string>();
  for (const ref of refs) {
    const proyecto = ref.proyecto?.trim();
    if (proyecto) seen.add(proyecto);
  }
  if (seen.size === 0) return fallback;

  const joined = Array.from(seen).join(', ');
  if (joined.length <= DESTINO_MAX_LENGTH) return joined;
  return joined.slice(0, DESTINO_MAX_LENGTH - ELLIPSIS_LENGTH) + '...';
}

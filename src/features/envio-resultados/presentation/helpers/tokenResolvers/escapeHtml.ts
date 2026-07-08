/**
 * Minimal HTML-escaping for names that could contain `<`, `>`, `&`, `"`.
 *
 * Mirrors the old `interpolateSpitch` behaviour verbatim. The same
 * function is used by the simple-token path (`listaPacientes`,
 * `listaArchivos`) and the new table sub-resolvers.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Legacy-signature strip helper (editor-firmas PR4, task 4.4).
 *
 * The client-side signature builder (structured entity, hardcoded
 * defaults, session-seeding mapper and HTML builder) is REMOVED: the
 * signature is now composed SERVER-SIDE from each user's stored fields
 * (firma-correo feature, GET /api/plantillas/firma) and interpolated
 * inline at `{{firma}}` by the token resolver.
 *
 * What survives is the sentinel + strip pair (historial-envios-
 * consolidados D8): rows sent by the LEGACY path persisted their body
 * WITH the appended sentinel-wrapped signature, and the reenvío editor
 * must never resurface it when seeding.
 */

/**
 * Sentinel pair that wrapped the legacy built signature. HTML comments
 * are invisible in every renderer that consumes this markup.
 */
const SIGNATURE_SENTINEL = '<!--holomedic-firma-->';

/**
 * Remove the sentinel-wrapped signature block from a persisted body.
 * Exact (no regex over HTML): everything from the first sentinel to the
 * second is dropped; content before and after is preserved verbatim.
 * Defensive on malformed input — a lone sentinel strips to its start;
 * input without sentinels is returned unchanged.
 */
export function stripSignatureHtml(html: string): string {
  const start = html.indexOf(SIGNATURE_SENTINEL);
  if (start < 0) return html;
  const end = html.indexOf(SIGNATURE_SENTINEL, start + SIGNATURE_SENTINEL.length);
  if (end < 0) return html.slice(0, start);
  return html.slice(0, start) + html.slice(end + SIGNATURE_SENTINEL.length);
}

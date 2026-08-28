/**
 * Marker-replacement recovery for the deferred-firma race.
 *
 * `useFirmaCorreo()` fetches the server-composed signature on mount
 * while `SpitchSelector` auto-selects the first template as soon as the
 * list arrives. When the template wins the race, interpolation runs
 * with `firma: ''` and the token resolver bakes the visible
 * `[Falta configurar firma]` fallback INTO the body. This helper swaps
 * every baked fallback for the real firma html once it lands.
 *
 * Deliberately dumb and pure:
 *  - string split/join replacement — NEVER re-interpolates, which would
 *    clobber operator edits made in the visual editor;
 *  - a body without the marker (operator edited/removed it, or the
 *    template has no `{{firma}}`) is returned untouched;
 *  - an empty `firmaHtml` (no saved signature / fetch error) returns
 *    the body untouched so the spec fallback stays visible.
 */
import { FIRMA_FALLBACK_HTML } from '@/features/envio-resultados/presentation/helpers/tokenResolvers/buildTokenResolverRegistry';

/**
 * Replace ALL `FIRMA_FALLBACK_HTML` occurrences in `bodyHtml` with
 * `firmaHtml`. Returns `bodyHtml` unchanged when `firmaHtml` is empty
 * or the marker is not present.
 */
export function replaceFirmaFallback(bodyHtml: string, firmaHtml: string): string {
  if (firmaHtml === '' || !bodyHtml.includes(FIRMA_FALLBACK_HTML)) {
    return bodyHtml;
  }
  return bodyHtml.split(FIRMA_FALLBACK_HTML).join(firmaHtml);
}

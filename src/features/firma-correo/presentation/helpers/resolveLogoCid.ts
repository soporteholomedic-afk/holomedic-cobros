import { FIRMA_LOGO_CID } from '../../domain/composeSignatureHtml';

/** Browser-served path of the signature logo (`public/logo-holomedic.png`). */
const LOGO_PUBLIC_PATH = '/logo-holomedic.png';

/**
 * Replace the signature logo's Content-ID reference with the public
 * asset path, for DISPLAY ONLY. Browser previews cannot resolve smtp
 * `cid:` references (the logo only exists as a transport attachment),
 * so `FirmaForm` and the shared `EmailPreviewPanel` swap the cid for
 * the public path right before rendering.
 *
 * This helper is NEVER applied to stored or sent HTML: the delivered
 * body keeps `cid:holomedic-logo` so `sendEmail` attaches the PNG and
 * mail clients resolve it.
 *
 * PURE and total: no cid → the input string comes back unchanged.
 */
export function resolveLogoCid(html: string): string {
  return html.split(FIRMA_LOGO_CID).join(LOGO_PUBLIC_PATH);
}

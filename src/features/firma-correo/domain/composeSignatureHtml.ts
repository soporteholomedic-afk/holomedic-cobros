import type { FirmaCorreo } from './entities';

/** Content-ID reference of the embedded signature logo. The composer
 *  emits it as the `<img src>`; `sendEmail` detects it in the body and
 *  auto-attaches the PNG from `public/logo-holomedic.png`. */
export const FIRMA_LOGO_CID = 'cid:holomedic-logo';

/** FIXED company landline shown on EVERY signature (never user-editable). */
export const FIRMA_TELEFONO_FIJO = '480-0217';

/** FIXED company address shown on EVERY signature. NOTE: the separator
 *  in "Sauces – Surquillo" is an EN DASH (U+2013) — keep it byte-exact. */
export const FIRMA_DIRECCION =
  'Pasaje La India 169, Urb. Los Sauces – Surquillo (Altura de 9 y 10 de la Av. Villarán)';

/**
 * HTML-escape the five characters that are significant inside text
 * nodes AND attribute values. LOCAL on purpose (signatureData.ts
 * precedent): the domain must not import another feature's
 * presentation helpers.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Compose the email-safe HTML signature block from a VALIDATED firma.
 * PURE and deterministic: the send path (server-side API) and the
 * form's live preview import this same function, so preview and
 * delivered body are byte-identical.
 *
 * Layout (user-specified redesign): two-column nested `<table>` with
 * inline styles ONLY (Gmail/Outlook compatible — no flex, no grid, no
 * classes): LEFT cell holds the logo (`cid:holomedic-logo`, resolved
 * by the mail transport to the embedded attachment; previews swap it
 * via `resolveLogoCid`), RIGHT cell holds one row per line —
 * nombre+área, correo (plain text), Móvil (optional), the FIXED
 * company phone (+ Anexo when set) and the FIXED address. A subtle
 * `<hr>` separator closes the block BELOW the table.
 *
 * Safety contract: every user value passes through `escapeHtml`, so
 * stored markup like `<b>X</b>` renders as text and attribute breakout
 * is impossible. Only the fixed structural markup below is emitted
 * verbatim.
 */
export function composeSignatureHtml(firma: FirmaCorreo): string {
  const nombre = escapeHtml(firma.nombre);
  const area = escapeHtml(firma.area);
  const correo = escapeHtml(firma.correo);

  // Optional Móvil row: omitted ENTIRELY when telefono is empty.
  const movilLine =
    firma.telefono !== ''
      ? `\n      <div style="margin-bottom: 2px; font-family: Arial, sans-serif;">Móvil: ${escapeHtml(firma.telefono)}</div>`
      : '';

  // Anexo is appended to the FIXED phone row only when non-empty.
  const anexoSuffix =
    firma.anexo !== '' ? ` Anexo: ${escapeHtml(firma.anexo)}` : '';

  return `<table cellpadding="0" cellspacing="0" style="border-collapse: collapse; font-family: Arial, sans-serif; font-size: 12px; color: rgb(51, 51, 51); line-height: 1.5; margin-top: 15px;">
  <tr>
    <td valign="top" style="padding-right: 16px;">
      <img src="${FIRMA_LOGO_CID}" alt="Holomedic" width="120" style="display: block; border: 0;" />
    </td>
    <td valign="top" style="padding-top: 2px;">
      <div style="margin-bottom: 2px; font-family: Arial, sans-serif;"><strong>${nombre}</strong> | Área ${area}</div>
      <div style="margin-bottom: 2px; font-family: Arial, sans-serif;">${correo}</div>${movilLine}
      <div style="margin-bottom: 2px; font-family: Arial, sans-serif;">Telef. ${FIRMA_TELEFONO_FIJO}${anexoSuffix}</div>
      <div style="font-family: Arial, sans-serif;">${FIRMA_DIRECCION}</div>
    </td>
  </tr>
</table>
<hr style="border: 0; border-top: 1px solid rgb(221, 221, 221); margin: 10px 0 0 0;" />`;
}

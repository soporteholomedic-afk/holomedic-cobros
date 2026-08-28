import type { FirmaCorreo } from './entities';

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
 * Compose the email-safe HTML signature block from a VALIDATED firma
 * (editor-firmas task 1.4). PURE and deterministic: the send path
 * (server-side API) and the form's live preview import this same
 * function, so preview and delivered body are byte-identical.
 *
 * Safety contract: every user value passes through `escapeHtml`
 * (text nodes and the mailto href), so stored markup like
 * `<b>X</b>` renders as text and attribute breakout is impossible.
 * Only the fixed structural markup below is emitted verbatim.
 *
 * Email-client compatibility: `<table>` layout with inline styles
 * only — no classes, no flexbox, no external assets.
 */
export function composeSignatureHtml(firma: FirmaCorreo): string {
  const nombre = escapeHtml(firma.nombre);
  const area = escapeHtml(firma.area);
  const correo = escapeHtml(firma.correo);

  // Optional contact line: omitted ENTIRELY when both fields are
  // empty; single-segment lines drop the separator.
  const contactoSegments: string[] = [];
  if (firma.telefono !== '') contactoSegments.push(`Tel: ${escapeHtml(firma.telefono)}`);
  if (firma.anexo !== '') contactoSegments.push(`Anexo: ${escapeHtml(firma.anexo)}`);
  const contactoLine =
    contactoSegments.length > 0
      ? `\n      <div style="color: rgb(51, 51, 51); margin-bottom: 2px; font-family: Arial, sans-serif;">${contactoSegments.join(' · ')}</div>`
      : '';

  return `<table cellpadding="0" cellspacing="0" style="border-collapse: collapse; font-family: Arial, sans-serif; font-size: 12px; color: rgb(51, 51, 51); line-height: 1.5; margin-top: 15px;">
  <tr>
    <td valign="top" style="border-left: 2px solid rgb(0, 86, 179); padding-left: 20px; padding-top: 2px; padding-bottom: 2px;">
      <div style="font-size: 14px; font-weight: bold; color: rgb(0, 0, 0); margin-bottom: 4px; font-family: Arial, sans-serif;">${nombre}</div>
      <div style="color: rgb(51, 51, 51); margin-bottom: 4px; font-family: Arial, sans-serif;">${area}</div>
      <div style="margin-bottom: 2px; font-family: Arial, sans-serif;"><a href="mailto:${correo}" style="color: rgb(0, 86, 179); text-decoration: underline;">${correo}</a></div>${contactoLine}
    </td>
  </tr>
</table>`;
}

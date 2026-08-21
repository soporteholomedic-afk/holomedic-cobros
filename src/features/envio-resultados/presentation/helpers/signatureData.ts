export interface SignatureData {
  name: string;
  role: string;
  email: string;
  phone: string;
  phoneAlt: string;
  address: string;
}

export const DEFAULT_SIGNATURE_DATA: SignatureData = {
  name: 'Blanca Chirinos',
  role: 'Área Consolidados',
  email: 'consolidados@holomedic.com.pe',
  phone: '(051) 989211757',
  phoneAlt: '480-0217 Anexo: 303',
  address: 'Pasaje La India 169, Urb. Los Sauces – Surquillo (Altura de 9 y 10 de la Av. Villarán)',
};

/**
 * Structural slice of the authenticated user needed to seed a
 * signature (usuarios-nombre-firma). Defined LOCALLY on purpose so
 * envio-resultados never imports auth internals — the editor wires
 * the session user into this shape.
 */
export interface SignatureUser {
  nombre?: string | null;
  usuario?: string | null;
}

/**
 * Session-seeded signature (single mapper, the ONLY extension point):
 * wires `nombre → name` with the fallback chain
 * `nombre → usuario → DEFAULT_SIGNATURE_DATA.name`. Role, email,
 * phone, phoneAlt and address stay at their defaults — future fields
 * are added here (plus their DB columns), never in the editor.
 *
 * Returns a fresh mutable object: mutating the result never affects
 * `DEFAULT_SIGNATURE_DATA`.
 */
export function buildSignatureDataFromUser(user: SignatureUser | null): SignatureData {
  const nombre = user?.nombre?.trim();
  const usuario = user?.usuario?.trim();
  const name = nombre || usuario || DEFAULT_SIGNATURE_DATA.name;
  return { ...DEFAULT_SIGNATURE_DATA, name };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Sentinel pair wrapping the built signature (historial-envios-consolidados
 * D8). The persisted history `bodyHtml` is the dispatched `body + signature`,
 * so reenvío seeding strips the signature through `stripSignatureHtml` before
 * the editor re-appends it — the signature is never duplicated on re-send.
 * HTML comments are invisible in every renderer that consumes this markup.
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

export function buildSignatureHtml(data: SignatureData): string {
  const name = escapeHtml(data.name);
  const role = escapeHtml(data.role);
  const email = escapeHtml(data.email);
  const phone = escapeHtml(data.phone);
  const phoneAlt = escapeHtml(data.phoneAlt);
  const address = escapeHtml(data.address);

  return `${SIGNATURE_SENTINEL}<table cellpadding="0" cellspacing="0" style="border-collapse: collapse; font-family: Arial, sans-serif; font-size: 12px; color: rgb(51, 51, 51); line-height: 1.5; margin-top: 15px;">
  <tr>
    <td valign="middle" style="padding-right: 20px; text-align: center; width: 160px;">
      <img src="https://holomedic.com.pe/w2/wp-content/uploads/2023/06/logo.png" alt="Holomedic" style="display: block; width: 140px; height: auto; margin: 0 auto 8px auto;" />
      <a href="https://www.holomedic.com.pe" target="_blank" style="color: rgb(0, 86, 179); text-decoration: underline; font-weight: bold; font-size: 11px; font-family: Arial, sans-serif; display: inline-block;">www.holomedic.com.pe</a>
    </td>
    <td valign="top" style="border-left: 2px solid rgb(0, 86, 179); padding-left: 20px; padding-top: 2px; padding-bottom: 2px;">
      <div style="font-size: 14px; font-weight: bold; color: rgb(0, 0, 0); margin-bottom: 4px; font-family: Arial, sans-serif;">
        ${name} <span style="color: rgb(0, 86, 179); font-weight: bold; margin: 0 4px;">|</span> ${role}
      </div>
      <div style="margin-bottom: 4px; font-family: Arial, sans-serif;">
        <a href="mailto:${email}" style="color: rgb(0, 86, 179); text-decoration: underline;">${email}</a>
      </div>
      <div style="color: rgb(51, 51, 51); margin-bottom: 2px; font-family: Arial, sans-serif;">
        Móvil: ${phone}
      </div>
      <div style="color: rgb(51, 51, 51); margin-bottom: 2px; font-family: Arial, sans-serif;">
        Telef. ${phoneAlt}
      </div>
      <div style="color: rgb(51, 51, 51); margin-bottom: 8px; font-family: Arial, sans-serif;">
        ${address}
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <a href="https://www.facebook.com" target="_blank" style="display: inline-block; text-decoration: none;">
          <img src="https://img.icons8.com/color/30/facebook-new.png" alt="Facebook" style="display: block; width: 24px; height: 24px; border: 0;" />
        </a>
        <a href="https://www.instagram.com" target="_blank" style="display: inline-block; text-decoration: none;">
          <img src="https://img.icons8.com/color/30/instagram-new.png" alt="Instagram" style="display: block; width: 24px; height: 24px; border: 0;" />
        </a>
        <a href="https://wa.me/51989211757" target="_blank" style="display: inline-block; text-decoration: none;">
          <img src="https://img.icons8.com/color/30/whatsapp.png" alt="WhatsApp" style="display: block; width: 24px; height: 24px; border: 0;" />
        </a>
      </div>
    </td>
  </tr>
</table>${SIGNATURE_SENTINEL}`;
}

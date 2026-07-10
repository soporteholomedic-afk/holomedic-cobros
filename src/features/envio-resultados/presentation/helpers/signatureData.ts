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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function buildSignatureHtml(data: SignatureData): string {
  const name = escapeHtml(data.name);
  const role = escapeHtml(data.role);
  const email = escapeHtml(data.email);
  const phone = escapeHtml(data.phone);
  const phoneAlt = escapeHtml(data.phoneAlt);
  const address = escapeHtml(data.address);

  return `<table cellpadding="0" cellspacing="0" style="border-collapse: collapse; font-family: Arial, sans-serif; font-size: 12px; color: rgb(51, 51, 51); line-height: 1.5; margin-top: 15px;">
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
</table>`;
}

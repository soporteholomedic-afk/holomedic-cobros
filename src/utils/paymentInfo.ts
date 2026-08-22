/**
 * Institutional payment-data block (REQ-01 D4).
 *
 * Extracted byte-identically from `buildEmailHtml.ts`'s file-private
 * `buildPaymentInfo()` so the cobranza template flow can source the same
 * `{{cuentasBancarias}}` data without importing the 300-line consolidados
 * renderer (wrong dependency direction) or duplicating the bank data
 * (drift risk). `buildEmailHtml` now imports this function — the output
 * is character-for-character the same as before the extraction.
 */

/** Inline styles for the payment block (moved verbatim from buildEmailHtml STYLES). */
const PAYMENT_STYLES = {
  paymentBlock:
    'margin-top: 15px; padding: 12px 15px; background-color: #f5f5f5; border-left: 3px solid #003366; font-size: 12px; line-height: 1.7;',
  paymentTitle:
    'font-size: 14px; font-weight: bold; color: #003366; margin-bottom: 8px;',
  paymentLine: 'margin: 2px 0;',
  paymentBullet: 'margin: 2px 0; padding-left: 10px;',
};

/**
 * Build the HOLOMEDIC "DATOS PARA EL PAGO" HTML block (bank accounts).
 * Pure: no arguments, no side effects, deterministic output.
 */
export function buildCuentasBancariasHtml(): string {
  return `
    <div style="${PAYMENT_STYLES.paymentBlock}">
      <p style="${PAYMENT_STYLES.paymentTitle}">DATOS PARA EL PAGO</p>
      <p style="${PAYMENT_STYLES.paymentLine}"><strong>HOLOMEDIC SERVICIOS INTEGRALES S.A.C.</strong></p>
      <p style="${PAYMENT_STYLES.paymentLine}">RUC: 20556200328</p>
      <p style="${PAYMENT_STYLES.paymentLine}">&nbsp;</p>
      <p style="${PAYMENT_STYLES.paymentBullet}">&bull; Banco Scotiabank &ndash; Cuenta Corriente (Soles): 000-1771370</p>
      <p style="${PAYMENT_STYLES.paymentBullet}">&bull; Banco Scotiabank &ndash; CCI: 009-107-00000177137042</p>
      <p style="${PAYMENT_STYLES.paymentBullet}">&bull; Banco de la Nación &ndash; Cuenta de Detracciones: 00076059551</p>
    </div>`;
}

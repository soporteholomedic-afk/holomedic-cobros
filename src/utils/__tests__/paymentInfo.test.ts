import { describe, it, expect } from 'vitest';
import { buildCuentasBancariasHtml } from '../paymentInfo';

/**
 * T4.6 / T1b.1 (REQ-01 D4) — the institutional payment-data block that
 * lived as the file-private `buildPaymentInfo()` in `buildEmailHtml.ts`
 * is extracted verbatim to `src/utils/paymentInfo.ts` under the name
 * `buildCuentasBancariasHtml()`. The extraction MUST be a byte-identical
 * no-op: same leading newline, same indentation, same inline styles.
 *
 * The expected literal below is copied character-for-character from the
 * pre-extraction template (buildEmailHtml.ts buildPaymentInfo). If the
 * extracted output ever drifts, this pin fails.
 */
const EXPECTED_PAYMENT_BLOCK = `
    <div style="margin-top: 15px; padding: 12px 15px; background-color: #f5f5f5; border-left: 3px solid #003366; font-size: 12px; line-height: 1.7;">
      <p style="font-size: 14px; font-weight: bold; color: #003366; margin-bottom: 8px;">DATOS PARA EL PAGO</p>
      <p style="margin: 2px 0;"><strong>HOLOMEDIC SERVICIOS INTEGRALES S.A.C.</strong></p>
      <p style="margin: 2px 0;">RUC: 20556200328</p>
      <p style="margin: 2px 0;">&nbsp;</p>
      <p style="margin: 2px 0; padding-left: 10px;">&bull; Banco Scotiabank &ndash; Cuenta Corriente (Soles): 000-1771370</p>
      <p style="margin: 2px 0; padding-left: 10px;">&bull; Banco Scotiabank &ndash; CCI: 009-107-00000177137042</p>
      <p style="margin: 2px 0; padding-left: 10px;">&bull; Banco de la Nación &ndash; Cuenta de Detracciones: 00076059551</p>
    </div>`;

describe('buildCuentasBancariasHtml', () => {
  it('returns the payment block byte-identical to the pre-extraction output', () => {
    expect(buildCuentasBancariasHtml()).toBe(EXPECTED_PAYMENT_BLOCK);
  });

  it('carries the institutional data: title, RUC and all three account lines', () => {
    const html = buildCuentasBancariasHtml();
    // Title + company identity
    expect(html).toContain('DATOS PARA EL PAGO');
    expect(html).toContain('HOLOMEDIC SERVICIOS INTEGRALES S.A.C.');
    expect(html).toContain('RUC: 20556200328');
    // Scotiabank corriente + CCI
    expect(html).toContain('Banco Scotiabank');
    expect(html).toContain('Cuenta Corriente (Soles): 000-1771370');
    expect(html).toContain('CCI: 009-107-00000177137042');
    // Banco de la Nación detracciones
    expect(html).toContain('Banco de la Nación');
    expect(html).toContain('Cuenta de Detracciones: 00076059551');
  });

  it('is deterministic — two invocations produce the exact same string', () => {
    expect(buildCuentasBancariasHtml()).toBe(buildCuentasBancariasHtml());
  });

  it('keeps the original structural shape (leading newline, wrapping div, inline styles)', () => {
    const html = buildCuentasBancariasHtml();
    // The original template literal begins with a newline and 4-space indent.
    expect(html.startsWith('\n    <div style="')).toBe(true);
    expect(html.endsWith('</div>')).toBe(true);
    // Entities used by the legacy template are preserved (not re-encoded).
    expect(html).toContain('&bull;');
    expect(html).toContain('&ndash;');
    expect(html).toContain('&nbsp;');
  });
});

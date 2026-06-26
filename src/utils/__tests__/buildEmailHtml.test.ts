import { describe, it, expect } from 'vitest';
import { buildEmailHtml } from '../buildEmailHtml';
import { ClienteGroup } from '../../types';

function createClient(overrides?: Partial<ClienteGroup>): ClienteGroup {
  return {
    clienteId: '20601234567',
    razonSocial: 'MARCO PERUANA S.A.',
    documentos: [],
    saldosPorMoneda: {},
    tieneDeuda: false,
    tieneCredito: false,
    tieneSaldoFavor: false,
    saldoPrincipalTexto: 'Al día',
    facturasCredito: 0,
    facturasAFavor: 0,
    facturasVencidas: 0,
    ...overrides,
  };
}

describe('buildEmailHtml', () => {
  // ============================================================
  // Task 1.1 — Function exists, returns valid HTML string
  // ============================================================
  it('should be a function that returns a valid HTML string', () => {
    const client = createClient();
    const result = buildEmailHtml(client);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('<html');
    expect(result).toContain('</html>');
    expect(result).toContain('<body');
    expect(result).toContain('</body>');
  });

  // ============================================================
  // Task 1.2 — Document table with all columns
  // ============================================================
  it('should render a table with all required columns for a client with documentos', () => {
    const client = createClient({
      razonSocial: 'MARCO PERUANA S.A.',
      documentos: [
        {
          tipoDoc: 'FE',
          serie: 'F001',
          numero: '101',
          fechaDoc: '01/05/2026',
          fechaVen: '20/05/2026',
          cuenta: '121201',
          moneda: 'S/',
          debe: 1200,
          haber: 200,
          saldo: 1000,
        },
      ],
    });

    const html = buildEmailHtml(client);

    // Table structure
    expect(html).toContain('<table');
    expect(html).toContain('</table>');

    // All header columns present
    expect(html).toContain('Tipo Doc');
    expect(html).toContain('Serie-Número');
    expect(html).toContain('Fec. Emisión');
    expect(html).toContain('Fec. Vencimiento');
    expect(html).toContain('Debe');
    expect(html).toContain('Haber');
    expect(html).toContain('Saldo');

    // Data values present
    expect(html).toContain('FE');
    expect(html).toContain('F001-101');
    expect(html).toContain('01/05/2026');
    expect(html).toContain('20/05/2026');

    // es-PE formatted numbers (1,200.00 not 1200)
    expect(html).toContain('1,200.00');
    expect(html).toContain('200.00');
    expect(html).toContain('1,000.00');
  });

  it('should render correct number of table rows for multiple documents', () => {
    const client = createClient({
      saldosPorMoneda: {
        'S/': { debe: 1650, haber: 400, saldo: 1250 },
        USD: { debe: 100, haber: 0, saldo: 100 },
      },
      documentos: [
        {
          tipoDoc: 'FE', serie: 'F001', numero: '101',
          fechaDoc: '01/05/2026', fechaVen: '20/05/2026',
          cuenta: '121201', moneda: 'S/',
          debe: 1200, haber: 200, saldo: 1000,
        },
        {
          tipoDoc: 'FA', serie: 'F002', numero: '888',
          fechaDoc: '10/05/2026', fechaVen: '01/05/2026',
          cuenta: '121202', moneda: 'S/',
          debe: 450, haber: 200, saldo: 250,
        },
        {
          tipoDoc: 'BO', serie: 'B001', numero: '50',
          fechaDoc: '15/05/2026', fechaVen: '01/05/2026',
          cuenta: '121301', moneda: 'USD',
          debe: 100, haber: 0, saldo: 100,
        },
      ],
    });

    const html = buildEmailHtml(client);

    // Should contain all tipos
    expect(html).toContain('FE');
    expect(html).toContain('FA');
    expect(html).toContain('BO');

    // Should contain all series-numero combos
    expect(html).toContain('F001-101');
    expect(html).toContain('F002-888');
    expect(html).toContain('B001-50');

    // USD document should show its moneda
    expect(html).toContain('USD');
  });

  // ============================================================
  // Task 1.3 — Template sections
  // ============================================================
  it('should include salutation with razonSocial', () => {
    const client = createClient({
      razonSocial: 'MARCO PERUANA S.A.',
      documentos: [
        {
          tipoDoc: 'FE', serie: 'F001', numero: '101',
          fechaDoc: '01/05/2026', fechaVen: '20/05/2026',
          cuenta: '121201', moneda: 'S/',
          debe: 1200, haber: 200, saldo: 1000,
        },
      ],
    });

    const html = buildEmailHtml(client);
    expect(html).toContain('Estimados señores MARCO PERUANA S.A.');
  });

  it('should include "Detalles de documentos:" heading before the table', () => {
    const client = createClient({
      documentos: [
        {
          tipoDoc: 'FE', serie: 'F001', numero: '101',
          fechaDoc: '01/05/2026', fechaVen: '20/05/2026',
          cuenta: '121201', moneda: 'S/',
          debe: 1200, haber: 200, saldo: 1000,
        },
      ],
    });

    const html = buildEmailHtml(client);
    expect(html).toContain('Detalles de documentos:');
  });

  it('should include the full HOLOMEDIC payment info block', () => {
    const client = createClient();
    const html = buildEmailHtml(client);

    // Payment section title
    expect(html).toContain('DATOS PARA EL PAGO');

    // Company info
    expect(html).toContain('HOLOMEDIC SERVICIOS INTEGRALES S.A.C.');
    expect(html).toContain('RUC: 20556200328');

    // Scotiabank accounts
    expect(html).toContain('Scotiabank');
    expect(html).toContain('Cuenta Corriente (Soles)');
    expect(html).toContain('000-1771370');
    expect(html).toContain('CCI');
    expect(html).toContain('009-107-00000177137042');

    // Banco de la Nación — Detracciones
    expect(html).toContain('Banco de la Nación');
    expect(html).toContain('Cuenta de Detracciones');
    expect(html).toContain('00076059551');
  });

  it('should include all body paragraphs from the email template', () => {
    const client = createClient();
    const html = buildEmailHtml(client);

    expect(html).toContain('mantiene un saldo pendiente de pago');
    expect(html).toContain('adjuntamos el detalle de los documentos vencidos');
    expect(html).toContain('Una vez efectuado el pago');
    expect(html).toContain('remitirnos el comprobante');
    expect(html).toContain('En caso el pago haya sido realizado recientemente');
    expect(html).toContain('Quedamos atentos a su confirmación');
    expect(html).toContain('Saludos cordiales.');
  });

  // ============================================================
  // Task 1.4 — Edge cases
  // ============================================================
  it('should show "No hay documentos pendientes" when documentos array is empty', () => {
    const client = createClient({ documentos: [] });
    const html = buildEmailHtml(client);

    expect(html).toContain('No hay documentos pendientes');
    // The table should not appear when there are no docs
    expect(html).not.toContain('<table>');
  });

  it('should handle missing razonSocial by using generic salutation', () => {
    const client = createClient({ razonSocial: '' });
    const html = buildEmailHtml(client);

    expect(html).toContain('Estimados señores');
    // Should NOT have a trailing space + company name
    expect(html).not.toContain('Estimados señores ,');
  });

  it('should handle undefined razonSocial gracefully', () => {
    const client = createClient({ razonSocial: undefined as unknown as string });
    const html = buildEmailHtml(client);

    expect(html).toContain('Estimados señores');
  });

  it('should render "0.00" for null numeric fields', () => {
    const client = createClient({
      documentos: [
        {
          // doc must survive the overdue+positive-balance filter (see T-EMAIL-3)
          // while still exercising safeFormat() on null/undefined debe and haber.
          tipoDoc: 'FE', serie: 'F001', numero: '101',
          fechaDoc: '01/05/2026', fechaVen: '20/05/2026',
          cuenta: '121201', moneda: 'S/',
          debe: null as unknown as number,
          haber: undefined as unknown as number,
          saldo: 1000,
        },
      ],
    });

    const html = buildEmailHtml(client);
    expect(html).toContain('0.00');
  });

  it('should still render salutation and payment info for empty documentos', () => {
    const client = createClient({
      razonSocial: 'MARCO PERUANA S.A.',
      documentos: [],
    });

    const html = buildEmailHtml(client);

    // Salutation still present
    expect(html).toContain('Estimados señores MARCO PERUANA S.A.');
    // Payment info still present
    expect(html).toContain('HOLOMEDIC SERVICIOS INTEGRALES S.A.C.');
    // Body paragraphs still present
    expect(html).toContain('mantiene un saldo pendiente de pago');
    expect(html).toContain('Saludos cordiales.');
  });
});

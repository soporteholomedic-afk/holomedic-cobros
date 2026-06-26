import { ClienteGroup, Documento } from '../types';
import { formatNumber } from './excelParser';

// ============================================================
// File-local date utilities — mirror ClientDetailModal's
// parseDate/isPastDue so both renderers agree on "past due".
// Not exported.
// ============================================================
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const year = parseInt(parts[2], 10);
  return new Date(year, month, day);
}

function isPastDue(dateStr: string): boolean {
  const date = parseDate(dateStr);
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

// Direct computation: positive = days past due, null = invalid.
function computeOverdueDays(dateStr: string): number | null {
  const date = parseDate(dateStr);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - date.getTime()) / 86_400_000);
}

// ============================================================
// Inline Style Dictionary
// Task 1.1 — centralized styles for email-client compatibility
// ============================================================
const STYLES = {
  body:
    'font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #333333; line-height: 1.6; margin: 0; padding: 20px; background-color: #f4f4f4;',
  container:
    'max-width: 700px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 4px;',
  header:
    'background-color: #003366; color: #ffffff; padding: 15px 20px; font-size: 16px; font-weight: bold; text-align: center;',
  content:
    'padding: 20px;',
  salutation:
    'font-size: 14px; font-weight: bold; margin-bottom: 12px; color: #003366;',
  paragraph:
    'margin-bottom: 10px; font-size: 13px;',
  sectionHeading:
    'font-size: 13px; font-weight: bold; margin: 15px 0 8px 0; color: #003366;',
  table:
    'border-collapse: collapse; width: 100%; font-size: 12px; margin: 10px 0 15px 0;',
  th: 'background-color: #003366; color: #ffffff; padding: 8px 10px; font-weight: bold; border: 1px solid #003366;',
  thLeft:
    'background-color: #003366; color: #ffffff; padding: 8px 10px; font-weight: bold; border: 1px solid #003366; text-align: left;',
  thCenter:
    'background-color: #003366; color: #ffffff; padding: 8px 10px; font-weight: bold; border: 1px solid #003366; text-align: center;',
  thRight:
    'background-color: #003366; color: #ffffff; padding: 8px 10px; font-weight: bold; border: 1px solid #003366; text-align: right;',
  td: 'padding: 6px 10px; border: 1px solid #dddddd; text-align: left;',
  tdCenter:
    'padding: 6px 10px; border: 1px solid #dddddd; text-align: center;',
  tdRight:
    'padding: 6px 10px; border: 1px solid #dddddd; text-align: right;',
  tdRightBold:
    'padding: 6px 10px; border: 1px solid #dddddd; text-align: right; font-weight: bold;',
  noDocs:
    'font-style: italic; color: #888888; margin: 10px 0 15px 0; padding: 10px; background-color: #f9f9f9; border: 1px solid #eeeeee; border-radius: 3px;',
  paymentBlock:
    'margin-top: 15px; padding: 12px 15px; background-color: #f5f5f5; border-left: 3px solid #003366; font-size: 12px; line-height: 1.7;',
  paymentTitle:
    'font-size: 14px; font-weight: bold; color: #003366; margin-bottom: 8px;',
  paymentLine: 'margin: 2px 0;',
  paymentBullet: 'margin: 2px 0; padding-left: 10px;',
  totalRow: 'background-color: #f5f5f5; font-weight: bold;',
  estadoChipVencido: 'background-color: #fee2e2; color: #b91c1c; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;',
  estadoChipCredito: 'background-color: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;',
};

// ============================================================
// Helper: safe number formatting for null/undefined values
// ============================================================
function safeFormat(value: number | null | undefined): string {
  const num = value ?? 0;
  return formatNumber(num);
}

// ============================================================
// Helper: build document table HTML
// Task 1.2 — table generation with all columns
// T-EMAIL-4 — extended to 9 columns (Días Vencido + Estado) with
// inline-styled chips and a per-currency Total a pagar row.
// ============================================================
function buildTable(documentos: Documento[]): string {
  // Note: caller passes overdueDocs. `documentos` here is the filtered set.
  const headerRow = `
    <tr>
      <th style="${STYLES.thLeft}">Tipo Doc</th>
      <th style="${STYLES.thLeft}">Serie-Número</th>
      <th style="${STYLES.thCenter}">Fec. Emisión</th>
      <th style="${STYLES.thCenter}">Fec. Vencimiento</th>
      <th style="${STYLES.thRight}">Días Vencido</th>
      <th style="${STYLES.thCenter}">Estado</th>
      <th style="${STYLES.thRight}">Debe</th>
      <th style="${STYLES.thRight}">Haber</th>
      <th style="${STYLES.thRight}">Saldo</th>
    </tr>`;

  const dataRows = documentos
    .map((doc) => {
      const days = computeOverdueDays(doc.fechaVen);
      const daysCell = days === null ? 'S/V' : String(days);
      const estado: 'Vencido' | 'CREDITO' | '-' =
        doc.saldo <= 0.01
          ? '-'
          : isPastDue(doc.fechaVen)
            ? 'Vencido'
            : 'CREDITO';
      const estadoCell =
        estado === 'Vencido'
          ? `<span style="${STYLES.estadoChipVencido}">Vencido</span>`
          : estado === 'CREDITO'
            ? `<span style="${STYLES.estadoChipCredito}">CREDITO</span>`
            : '-';
      return `
    <tr>
      <td style="${STYLES.td}">${escapeHtml(doc.tipoDoc)}</td>
      <td style="${STYLES.td}">${escapeHtml(doc.serie)}-${escapeHtml(doc.numero)}</td>
      <td style="${STYLES.tdCenter}">${escapeHtml(doc.fechaDoc)}</td>
      <td style="${STYLES.tdCenter}">${escapeHtml(doc.fechaVen)}</td>
      <td style="${STYLES.tdRight}">${daysCell}</td>
      <td style="${STYLES.tdCenter}">${estadoCell}</td>
      <td style="${STYLES.tdRight}">${doc.moneda} ${safeFormat(doc.debe)}</td>
      <td style="${STYLES.tdRight}">${doc.moneda} ${safeFormat(doc.haber)}</td>
      <td style="${STYLES.tdRightBold}">${doc.moneda} ${safeFormat(doc.saldo)}</td>
    </tr>`;
    })
    .join('');

  // Per-currency Total a pagar rows. Operates on the same `documentos`
  // (which is the filtered set) so totals can never diverge from the
  // table contents.
  const totals = documentos.reduce<Record<string, number>>((acc, d) => {
    acc[d.moneda] = (acc[d.moneda] ?? 0) + d.saldo;
    return acc;
  }, {});
  const totalRows = Object.entries(totals)
    .map(
      ([mon, sum]) => `
    <tr style="${STYLES.totalRow}">
      <td colspan="8" style="${STYLES.tdRightBold}">Total a pagar (${escapeHtml(mon)}):</td>
      <td style="${STYLES.tdRightBold}">${escapeHtml(mon)} ${safeFormat(sum)}</td>
    </tr>`,
    )
    .join('');

  return `
    <table cellpadding="0" cellspacing="0" style="${STYLES.table}">
      <thead>${headerRow}</thead>
      <tbody>${dataRows}${totalRows}
      </tbody>
    </table>`;
}

// ============================================================
// Helper: HTML escape to prevent injection
// ============================================================
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (ch) => map[ch] || ch);
}

// ============================================================
// Helper: build the "no documents" message
// Task 1.4 — edge case for empty documentos[]
// ============================================================
function buildNoDocs(): string {
  return `
    <p style="${STYLES.noDocs}">No hay documentos pendientes</p>`;
}

// ============================================================
// Helper: build payment information block
// Task 1.3 — payment info section
// ============================================================
function buildPaymentInfo(): string {
  return `
    <div style="${STYLES.paymentBlock}">
      <p style="${STYLES.paymentTitle}">DATOS PARA EL PAGO</p>
      <p style="${STYLES.paymentLine}"><strong>HOLOMEDIC SERVICIOS INTEGRALES S.A.C.</strong></p>
      <p style="${STYLES.paymentLine}">RUC: 20556200328</p>
      <p style="${STYLES.paymentLine}">&nbsp;</p>
      <p style="${STYLES.paymentBullet}">&bull; Banco Scotiabank &ndash; Cuenta Corriente (Soles): 000-1771370</p>
      <p style="${STYLES.paymentBullet}">&bull; Banco Scotiabank &ndash; CCI: 009-107-00000177137042</p>
      <p style="${STYLES.paymentBullet}">&bull; Banco de la Nación &ndash; Cuenta de Detracciones: 00076059551</p>
    </div>`;
}

// ============================================================
// Main export
// Task 1.1–1.4: Build complete HTML email
// ============================================================
export function buildEmailHtml(client: ClienteGroup): string {
  const { razonSocial, documentos } = client;

  // Filter to overdue docs with positive balance — what the email
  // is now scoped to deliver.
  const overdueDocs = documentos.filter(
    (d) => d.saldo > 0.01 && isPastDue(d.fechaVen),
  );

  // Task 1.3: Salutation — handle missing razonSocial (Task 1.4)
  const salutation = razonSocial
    ? `Estimados señores ${escapeHtml(razonSocial)}`
    : 'Estimados señores';

  // Task 1.4: Decide table or empty message — 3 branches:
  //   (a) documentos.length === 0          → pre-existing "No docs" message (no table)
  //   (b) overdueDocs.length === 0         → table headers + colspan message + 0.00 total
  //   (c) overdueDocs.length > 0           → normal table with per-currency totals
  let docsSection: string;
  if (documentos.length === 0) {
    // (a) Pre-existing behavior: no docs at all → no table, italic message.
    docsSection = `
    ${buildNoDocs()}`;
  } else if (overdueDocs.length === 0) {
    // (b) Filter was applied but nothing is overdue: still show the table
    // structure (headers) so the email renders consistently, with a
    // colspan message + a zero total row.
    docsSection = `
    <p style="${STYLES.sectionHeading}">Detalles de documentos:</p>
    <table cellpadding="0" cellspacing="0" style="${STYLES.table}">
      <thead>
        <tr>
          <th style="${STYLES.thLeft}">Tipo Doc</th>
          <th style="${STYLES.thLeft}">Serie-Número</th>
          <th style="${STYLES.thCenter}">Fec. Emisión</th>
          <th style="${STYLES.thCenter}">Fec. Vencimiento</th>
          <th style="${STYLES.thRight}">Días Vencido</th>
          <th style="${STYLES.thCenter}">Estado</th>
          <th style="${STYLES.thRight}">Debe</th>
          <th style="${STYLES.thRight}">Haber</th>
          <th style="${STYLES.thRight}">Saldo</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td colspan="9" style="${STYLES.noDocs}">No hay deudas vencidas</td>
        </tr>
        <tr style="${STYLES.totalRow}">
          <td colspan="8" style="${STYLES.tdRightBold}">Total a pagar:</td>
          <td style="${STYLES.tdRightBold}">0.00</td>
        </tr>
      </tbody>
    </table>`;
  } else {
    // (c) Happy path.
    docsSection = `
    <p style="${STYLES.sectionHeading}">Detalles de documentos:</p>
    ${buildTable(overdueDocs)}`;
  }

  // Task 1.3: Full template body
  const bodyHtml = `
    <p style="${STYLES.paragraph}">Mediante el presente, le recordamos que mantiene un saldo pendiente de pago con nuestra empresa. Agradeceremos pueda realizar la regularización correspondiente.</p>
    <p style="${STYLES.paragraph}">Para su referencia, adjuntamos el estado de cuenta actualizado a la fecha, donde podrá visualizar el detalle de los documentos pendientes.</p>
    ${docsSection}
    <p style="${STYLES.paragraph}">Una vez efectuado el pago, le agradeceremos remitirnos el comprobante de la transferencia a fin de proceder con la validación correspondiente.</p>
    ${buildPaymentInfo()}
    <p style="${STYLES.paragraph}">En caso el pago haya sido realizado recientemente, agradeceremos omitir el presente mensaje.</p>
    <p style="${STYLES.paragraph}">Quedamos atentos a su confirmación y agradecemos de antemano su pronta atención.</p>
    <p style="${STYLES.paragraph}">Saludos cordiales.</p>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Estado de Cuenta - HOLOMEDIC</title>
</head>
<body style="${STYLES.body}">
  <div style="${STYLES.container}">
    <div style="${STYLES.header}">HOLOMEDIC SERVICIOS INTEGRALES S.A.C.</div>
    <div style="${STYLES.content}">
      <p style="${STYLES.salutation}">${salutation}</p>
      ${bodyHtml}
    </div>
  </div>
</body>
</html>`;
}

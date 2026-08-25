/**
 * `buildCobranzaInterpolationContext` — pure ClienteGroup →
 * InterpolationContext mapper for the cobranza email flow
 * (REQ-01-DIR-06, design §4).
 *
 * Summary tokens (`montoTotal`/`moneda`) use the MAIN currency — the
 * `saldosPorMoneda` key with the largest outstanding saldo, ties broken
 * in favor of PEN (`'S/'`, design D9) — while `documentosPendientes`
 * rows carry each document's own currency (multi-currency per row).
 * All numeric outputs are PRE-FORMATTED strings; the token resolvers
 * stay dumb escape-and-emit.
 *
 * `cuentasBancariasHtml` comes from `buildCuentasBancariasHtml`
 * (`src/utils/paymentInfo`, D4 single source). The date utilities are
 * duplicated file-locally from `buildEmailHtml` (they are private
 * there; design §4 allows the duplication for this helper).
 */
import type { ClienteGroup, Documento, MonedaResumen } from '../../../../types';
import { formatNumber } from '../../../../utils/excelParser';
import { buildCuentasBancariasHtml } from '../../../../utils/paymentInfo';
import type {
  DocumentoPendienteRow,
  InterpolationContext,
  TablaCobranzaRow,
} from '../../../envio-resultados/presentation/helpers/tokenResolvers/types';

// ============================================================
// File-local date utilities — mirror buildEmailHtml's
// parseDate/computeOverdueDays/isPastDue so both flows agree on
// "past due" and "days overdue". Not exported.
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

/** Positive = days past due, null = invalid date. */
function computeOverdueDays(dateStr: string): number | null {
  const date = parseDate(dateStr);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - date.getTime()) / 86_400_000);
}

/** Currency symbol for the soles leg — PEN in the Excel report data. */
const MONEDA_PEN = 'S/';

/**
 * Main currency = `saldosPorMoneda` key with the max saldo. Ties break
 * in favor of PEN (`'S/'`); otherwise the first-inserted key wins.
 * Returns `''` when there are no currencies (empty-debt client — the
 * `montoTotal`/`moneda` tokens then resolve empty and their blocks are
 * removed by the orchestrator).
 *
 * Exported (REQ-02): the audit metadata helper reuses this same
 * definition so "main currency = max saldo, tie → 'S/'" has ONE
 * source (design §4.4).
 */
export function selectMainCurrency(saldosPorMoneda: Record<string, MonedaResumen>): string {
  let best = '';
  let bestSaldo = Number.NEGATIVE_INFINITY;
  for (const [moneda, resumen] of Object.entries(saldosPorMoneda)) {
    if (resumen.saldo > bestSaldo || (resumen.saldo === bestSaldo && moneda === MONEDA_PEN)) {
      best = moneda;
      bestSaldo = resumen.saldo;
    }
  }
  return best;
}

/** `${moneda} ${formatNumber(value)}` — saldoPrincipalTexto convention. */
function formatWithCurrency(moneda: string, value: number): string {
  return `${moneda} ${formatNumber(value)}`;
}

/** Pre-formatted row for one pending document (saldo > 0.01). */
function toDocumentoPendienteRow(doc: Documento): DocumentoPendienteRow {
  // debe > 0 → debe; else haber (credit-note-backed documents show the
  // credit amount as their monto — design §4).
  const monto = doc.debe > 0 ? doc.debe : doc.haber;
  return {
    fecha: doc.fechaVen,
    factura: `${doc.tipoDoc} ${doc.serie}-${doc.numero}`,
    monto: formatWithCurrency(doc.moneda, monto),
    saldo: formatWithCurrency(doc.moneda, doc.saldo),
  };
}

/**
 * Pre-formatted full cobranza-table row for one pending document
 * (saldo > 0.01, REQ-TC-04). Amounts via `formatWithCurrency` with the
 * ROW's own currency — zeros render as e.g. 'S/ 0.00'; NO debe/haber
 * coalescing (unlike `toDocumentoPendienteRow.monto`). Client identity
 * repeats on every row; dates are verbatim DD/MM/YYYY. `diasVencidos`
 * reuses the SAME past-due helpers as the client-level `maxOverdue`
 * (`isPastDue`/`computeOverdueDays`): overdue → String(days), otherwise
 * '0' (future, due today, or invalid date).
 */
function toTablaCobranzaRow(client: ClienteGroup, doc: Documento): TablaCobranzaRow {
  const overdueDays = isPastDue(doc.fechaVen) ? computeOverdueDays(doc.fechaVen) : null;
  return {
    cliente: client.clienteId,
    razonSocial: client.razonSocial,
    tipoDoc: doc.tipoDoc,
    serie: doc.serie,
    numero: doc.numero,
    fechaDoc: doc.fechaDoc,
    fechaVen: doc.fechaVen,
    moneda: doc.moneda,
    debe: formatWithCurrency(doc.moneda, doc.debe),
    haber: formatWithCurrency(doc.moneda, doc.haber),
    saldo: formatWithCurrency(doc.moneda, doc.saldo),
    diasVencidos: overdueDays !== null ? String(overdueDays) : '0',
  };
}

/**
 * Build the cobranza `InterpolationContext` for one client group.
 * Pure: no I/O, no React — `new Date()` is the only ambient input
 * (today + overdue-day math, same as buildEmailHtml).
 */
export function buildCobranzaInterpolationContext(
  client: ClienteGroup,
  firmaHtml: string,
): InterpolationContext {
  const pendingDocs = client.documentos.filter((d) => d.saldo > 0.01);

  const moneda = selectMainCurrency(client.saldosPorMoneda);
  const montoTotal =
    moneda === ''
      ? ''
      : formatWithCurrency(moneda, client.saldosPorMoneda[moneda].saldo);

  const maxOverdue = pendingDocs.reduce((max, doc) => {
    if (!isPastDue(doc.fechaVen)) return max;
    const days = computeOverdueDays(doc.fechaVen);
    return days !== null && days > max ? days : max;
  }, 0);

  return {
    companyName: client.razonSocial,
    patientNames: [],
    fileNames: [],
    firma: firmaHtml,
    patients: [],
    files: [],
    area: 'cobranza',
    today: new Date().toLocaleDateString('es-PE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    destino: '',
    // ---- cobranza fields (D12 widening) ----
    ruc: client.clienteId,
    montoTotal,
    moneda,
    diasVencidos: String(maxOverdue),
    cuentasBancariasHtml: buildCuentasBancariasHtml(),
    documentosPendientes: pendingDocs.map(toDocumentoPendienteRow),
    tablaCobranza: pendingDocs.map((doc) => toTablaCobranzaRow(client, doc)),
  };
}

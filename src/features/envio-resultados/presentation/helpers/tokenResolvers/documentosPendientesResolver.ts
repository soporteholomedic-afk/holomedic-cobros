/**
 * `documentosPendientes` table sub-resolver (REQ-01 DIR-06, T1b.4).
 *
 * Renders an inline-styled HTML `<table>` of the client's pending
 * documents with ONLY the selected columns (modeled on
 * `documentosVencidosResolver`). Columns supported (per the cobranza
 * area's `predefinedTables` definition):
 *   - `fecha`    — document due date (pre-formatted upstream)
 *   - `factura`  — `${tipoDoc} ${serie}-${numero}` label
 *   - `monto`    — amount, pre-formatted WITH the row's own currency
 *   - `saldo`    — outstanding balance, pre-formatted WITH the row's
 *                  own currency (multi-currency per row)
 *
 * Rows come pre-formatted from `ctx.documentosPendientes` (the caller
 * filters to documents with saldo > 0.01 and formats numbers) — the
 * resolver stays a dumb escape-and-emit renderer.
 *
 * Returns `''` (signals empty → block removal) when the selection is
 * empty or there are no pending rows.
 */
import type { TableResolver } from './types';
import { escapeHtml } from './escapeHtml';

const COLUMN_LABELS: Record<string, string> = {
  fecha: 'Fecha',
  factura: 'Factura',
  monto: 'Monto',
  saldo: 'Saldo',
};

export const documentosPendientesResolver: TableResolver = {
  name: 'documentosPendientes',
  resolve(cols, ctx) {
    if (cols.length === 0) return '';
    const rows = ctx.documentosPendientes ?? [];
    if (rows.length === 0) return '';
    const headers = cols
      .map((c) => `<th style="text-align:left;padding:4px 8px;">${escapeHtml(COLUMN_LABELS[c] ?? c)}</th>`)
      .join('');
    const body = rows
      .map((r) => {
        const cells = cols
          .map((c) => {
            const v = r[c as keyof typeof r] ?? '';
            return `<td style="padding:4px 8px;">${escapeHtml(v)}</td>`;
          })
          .join('');
        return `<tr>${cells}</tr>`;
      })
      .join('');
    return `<table style="border-collapse:collapse;width:100%;">\n<thead><tr>${headers}</tr></thead>\n<tbody>${body}</tbody>\n</table>`;
  },
};

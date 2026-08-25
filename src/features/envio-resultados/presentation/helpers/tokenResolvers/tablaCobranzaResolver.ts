/**
 * `tabla-cobranza` table sub-resolver (token-tabla-cobranza,
 * REQ-TC-02/03/07).
 *
 * Renders an inline-styled HTML `<table>` of the client's pending
 * documents with ONLY the selected columns (modeled on
 * `documentosPendientesResolver`). Columns supported (per the cobranza
 * area's `predefinedTables` definition):
 *   - `cliente` / `razonSocial` — client identity, repeated on every row
 *   - `tipoDoc` / `serie` / `numero` — document identity (raw fields,
 *     unlike the `documentosPendientes` composed `factura` label)
 *   - `fechaDoc` / `fechaVen` — dates, verbatim DD/MM/YYYY
 *   - `moneda` — the row's own currency symbol
 *   - `debe` / `haber` / `saldo` — amounts, pre-formatted WITH the row's
 *     own currency (zeros render as e.g. 'S/ 0.00'; no debe/haber
 *     coalescing)
 *
 * D9: every rendered column carries an explicit inline `width:X%` on its
 * `<th>` (never on `<td>`), renormalized per selection so any subset
 * still sums to exactly 100% — the last selected column absorbs the
 * rounding residual. Unknown columns join via an even-share base width,
 * mirroring the `COLUMN_LABELS[c] ?? c` precedent (columns NOT dropped).
 *
 * Rows come pre-formatted from `ctx.tablaCobranza` (the caller filters
 * to documents with saldo > 0.01 and formats numbers) — the resolver
 * stays a dumb escape-and-emit renderer.
 *
 * Returns `''` (signals empty → block removal) when the selection is
 * empty or there are no pending rows.
 */
import type { TableResolver } from './types';
import { escapeHtml } from './escapeHtml';

const COLUMN_LABELS: Record<string, string> = {
  cliente: 'Cliente',
  razonSocial: 'Razón Social',
  tipoDoc: 'Tipo Doc',
  serie: 'Serie',
  numero: 'Numero',
  fechaDoc: 'Fec. Doc.',
  fechaVen: 'Fec. Ven',
  moneda: 'Mon',
  debe: 'Debe',
  haber: 'Haber',
  saldo: 'Saldo',
};

/** D9 — approved proportional column widths (percent). Σ = 100. Resolver-local. */
const COLUMN_WIDTHS: Record<string, number> = {
  cliente: 9,
  razonSocial: 18,
  tipoDoc: 8,
  serie: 7,
  numero: 8,
  fechaDoc: 9,
  fechaVen: 9,
  moneda: 5,
  debe: 9,
  haber: 9,
  saldo: 9,
};

/** Round to 2 decimals (D9 percent precision; also cleans FP noise). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * D9 width renormalization (pure). Base width per selected column:
 * `COLUMN_WIDTHS[c] ?? 100 / cols.length` (even-share fallback for
 * unknown keys). Bases are scaled ×100/Σ and rounded to 2 decimals; the
 * LAST selected column absorbs the residual `100 − Σ(rounded)` so the
 * emitted widths sum to exactly 100. The full 11-column selection is the
 * identity case (the map already sums to 100).
 *
 * Caller guarantees `cols.length > 0`.
 */
function normalizeWidths(cols: readonly string[]): string[] {
  const bases = cols.map((c) => COLUMN_WIDTHS[c] ?? 100 / cols.length);
  const total = bases.reduce((sum, b) => sum + b, 0);
  const widths = bases.map((b) => round2((b * 100) / total));
  const last = widths.length - 1;
  const residual = round2(100 - widths.reduce((sum, w) => sum + w, 0));
  widths[last] = round2(widths[last] + residual);
  // Trailing zeros trimmed by number-to-string ('9', '12.5', '33.33').
  return widths.map(String);
}

export const tablaCobranzaResolver: TableResolver = {
  name: 'tabla-cobranza',
  resolve(cols, ctx) {
    if (cols.length === 0) return '';
    const rows = ctx.tablaCobranza ?? [];
    if (rows.length === 0) return '';
    const widths = normalizeWidths(cols);
    const headers = cols
      .map(
        (c, i) =>
          `<th style="text-align:left;padding:4px 8px;width:${widths[i]}%;">${escapeHtml(COLUMN_LABELS[c] ?? c)}</th>`,
      )
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

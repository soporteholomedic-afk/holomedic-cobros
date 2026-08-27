/**
 * `tablaValoraciones` table sub-resolver (REQ-03 M-R2).
 *
 * Renders an inline-styled HTML `<table>` of the valorizaciones
 * per-empresa summary with ONLY the selected columns (modeled on
 * `tablaCobranzaResolver`, the cobranza D12 precedent). Columns supported
 * (per the valoraciones area's `predefinedTables` definition):
 *   - `empresa` — the facturar-a group name
 *   - `registros` — the group's row count
 *   - `subtotal` / `igv` / `total` — amounts, pre-formatted WITH the
 *     group's own currency symbol (18% IGV, round2 upstream)
 *
 * D9 (inherited): every rendered column carries an explicit inline
 * `width:X%` on its `<th>` (never on `<td>`), renormalized per selection
 * so any subset still sums to exactly 100% — the last selected column
 * absorbs the rounding residual. Unknown columns join via an even-share
 * base width (`COLUMN_LABELS[c] ?? c` precedent — columns NOT dropped).
 *
 * Styling (email/Outlook-safe, identical to tabla-cobranza): header cells
 * render blue (`#1e40af` background via the `background:` shorthand,
 * white named text color) and EVERY cell carries a light-blue
 * `1px solid #bfdbfe` border; all styles inline per cell.
 *
 * Rows come pre-formatted from `ctx.tablaValoraciones` — the resolver
 * stays a dumb escape-and-emit renderer.
 *
 * Returns `''` (signals empty → block removal) when the selection is
 * empty or there are no rows.
 */
import type { TableResolver } from './types';
import { escapeHtml } from './escapeHtml';

const COLUMN_LABELS: Record<string, string> = {
  empresa: 'Empresa',
  registros: 'Registros',
  subtotal: 'Subtotal',
  igv: 'IGV',
  total: 'Total',
};

/** D9 — approved proportional column widths (percent). Σ = 100. Resolver-local. */
const COLUMN_WIDTHS: Record<string, number> = {
  empresa: 40,
  registros: 12,
  subtotal: 16,
  igv: 16,
  total: 16,
};

/** Round to 2 decimals (D9 percent precision; also cleans FP noise). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * D9 width renormalization (pure; identical algorithm to
 * tabla-cobranza). Base width per selected column:
 * `COLUMN_WIDTHS[c] ?? 100 / cols.length` (even-share fallback for
 * unknown keys). Bases are scaled ×100/Σ and rounded to 2 decimals; the
 * LAST selected column absorbs the residual `100 − Σ(rounded)` so the
 * emitted widths sum to exactly 100. The full 5-column selection is the
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
  // Trailing zeros trimmed by number-to-string ('12', '16.67', '40').
  return widths.map(String);
}

export const tablaValoracionesResolver: TableResolver = {
  name: 'tablaValoraciones',
  resolve(cols, ctx) {
    if (cols.length === 0) return '';
    const rows = ctx.tablaValoraciones ?? [];
    if (rows.length === 0) return '';
    const widths = normalizeWidths(cols);
    const headers = cols
      .map(
        (c, i) =>
          `<th style="text-align:left;padding:4px 8px;width:${widths[i]}%;background:#1e40af;color:white;border:1px solid #bfdbfe;">${escapeHtml(COLUMN_LABELS[c] ?? c)}</th>`,
      )
      .join('');
    const body = rows
      .map((r) => {
        const cells = cols
          .map((c) => {
            const v = r[c as keyof typeof r] ?? '';
            return `<td style="padding:4px 8px;border:1px solid #bfdbfe;">${escapeHtml(v)}</td>`;
          })
          .join('');
        return `<tr>${cells}</tr>`;
      })
      .join('');
    return `<table style="border-collapse:collapse;width:100%;">\n<thead><tr>${headers}</tr></thead>\n<tbody>${body}</tbody>\n</table>`;
  },
};

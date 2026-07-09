/**
 * `examenes` table sub-resolver (PR 4).
 *
 * Renders a full HTML `<table>` of patient exam records, with ONLY
 * the selected columns (design Decision j). Columns supported:
 *   - `fecha`     — file/date (synthesized from the file basename, same
 *                   convention as `documentosVencidos` for PR 4)
 *   - `nombre`    — exam file name
 *   - `resultado` — placeholder; real data lands in a future PR when
 *                   the entity carries a result. For PR 4 the column
 *                   is always populated with `—` so the resolver
 *                   never returns `''` for a non-empty selection.
 *
 * Returns `''` (signals empty → block removal) when the selection is
 * empty or no patient files exist.
 */
import type { InterpolationContext, TableResolver } from './types';
import { escapeHtml } from './escapeHtml';

interface ExamRow {
  fecha: string;
  nombre: string;
  resultado: string;
}

function projectExams(ctx: InterpolationContext): ExamRow[] {
  const rows: ExamRow[] = [];
  for (const file of ctx.files) {
    rows.push({
      fecha: file.name.slice(0, 10) || '',
      nombre: file.name,
      resultado: '—',
    });
  }
  return rows;
}

const COLUMN_LABELS: Record<string, string> = {
  fecha: 'Fecha',
  nombre: 'Examen',
  resultado: 'Resultado',
};

export const examenesResolver: TableResolver = {
  name: 'examenes',
  resolve(cols, ctx) {
    if (cols.length === 0) return '';
    const rows = projectExams(ctx);
    if (rows.length === 0) return '';
    const headers = cols
      .map((c) => `<th style="text-align:left;padding:4px 8px;">${escapeHtml(COLUMN_LABELS[c] ?? c)}</th>`)
      .join('');
    const body = rows
      .map((r) => {
        const cells = cols
          .map((c) => {
            const v = (r as unknown as Record<string, string>)[c] ?? '';
            return `<td style="padding:4px 8px;">${escapeHtml(v)}</td>`;
          })
          .join('');
        return `<tr>${cells}</tr>`;
      })
      .join('');
    return `<table style="border-collapse:collapse;width:100%;">\n<thead><tr>${headers}</tr></thead>\n<tbody>${body}</tbody>\n</table>`;
  },
};

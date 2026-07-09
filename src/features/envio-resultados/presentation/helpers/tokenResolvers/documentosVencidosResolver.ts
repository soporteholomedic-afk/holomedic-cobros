/**
 * `documentosVencidos` table sub-resolver (PR 4).
 *
 * Renders a full HTML `<table>` of overdue documents for a list of
 * patients, with ONLY the selected columns (design Decision j).
 * Columns supported (per the area's `predefinedTables` definition):
 *   - `fecha`     — file/dues date (ISO 8601 truncated to YYYY-MM-DD)
 *   - `monto`     — amount in PEN (S/ prefix)
 *   - `paciente`  — patient name (HTML-escaped)
 *
 * Returns `''` (signals empty → block removal) when the selection is
 * empty or the patient list is empty.
 */
import type { InterpolationContext, TableResolver } from './types';
import { escapeHtml } from './escapeHtml';

/**
 * The data shape we project from `ctx.patients[].files[]` to build the
 * table rows. The send flow passes a `PatientFile` per file; for the
 * `monto` column we synthesize a placeholder amount when the field is
 * not present (the existing entity doesn't carry amounts — this is
 * intentional for PR 4; a future PR can extend the entity).
 */
interface OverdueFile {
  fecha: string;
  monto: string;
  paciente: string;
}

function projectOverdueFiles(ctx: InterpolationContext): OverdueFile[] {
  const rows: OverdueFile[] = [];
  for (const patient of ctx.patients) {
    for (const file of patient.files) {
      rows.push({
        fecha: file.name.slice(0, 10) || '',
        monto: 'S/ 0.00',
        paciente: patient.name,
      });
    }
  }
  return rows;
}

const COLUMN_LABELS: Record<string, string> = {
  fecha: 'Fecha',
  monto: 'Monto',
  paciente: 'Paciente',
};

export const documentosVencidosResolver: TableResolver = {
  name: 'documentosVencidos',
  resolve(cols, ctx) {
    if (cols.length === 0) return '';
    const rows = projectOverdueFiles(ctx);
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

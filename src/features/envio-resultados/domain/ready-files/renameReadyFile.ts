import { sanitizeComponent } from '@/lib/sanitize-filename-core';
import { parseReadyFile, type ReadyFileTipo } from './parseReadyFile';

/**
 * Input shape for `renameReadyFile`.
 *
 * - `rawName`        — the file name on disk (e.g. `75618561CERT.pdf`).
 *                      Non-ready names are returned unchanged.
 * - `nombreCompleto` — patient full name. Empty/whitespace segments
 *                      are omitted from the result (no `SIN_NOMBRE`).
 * - `destino`        — project / company. Empty/whitespace segments
 *                      are omitted from the result (no `SIN_DESTINO`).
 * - `tipoExamen`     — optional explicit `'CAMO' | 'EMO' | 'ADICIONAL'`.
 *                      When set it overrides the tipo inferred from
 *                      `rawName` via `parseReadyFile`. Wizard call
 *                      sites pass it; legacy call sites (download
 *                      routes) omit it. `'ADICIONAL'` must come from an
 *                      explicit signal — `parseReadyFile` never infers
 *                      it from the CERT/EXPED suffix.
 */
export interface RenameReadyFileInput {
  rawName: string;
  nombreCompleto: string;
  destino: string;
  tipoExamen?: ReadyFileTipo;
}

/**
 * Build the email-attachment delivery name for a ready-to-send file.
 *
 * Format (unified): `{tipo}-{nombreCompleto}-{destino}.pdf`
 *   - `tipo` is `'CAMO' | 'EMO' | 'ADICIONAL'` (always present —
 *     either the caller-supplied `tipoExamen` or the result of
 *     `parseReadyFile(rawName)`).
 *   - For `tipo === 'ADICIONAL'` the destino segment is OMITTED — the
 *     format is `ADICIONAL-{nombreCompleto}.pdf` (ADICIONALES orders
 *     carry no project segment).
 *   - `nombreCompleto` (and `destino`, when present) are trimmed + run
 *     through `sanitizeComponent` (Windows-illegal chars → `_`,
 *     whitespace runs collapsed). Segments that are empty after
 *     sanitization are OMITTED — no `SIN_DESTINO` fallback.
 *   - If only `tipo` survives sanitization, the result is
 *     `{tipo}.pdf` (never an empty string; for ADICIONAL it is
 *     `ADICIONAL.pdf` — never a CAMO/EMO name).
 *
 * Non-ready file names (anything `parseReadyFile` rejects) are
 * returned verbatim so the caller's email pipeline still produces a
 * valid attachment.
 */
export function renameReadyFile(input: RenameReadyFileInput): string {
  const { rawName, nombreCompleto, destino, tipoExamen } = input;

  const parsed = parseReadyFile(rawName);
  if (!parsed) return rawName;

  const tipo: ReadyFileTipo = tipoExamen ?? parsed.tipo;

  const rawSegments =
    tipo === 'ADICIONAL'
      ? [tipo, nombreCompleto.trim()]
      : [tipo, nombreCompleto.trim(), destino.trim()];

  const segments = rawSegments
    .map(sanitizeComponent)
    .filter((p) => p.length > 0);

  return segments.join('-') + '.pdf';
}

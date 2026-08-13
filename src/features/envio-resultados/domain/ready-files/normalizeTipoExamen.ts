import type { ReadyFileTipo } from './parseReadyFile';

/**
 * Normalize a raw exam-type signal (a `DesTCh` row value, a
 * `tipoExamen` query param, or a FormData field) to the domain union.
 *
 * - `'ADICIONALES'` and `'ADICIONAL'` → `'ADICIONAL'`
 * - `'CAMO'` / `'EMO'` pass through
 * - anything else (garbage, empty, `undefined`) → `undefined`
 *
 * Called ONLY at signal boundaries (routes, UI). The rename helpers
 * trust the typed value and never normalize themselves — this keeps the
 * `'ADICIONALES'` → `'ADICIONAL'` mapping in exactly one place.
 */
export function normalizeTipoExamen(value: string | undefined): ReadyFileTipo | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toUpperCase();
  if (normalized === 'ADICIONAL' || normalized === 'ADICIONALES') return 'ADICIONAL';
  if (normalized === 'CAMO') return 'CAMO';
  if (normalized === 'EMO') return 'EMO';
  return undefined;
}

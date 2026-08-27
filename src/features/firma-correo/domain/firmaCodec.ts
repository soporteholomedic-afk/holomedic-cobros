import type { CampoFirma, FirmaCorreo } from './entities';
import { validateFirmaCorreo } from './validation';

/**
 * JSON codec for the signature row (editor-firmas task 1.3).
 *
 * The five signature fields serialize as JSON inside the `bodyHtml`
 * column of the guest `dbo.templates` row (locked decision D3 — zero
 * schema migration). `v` pins the envelope version for future
 * migrations; decoding is tolerant of unknown extra keys.
 *
 * `decodeFirma` is the read-side safety boundary (threat TM6): parse
 * failure, wrong shape, or a stored row that fails CURRENT validation
 * rules degrades to `null` (= no signature → caller renders the
 * `[Falta configurar firma]` fallback). It never throws on stored
 * data — corrupt rows are treated as absent, not fatal.
 */
const FIRMA_CODEC_VERSION = 1;

/** Field list the codec requires on the wire (order-insensitive). */
const FIRMAS_FIELDS: readonly CampoFirma[] = [
  'nombre',
  'area',
  'correo',
  'telefono',
  'anexo',
];

/** Serialize a validated firma as the v:1 JSON envelope. */
export function encodeFirma(firma: FirmaCorreo): string {
  return JSON.stringify({ v: FIRMA_CODEC_VERSION, ...firma });
}

/**
 * Decode a stored `bodyHtml` into a FirmaCorreo, or `null` when the
 * row holds no usable signature: unparsable JSON, wrong shape, or a
 * value that fails the current validation rules (stale row). The
 * returned entity carries the trimmed, validated values.
 */
export function decodeFirma(bodyHtml: string): FirmaCorreo | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyHtml);
  } catch {
    return null;
  }
  if (!isFirmaShape(parsed)) return null;
  const result = validateFirmaCorreo(parsed);
  return result.ok ? result.value : null;
}

/**
 * Structural check only (all five fields present and string-typed).
 * Field VALUES are enforced by `validateFirmaCorreo`, so a rules
 * change invalidates old rows instead of crashing on them.
 */
function isFirmaShape(value: unknown): value is Record<CampoFirma, string> {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return FIRMAS_FIELDS.every((campo) => typeof record[campo] === 'string');
}

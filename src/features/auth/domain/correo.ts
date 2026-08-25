/**
 * Correo (user email) value validation for the auth domain.
 *
 * Mirrors the practical email pattern already used by the send-email
 * route (design D1) so the codebase keeps ONE canonical format, and
 * bounds the value to the NVARCHAR(200) storage column. Length is
 * enforced post-trim; callers trim for storage, the module trims
 * defensively again (idempotent).
 */
export const CORREO_MAX_LENGTH = 200;

export const CORREO_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidCorreo(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length <= CORREO_MAX_LENGTH && CORREO_PATTERN.test(trimmed);
}

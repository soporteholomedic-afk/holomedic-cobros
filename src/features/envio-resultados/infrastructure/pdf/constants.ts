/**
 * Constants for the PDF compression seam of the consolidated-send
 * pipeline (comprimir-pdfs-consolidados).
 *
 * This file is the SINGLE source of truth for the compression runtime
 * knobs. The adapter (`PdfLibCompressorAdapter`) and the composition
 * root (`route.ts`) MUST import them from here instead of re-declaring
 * the literals or reading the env var directly.
 *
 * Mirrors the `isPdfcliRetryTransientAuthEnabled` precedent in
 * `../informes/constants.ts`: the feature flag is a FUNCTION (not a
 * boolean constant) so the route re-reads it on every request and
 * tests can set the env var per-test.
 */

/**
 * Per-compression timeout budget, in milliseconds, used by the adapter's
 * `Promise.race` guard. 15s comfortably covers the synchronous CPU cost
 * of a pdf-lib load→save on a ≤60 MB buffer while still bounding an async
 * stall. Note the documented design limitation: `Promise.race` cannot
 * preempt synchronous CPU work — the real operational guard is the
 * `PDF_COMPRESSION_ENABLED` kill switch plus the sequential
 * one-file-at-a-time send loop.
 */
export const PDF_COMPRESS_TIMEOUT_MS = 15_000;

/**
 * Read the `PDF_COMPRESSION_ENABLED` kill-switch flag at call time.
 *
 * Env var semantics (spec RF4):
 * - `PDF_COMPRESSION_ENABLED` is honored on every call — unset means ON.
 * - The flag is DISABLED (`false`) only when the trimmed, lowercased
 *   value is exactly `'false'` or `'0'`.
 * - `'true'` / `'1'` are recognized as explicit ON.
 * - Any other non-empty value is treated as garbage: a `console.warn`
 *   is emitted (operator typo guard) and compression stays ON — the
 *   lossless default can never degrade fidelity, so ambiguity fails
 *   toward the feature rather than away from it.
 *
 * Default ON: when the flag is disabled the send pipeline is
 * byte-identical to the legacy behavior, including the legacy 30 MB
 * read-cap ordering (the rollback path for this whole change).
 */
export function isPdfCompressionEnabled(): boolean {
  const raw = process.env.PDF_COMPRESSION_ENABLED;
  if (raw === undefined) {
    return true;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === '') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  console.warn(
    `[pdf/constants] Unrecognized PDF_COMPRESSION_ENABLED value "${raw}" — expected 'false'/'0' to disable. Defaulting to enabled.`,
  );
  return true;
}

/**
 * Which compressor strategy the send pipeline may wire, per spec RF2.
 *
 * - `'lossless'` — DEFAULT. Byte-identical to the historical pipeline
 *   (`PdfLibCompressorAdapter`): output can only be smaller, never
 *   lossy. Requires no clinical sign-off.
 * - `'email'` — opt-in lossy profile (`PdfImageCompressorAdapter`):
 *   DCT image surgery with resize + JPEG re-encode to shrink emailed
 *   copies (~−70.8% on scan-heavy EMOs). Enabling it in production
 *   requires explicit clinical sign-off on legibility.
 */
export type PdfCompressionProfile = 'lossless' | 'email';

/**
 * Read the `PDF_COMPRESSION_PROFILE` selector at call time (spec RF2).
 *
 * Mirrors the `isPdfCompressionEnabled()` precedent in this same file:
 * the profile is a FUNCTION (not a cached constant) so the route
 * re-reads it on every request and tests can set the env var per-test.
 *
 * Env var semantics:
 * - Unset or empty resolves to `'lossless'` — the fidelity default.
 * - `'lossless'` / `'email'` are honored, trimmed and lowercased
 *   (`' EMAIL '` resolves to `'email'`).
 * - Any other value is garbage: a `console.warn` is emitted (operator
 *   typo guard) and the profile fails toward FIDELITY with
 *   `'lossless'` — an ambiguous configuration can never silently
 *   degrade clinical document quality.
 *
 * Note `PDF_COMPRESSION_ENABLED=false` keeps absolute precedence
 * (checked first by the route): with the kill switch off, no
 * compressor is wired at all and this profile is irrelevant.
 */
export function getPdfCompressionProfile(): PdfCompressionProfile {
  const raw = process.env.PDF_COMPRESSION_PROFILE;
  if (raw === undefined || raw.trim() === '') {
    return 'lossless';
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'lossless' || normalized === 'email') {
    return normalized;
  }
  console.warn(
    `[pdf/constants] Unrecognized PDF_COMPRESSION_PROFILE value "${raw}" — expected 'lossless'/'email'. Defaulting to 'lossless'.`,
  );
  return 'lossless';
}

/**
 * Minimum longest pixel side for an embedded DCT image to be ELIGIBLE
 * for email-profile surgery (design §3.1). Scans below this are small
 * enough that lossy re-encoding risks visible degradation for little
 * savings. Initial value — tunable with evidence.
 */
export const PDF_IMAGE_MIN_LONGEST_SIDE_PX = 1000;

/**
 * Minimum DCT stream size, in bytes (~500KB), for an embedded image to
 * be ELIGIBLE for email-profile surgery. Small JPEGs re-encode poorly
 * (block artifacts) and offer negligible savings. Initial value —
 * tunable with evidence.
 */
export const PDF_IMAGE_MIN_DCT_STREAM_BYTES = 512_000;

/**
 * Dimension divisor applied to eligible images during email-profile
 * re-encode: 300 DPI scans become 150 DPI (2480×3456 → 1240×1728) —
 * the measured sweet spot (−70.8% @ q75, exploration #695).
 */
export const PDF_IMAGE_RESIZE_DIVISOR = 2;

/**
 * JPEG quality used by the email-profile re-encode. 75 pairs with the
 * ÷2 resize to produce the measured −70.8% at acceptable legibility;
 * mozjpeg is deliberately OFF so shipped numbers stay the measured
 * numbers (design §3.2 D4).
 */
export const PDF_IMAGE_JPEG_QUALITY = 75;

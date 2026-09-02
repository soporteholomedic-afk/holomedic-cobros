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

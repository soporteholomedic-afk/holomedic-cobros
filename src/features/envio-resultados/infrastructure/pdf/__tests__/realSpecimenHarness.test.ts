/**
 * OPTIONAL real-specimen harness (spec RF8, design §6) — the email-profile
 * adapter against a REAL clinical scan from the SIGLA share.
 *
 * Self-skips via `describe.skipIf` when the specimen is not mounted, so the
 * suite stays green on dev machines / CI without the share. The specimen
 * dir is env-overridable (`PDF_IMAGE_SPECIMEN_DIR`) for local fixtures.
 *
 * INVARIANTS (spec RF6 — archive non-mutation):
 * - READ-ONLY on the share: bytes are loaded into RAM with `readFileSync`
 *   and NEVER written back — the adapter itself is in-RAM only.
 * - ONE test by design: this is a smoke/characterization harness over the
 *   exploration measurement (−70.8% @ 150 DPI q75, obs #695), not a unit
 *   suite — thresholds/dicts/fail-open are pinned by
 *   `PdfImageCompressorAdapter.test.ts` with synthetic fixtures.
 *
 * Specimen provenance: 13.2 MB scan-heavy EMO
 * (`20100192650/70952218/012111628/LEGAJOS/012111628EXPED.pdf`) — the exact
 * file measured during exploration #695. The floor asserted here (>30%)
 * is intentionally far below the measured −70.8%: JPEG re-encode size is
 * encoder-nondeterministic across libvips versions, so the harness pins
 * the CONTRACT (meaningful reduction), not the benchmark number.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PdfImageCompressorAdapter } from '../PdfImageCompressorAdapter';

const SPECIMEN_DIR = process.env.PDF_IMAGE_SPECIMEN_DIR ?? '/mnt/sigla';
const SPECIMEN_RELPATH = join(
  '20100192650',
  '70952218',
  '012111628',
  'LEGAJOS',
  '012111628EXPED.pdf',
);
const SPECIMEN_PATH = join(SPECIMEN_DIR, SPECIMEN_RELPATH);

describe.skipIf(!existsSync(SPECIMEN_PATH))('real specimen harness (email profile)', () => {
  it('shrinks the 13.2MB EMO specimen by more than 30% (read-only, in-RAM)', async () => {
    const original = readFileSync(SPECIMEN_PATH);
    const adapter = new PdfImageCompressorAdapter(60_000);

    const result = await adapter.compress(original);

    // Real email-profile surgery happened (not a fail-open passthrough).
    expect(result.method).toBe('pdf-lib-image-email');
    expect(result.skippedReason).toBeUndefined();

    // Contract floor: meaningful reduction on a scan-heavy specimen.
    const reduction = 1 - result.outputBytes / result.originalBytes;
    console.log(
      `[realSpecimenHarness] ${SPECIMEN_PATH}: ${result.originalBytes} → ${result.outputBytes} bytes (-${(reduction * 100).toFixed(1)}%) in ${result.durationMs}ms`,
    );
    expect(reduction).toBeGreaterThan(0.3);
  }, 120_000);
});

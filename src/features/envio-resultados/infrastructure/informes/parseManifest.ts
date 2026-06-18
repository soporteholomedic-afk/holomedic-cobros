import type { ManifestRow, ManifestRowStatus } from '@/types/informe';

/**
 * Raw shape the CLI is expected to print on stdout. The parser is
 * intentionally permissive: a missing or malformed field is mapped
 * to `'error'` with a descriptive `reason` so the route never has to
 * branch on shape.
 */
interface RawManifestRow {
  idePMe?: unknown;
  arcPla?: unknown;
  file?: unknown;
  status?: unknown;
  reason?: unknown;
}

const VALID_STATUSES: ReadonlySet<ManifestRowStatus> = new Set([
  'success',
  'skipped',
  'failed',
  'error',
]);

/**
 * Coerce a single field to a non-negative integer. Returns `null`
 * when the value cannot be parsed — callers should treat `null` as
 * "field was not provided by the CLI".
 */
function toIntOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toStatusOrError(value: unknown): ManifestRowStatus {
  if (typeof value === 'string' && VALID_STATUSES.has(value as ManifestRowStatus)) {
    return value as ManifestRowStatus;
  }
  return 'error';
}

function toStringOrUndefined(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  return undefined;
}

/**
 * Parse a single manifest row, normalising every field. Returns
 * `null` when the input is not a non-null object so the caller can
 * skip junk rows without try/catch noise.
 */
function parseRow(raw: unknown): ManifestRow | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as RawManifestRow;
  const idePMe = toIntOrNull(r.idePMe);
  if (idePMe === null) return null;

  return {
    idePMe,
    arcPla: toStringOrUndefined(r.arcPla),
    file: toStringOrUndefined(r.file),
    status: toStatusOrError(r.status),
    reason: toStringOrUndefined(r.reason),
  };
}

/**
 * Tally how many rows fall into each bucket. Mirrors the four
 * `ManifestRowStatus` values. Used by the route to populate
 * `summary.generated / failed / skipped` without re-walking the
 * manifest array.
 */
export interface ManifestCounts {
  generated: number;
  failed: number;
  skipped: number;
  errored: number;
}

export function countManifest(rows: readonly ManifestRow[]): ManifestCounts {
  const counts: ManifestCounts = { generated: 0, failed: 0, skipped: 0, errored: 0 };
  for (const row of rows) {
    switch (row.status) {
      case 'success':
        counts.generated += 1;
        break;
      case 'failed':
        counts.failed += 1;
        break;
      case 'skipped':
        counts.skipped += 1;
        break;
      case 'error':
        counts.errored += 1;
        break;
    }
  }
  return counts;
}

export interface ParseManifestResult {
  manifest: ManifestRow[];
  /** CLI exit code. `null` when the caller did not pass one. */
  exitCode: number | null;
}

/**
 * Parse the CLI's stdout into a `ParseManifestResult`. The CLI is
 * expected to write a single JSON object on stdout with the shape:
 *
 *   {
 *     "exitCode": 0,
 *     "rows": [
 *       { "idePMe": 39053, "arcPla": "exa_aud", "file": "012110021_39053_exa_aud.pdf", "status": "success" },
 *       { "idePMe": 39056, "arcPla": "exa_lab", "status": "skipped", "reason": "ya generado" }
 *     ]
 *   }
 *
 * The parser is forgiving: it strips non-object input, drops junk
 * rows, normalises unknown statuses to `'error'`, and always
 * returns an array (empty on total failure). The caller never has
 * to wrap this in try/catch.
 */
export function parseManifest(stdout: string, exitCode: number | null = null): ParseManifestResult {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) {
    return { manifest: [], exitCode };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { manifest: [], exitCode };
  }

  if (parsed === null || typeof parsed !== 'object') {
    return { manifest: [], exitCode };
  }

  const obj = parsed as { rows?: unknown; exitCode?: unknown };
  const rawRows = Array.isArray(obj.rows) ? obj.rows : [];
  const manifest: ManifestRow[] = [];
  for (const raw of rawRows) {
    const row = parseRow(raw);
    if (row !== null) manifest.push(row);
  }

  return { manifest, exitCode };
}

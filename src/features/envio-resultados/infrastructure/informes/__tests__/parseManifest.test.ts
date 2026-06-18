import { describe, it, expect } from 'vitest';
import { parseManifest, countManifest } from '../parseManifest';

describe('parseManifest', () => {
  // ---- Empty / invalid input ----

  it('returns an empty manifest for an empty stdout', () => {
    const result = parseManifest('', 0);
    expect(result.manifest).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  it('returns an empty manifest for a whitespace-only stdout', () => {
    const result = parseManifest('   \n\t  ', 0);
    expect(result.manifest).toEqual([]);
  });

  it('returns an empty manifest when stdout is not valid JSON', () => {
    const result = parseManifest('this is not JSON {', 0);
    expect(result.manifest).toEqual([]);
  });

  it('returns an empty manifest when the top-level value is not an object', () => {
    expect(parseManifest('null', 0).manifest).toEqual([]);
    expect(parseManifest('[]', 0).manifest).toEqual([]);
    expect(parseManifest('42', 0).manifest).toEqual([]);
  });

  // ---- Happy path ----

  it('parses a well-formed manifest with a mix of statuses', () => {
    const stdout = JSON.stringify({
      exitCode: 0,
      rows: [
        { idePMe: 39053, arcPla: 'exa_lab', file: '012110021_39053_exa_lab.pdf', status: 'success' },
        { idePMe: 39056, arcPla: 'exa_aud', file: '012110021_39056_exa_aud.pdf', status: 'success' },
        { idePMe: 39060, arcPla: 'exa_ekg', status: 'skipped', reason: 'ya generado' },
        { idePMe: 39070, arcPla: 'exa_rx', status: 'failed', reason: 'Crystal Reports timeout' },
      ],
    });
    const result = parseManifest(stdout, 0);
    expect(result.exitCode).toBe(0);
    expect(result.manifest).toHaveLength(4);
    expect(result.manifest[2]).toEqual({
      idePMe: 39060,
      arcPla: 'exa_ekg',
      status: 'skipped',
      reason: 'ya generado',
    });
    expect(result.manifest[3].status).toBe('failed');
  });

  // ---- Defensive parsing ----

  it('drops rows missing idePMe', () => {
    const stdout = JSON.stringify({
      rows: [
        { idePMe: 1, arcPla: 'ok', status: 'success' },
        { arcPla: 'no-ide', status: 'success' },
        { idePMe: 'not-a-number', status: 'success' },
      ],
    });
    const result = parseManifest(stdout, 0);
    expect(result.manifest).toHaveLength(1);
    expect(result.manifest[0].idePMe).toBe(1);
  });

  it('maps unknown statuses to "error" but keeps the row', () => {
    const stdout = JSON.stringify({
      rows: [{ idePMe: 1, status: 'something-weird' }],
    });
    const result = parseManifest(stdout, 0);
    expect(result.manifest).toHaveLength(1);
    expect(result.manifest[0].status).toBe('error');
  });

  it('drops non-object rows without throwing', () => {
    const stdout = JSON.stringify({
      rows: [null, 42, 'string', { idePMe: 1, status: 'success' }],
    });
    const result = parseManifest(stdout, 0);
    expect(result.manifest).toHaveLength(1);
  });

  it('returns an empty manifest when the rows key is missing', () => {
    const stdout = JSON.stringify({ exitCode: 0 });
    const result = parseManifest(stdout, 0);
    expect(result.manifest).toEqual([]);
  });

  it('preserves the caller-provided exitCode when the JSON does not carry one', () => {
    const stdout = JSON.stringify({ rows: [{ idePMe: 1, status: 'success' }] });
    expect(parseManifest(stdout, 3).exitCode).toBe(3);
  });
});

describe('countManifest', () => {
  it('tallies each status bucket', () => {
    const rows = [
      { idePMe: 1, status: 'success' as const },
      { idePMe: 2, status: 'success' as const },
      { idePMe: 3, status: 'skipped' as const },
      { idePMe: 4, status: 'failed' as const },
      { idePMe: 5, status: 'error' as const },
      { idePMe: 6, status: 'error' as const },
    ];
    expect(countManifest(rows)).toEqual({
      generated: 2,
      failed: 1,
      skipped: 1,
      errored: 2,
    });
  });

  it('returns all-zero counts for an empty array', () => {
    expect(countManifest([])).toEqual({ generated: 0, failed: 0, skipped: 0, errored: 0 });
  });
});

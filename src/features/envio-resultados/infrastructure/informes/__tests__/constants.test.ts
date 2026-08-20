import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.FILE_SERVER_BASE_PATH = '\\\\172.16.10.12\\sigla';
});

import {
  PDFCLI_RETRY_MAX_ATTEMPTS,
  PDFCLI_RETRY_BACKOFF_MS,
  isPdfcliRetryTransientAuthEnabled,
  buildOutputDir,
} from '../constants';

describe('retry constants', () => {
  it('PDFCLI_RETRY_MAX_ATTEMPTS is 3 (1 initial + 2 retries)', () => {
    expect(PDFCLI_RETRY_MAX_ATTEMPTS).toBe(3);
  });

  it('PDFCLI_RETRY_BACKOFF_MS is a readonly [2000, 4000] tuple', () => {
    expect(PDFCLI_RETRY_BACKOFF_MS).toEqual([2000, 4000]);
    expect(PDFCLI_RETRY_BACKOFF_MS).toHaveLength(2);
  });
});

describe('isPdfcliRetryTransientAuthEnabled', () => {
  const key = 'PDFCLI_RETRY_TRANSIENT_AUTH';
  let original: string | undefined;

  beforeEach(() => {
    original = process.env[key];
    delete process.env[key];
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  });

  it('returns true when the flag is "1"', () => {
    process.env[key] = '1';
    expect(isPdfcliRetryTransientAuthEnabled()).toBe(true);
  });

  it('returns false when the flag is "0" (escape hatch)', () => {
    process.env[key] = '0';
    expect(isPdfcliRetryTransientAuthEnabled()).toBe(false);
  });

  it('returns true when the flag is unset (default ON per spec REQ-3)', () => {
    delete process.env[key];
    expect(isPdfcliRetryTransientAuthEnabled()).toBe(true);
  });

  it('returns true for any value other than "0"', () => {
    process.env[key] = 'true';
    expect(isPdfcliRetryTransientAuthEnabled()).toBe(true);
  });
});

describe('buildOutputDir', () => {
  it('joins the UNC base with ruc/dni/idAten/LEGAJOS using win32 semantics', () => {
    expect(buildOutputDir('20123456789', '12345678', '012110021')).toBe(
      '\\\\172.16.10.12\\sigla\\20123456789\\12345678\\012110021\\LEGAJOS',
    );
  });
});

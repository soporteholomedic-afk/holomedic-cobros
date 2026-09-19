import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.FILE_SERVER_BASE_PATH = '\\\\172.16.10.12\\sigla';
});

import {
  PDFCLI_RETRY_MAX_ATTEMPTS,
  PDFCLI_RETRY_BACKOFF_MS,
  isPdfcliRetryTransientAuthEnabled,
  buildOutputDir,
  getCliDbCredentials,
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

describe('getCliDbCredentials', () => {
  const USER_KEYS = ['PDFCLI_DB_USER', 'HOLOMEDIC_DB_USER', 'DB_USER'] as const;
  const PASS_KEYS = ['PDFCLI_DB_PASSWORD', 'HOLOMEDIC_DB_PASSWORD', 'DB_PASSWORD'] as const;
  const originals = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of [...USER_KEYS, ...PASS_KEYS]) {
      originals.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, value] of originals) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    originals.clear();
  });

  it('prefers the dedicated PDFCLI_DB_* override over the fallback chain', () => {
    process.env.PDFCLI_DB_USER = 'cli-user';
    process.env.PDFCLI_DB_PASSWORD = 'cli-pass';
    process.env.HOLOMEDIC_DB_USER = 'holo-user';
    process.env.HOLOMEDIC_DB_PASSWORD = 'holo-pass';
    process.env.DB_USER = 'db-user';
    process.env.DB_PASSWORD = 'db-pass';
    expect(getCliDbCredentials()).toEqual({ user: 'cli-user', pass: 'cli-pass' });
  });

  it('falls back to HOLOMEDIC_DB_* when PDFCLI_DB_* is unset', () => {
    process.env.HOLOMEDIC_DB_USER = 'holo-user';
    process.env.HOLOMEDIC_DB_PASSWORD = 'holo-pass';
    process.env.DB_USER = 'db-user';
    process.env.DB_PASSWORD = 'db-pass';
    expect(getCliDbCredentials()).toEqual({ user: 'holo-user', pass: 'holo-pass' });
  });

  it('falls back to DB_* when only the legacy prefix is set', () => {
    process.env.DB_USER = 'db-user';
    process.env.DB_PASSWORD = 'db-pass';
    expect(getCliDbCredentials()).toEqual({ user: 'db-user', pass: 'db-pass' });
  });

  it('resolves user and pass independently through their own chains', () => {
    process.env.PDFCLI_DB_USER = 'cli-user';
    process.env.DB_PASSWORD = 'db-pass';
    expect(getCliDbCredentials()).toEqual({ user: 'cli-user', pass: 'db-pass' });
  });

  it('throws naming the user chain variables when no user resolves', () => {
    process.env.DB_PASSWORD = 'db-pass';
    expect(() => getCliDbCredentials()).toThrow(/PDFCLI_DB_USER/);
    expect(() => getCliDbCredentials()).toThrow(/HOLOMEDIC_DB_USER/);
    expect(() => getCliDbCredentials()).toThrow(/DB_USER/);
  });

  it('throws naming the password chain variables when no password resolves', () => {
    process.env.DB_USER = 'db-user';
    expect(() => getCliDbCredentials()).toThrow(/PDFCLI_DB_PASSWORD/);
    expect(() => getCliDbCredentials()).toThrow(/HOLOMEDIC_DB_PASSWORD/);
    expect(() => getCliDbCredentials()).toThrow(/DB_PASSWORD/);
  });

  it('throws when nothing is configured', () => {
    expect(() => getCliDbCredentials()).toThrow();
  });

  it('treats an empty-string override as unset (falls through the chain)', () => {
    process.env.PDFCLI_DB_USER = '';
    process.env.DB_USER = 'db-user';
    process.env.DB_PASSWORD = 'db-pass';
    expect(getCliDbCredentials()).toEqual({ user: 'db-user', pass: 'db-pass' });
  });
});

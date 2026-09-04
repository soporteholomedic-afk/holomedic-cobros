import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PDF_COMPRESS_TIMEOUT_MS,
  isPdfCompressionEnabled,
} from '../constants';

describe('PDF_COMPRESS_TIMEOUT_MS', () => {
  it('is 15 seconds — the per-compression Promise.race budget (design §4)', () => {
    expect(PDF_COMPRESS_TIMEOUT_MS).toBe(15_000);
  });
});

describe('isPdfCompressionEnabled', () => {
  const key = 'PDF_COMPRESSION_ENABLED';
  let original: string | undefined;

  beforeEach(() => {
    original = process.env[key];
    delete process.env[key];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  });

  it('returns true when the env var is unset (default ON per spec RF4)', () => {
    expect(isPdfCompressionEnabled()).toBe(true);
  });

  it('returns false when the env var is "false"', () => {
    process.env[key] = 'false';
    expect(isPdfCompressionEnabled()).toBe(false);
  });

  it('returns false when the env var is "0"', () => {
    process.env[key] = '0';
    expect(isPdfCompressionEnabled()).toBe(false);
  });

  it('returns false for padded/mixed-case " FALSE " (trimmed + lowercased)', () => {
    process.env[key] = ' FALSE ';
    expect(isPdfCompressionEnabled()).toBe(false);
  });

  it('returns true when the env var is "true"', () => {
    process.env[key] = 'true';
    expect(isPdfCompressionEnabled()).toBe(true);
  });

  it('returns true when the env var is "1"', () => {
    process.env[key] = '1';
    expect(isPdfCompressionEnabled()).toBe(true);
  });

  it('warns on a garbage value and defaults ON', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env[key] = 'enabled-please';
    expect(isPdfCompressionEnabled()).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('PDF_COMPRESSION_ENABLED'),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('enabled-please'),
    );
  });

  it('does NOT warn when the env var is unset (default is not a validation problem)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(isPdfCompressionEnabled()).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('re-reads the env var on every call (function, not a cached constant)', () => {
    expect(isPdfCompressionEnabled()).toBe(true);
    process.env[key] = 'false';
    expect(isPdfCompressionEnabled()).toBe(false);
    process.env[key] = '1';
    expect(isPdfCompressionEnabled()).toBe(true);
  });
});

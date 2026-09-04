import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PDF_COMPRESS_TIMEOUT_MS,
  PDF_IMAGE_JPEG_QUALITY,
  PDF_IMAGE_MIN_DCT_STREAM_BYTES,
  PDF_IMAGE_MIN_LONGEST_SIDE_PX,
  PDF_IMAGE_RESIZE_DIVISOR,
  getPdfCompressionProfile,
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

describe('PDF image-surgery thresholds (email profile)', () => {
  it('eligibility floor is 1000px on the longest side (design §3.1)', () => {
    expect(PDF_IMAGE_MIN_LONGEST_SIDE_PX).toBe(1000);
  });

  it('eligibility floor is 512,000 bytes (~500KB) of DCT stream', () => {
    expect(PDF_IMAGE_MIN_DCT_STREAM_BYTES).toBe(512_000);
  });

  it('resize divisor is 2 (300→150 DPI scan halving)', () => {
    expect(PDF_IMAGE_RESIZE_DIVISOR).toBe(2);
  });

  it('JPEG re-encode quality is 75 (measured −70.8% at 150 DPI)', () => {
    expect(PDF_IMAGE_JPEG_QUALITY).toBe(75);
  });
});

describe('getPdfCompressionProfile', () => {
  const key = 'PDF_COMPRESSION_PROFILE';
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

  it('C1: resolves "lossless" when the env var is unset (fidelity default, spec RF2)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getPdfCompressionProfile()).toBe('lossless');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('C2: resolves "email" when the env var is "email"', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env[key] = 'email';
    expect(getPdfCompressionProfile()).toBe('email');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('C3: resolves "email" for padded/mixed-case " EMAIL " (trim + lowercase)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env[key] = ' EMAIL ';
    expect(getPdfCompressionProfile()).toBe('email');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('C4: warns on a garbage value and fails toward fidelity with "lossless"', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env[key] = 'banana';
    expect(getPdfCompressionProfile()).toBe('lossless');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('PDF_COMPRESSION_PROFILE'),
    );
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('banana'));
  });

  it('C5: resolves "lossless" when the env var is explicitly "lossless"', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env[key] = 'lossless';
    expect(getPdfCompressionProfile()).toBe('lossless');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('C6: resolves "lossless" for an empty value (treated as unset)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env[key] = '';
    expect(getPdfCompressionProfile()).toBe('lossless');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('re-reads the env var on every call (function, not a cached constant)', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getPdfCompressionProfile()).toBe('lossless');
    process.env[key] = 'email';
    expect(getPdfCompressionProfile()).toBe('email');
    process.env[key] = 'banana';
    expect(getPdfCompressionProfile()).toBe('lossless');
  });
});

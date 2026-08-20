import { describe, expect, it } from 'vitest';
import { resolveRucEfectivo } from '../resolveRucEfectivo';

describe('resolveRucEfectivo', () => {
  it('returns the nroRuc when it is a real value', () => {
    expect(resolveRucEfectivo('20123456789', '12345678')).toBe('20123456789');
  });

  it('falls back to the dni when nroRuc is the literal string "null" (particular patients)', () => {
    expect(resolveRucEfectivo('null', '70005854')).toBe('70005854');
  });

  it('falls back to the dni when nroRuc is null', () => {
    expect(resolveRucEfectivo(null, '70005854')).toBe('70005854');
  });

  it('falls back to the dni when nroRuc is undefined', () => {
    expect(resolveRucEfectivo(undefined, '70005854')).toBe('70005854');
  });

  it('falls back to the dni when nroRuc is an empty string', () => {
    expect(resolveRucEfectivo('', '70005854')).toBe('70005854');
  });

  it('falls back to the dni when nroRuc is whitespace', () => {
    expect(resolveRucEfectivo('   ', '70005854')).toBe('70005854');
  });

  it('falls back to the dni when nroRuc is "undefined" (case-insensitive)', () => {
    expect(resolveRucEfectivo('Undefined', '70005854')).toBe('70005854');
  });
});
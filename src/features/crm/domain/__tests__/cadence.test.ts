import { describe, expect, it } from 'vitest';

import { agregarMeses, fechaHoy } from '../cadence';

/**
 * Pure date-math contract for the shared 3-month calendar arithmetic
 * (design §3: "DATEADD(month, 3, x) calendar months — descanso (T8→T9)
 * and rechazo cooldown (T14→T15) share the same math") and the
 * Clock → DATE-only boundary helper. `pr12` extends this module with
 * the weekly windows and the 3-strike rules; these two functions are
 * the piece `pr10`'s transition effects need today.
 */
describe('agregarMeses — DATEADD(month) calendar math (design §3)', () => {
  it('adds whole calendar months within a year', () => {
    expect(agregarMeses('2026-03-10', 3)).toBe('2026-06-10');
  });

  it('clamps to the last day when the target month is shorter (Jan 31 → Apr 30)', () => {
    expect(agregarMeses('2026-01-31', 3)).toBe('2026-04-30');
  });

  it('clamps across a non-leap February (Nov 30 + 3m → Feb 28)', () => {
    expect(agregarMeses('2026-11-30', 3)).toBe('2027-02-28');
  });

  it('wraps into the next year (Dec 15 + 3m → Mar 15)', () => {
    expect(agregarMeses('2026-12-15', 3)).toBe('2027-03-15');
  });

  it('keeps month-end when the target month is long enough (Oct 31 + 3m → Jan 31)', () => {
    expect(agregarMeses('2025-10-31', 3)).toBe('2026-01-31');
  });

  it('is pure — the input string is never modified', () => {
    const fecha = '2026-03-10';
    agregarMeses(fecha, 3);
    expect(fecha).toBe('2026-03-10');
  });
});

describe('fechaHoy — injected Clock → DATE-only string (ADR-9 naive wall clock)', () => {
  it('formats the injected clock date as YYYY-MM-DD', () => {
    expect(fechaHoy(() => new Date(2026, 8, 19, 14, 30, 5))).toBe('2026-09-19');
  });

  it('zero-pads month and day', () => {
    expect(fechaHoy(() => new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

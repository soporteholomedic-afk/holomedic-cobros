import { describe, expect, it } from 'vitest';
import {
  diasEntre,
  esFinDeSemana,
  esPasada,
  formatoCorto,
  formatoRelativo,
  mesDe,
  primerDiaHabil,
  semanasDelMes,
  sumarDias,
  sumarDiasHabiles,
  sumarMeses,
  sumarMesesADia,
} from '../fechas';

describe('fechas', () => {
  it('adds calendar days across month and year boundaries', () => {
    expect(sumarDias('2026-10-31', 1)).toBe('2026-11-01');
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28');
    expect(sumarDias('2026-10-31', 7)).toBe('2026-11-07');
  });

  it('adds working days skipping Saturday and Sunday', () => {
    // 2026-10-30 is a Friday, 2026-10-31 a Saturday.
    expect(sumarDiasHabiles('2026-10-30', 1)).toBe('2026-11-02');
    expect(sumarDiasHabiles('2026-10-31', 1)).toBe('2026-11-02');
    expect(sumarDiasHabiles('2026-10-31', 3)).toBe('2026-11-04');
    expect(sumarDiasHabiles('2026-11-02', 3)).toBe('2026-11-05');
  });

  it('tells a past day apart from today and the future', () => {
    expect(esPasada('2026-10-30', '2026-10-31')).toBe(true);
    expect(esPasada('2026-10-31', '2026-10-31')).toBe(false);
    expect(esPasada('2026-11-01', '2026-10-31')).toBe(false);
  });

  it('formats a day like the prototype ("sáb 31 oct")', () => {
    expect(formatoCorto('2026-10-31')).toBe('sáb 31 oct');
    expect(formatoCorto('2026-11-06')).toBe('vie 6 nov');
  });

  it('formats elapsed time like the prototype', () => {
    const ahora = new Date('2026-10-31T16:00:00.000Z');
    expect(formatoRelativo('2026-10-31T15:59:40.000Z', ahora)).toBe('hace un momento');
    expect(formatoRelativo('2026-10-31T15:35:00.000Z', ahora)).toBe('hace 25 min');
    expect(formatoRelativo('2026-10-31T13:00:00.000Z', ahora)).toBe('hace 3 h');
    expect(formatoRelativo('2026-10-29T10:00:00.000Z', ahora)).toBe('hace 2 d');
  });

  it('builds a Monday-first month grid with blanks before the first day', () => {
    // November 2026 starts on a Sunday: six blanks, then 1.
    const semanas = semanasDelMes('2026-11');
    expect(semanas[0]).toEqual([null, null, null, null, null, null, '2026-11-01']);
    expect(semanas[1][0]).toBe('2026-11-02');
    expect(semanas.flat().filter(Boolean)).toHaveLength(30);
    expect(semanas.every((s) => s.length === 7)).toBe(true);
  });

  it('finds weekends, the first working day and the distance between days', () => {
    expect(esFinDeSemana('2026-10-31')).toBe(true);
    expect(esFinDeSemana('2026-10-30')).toBe(false);
    expect(primerDiaHabil('2026-11-01')).toBe('2026-11-02');
    expect(primerDiaHabil('2026-11-04')).toBe('2026-11-04');
    expect(diasEntre('2026-10-30', '2026-11-03')).toBe(4);
    expect(diasEntre('2026-10-30', '2026-10-29')).toBe(-1);
  });

  it('adds months to a day, clamping to the end of a short month', () => {
    expect(sumarMesesADia('2026-11-08', 1)).toBe('2026-12-08');
    expect(sumarMesesADia('2026-01-31', 1)).toBe('2026-02-28');
    expect(sumarMesesADia('2026-03-15', -1)).toBe('2026-02-15');
  });

  it('moves between months', () => {
    expect(mesDe('2026-10-31')).toBe('2026-10');
    expect(sumarMeses('2026-12', 1)).toBe('2027-01');
    expect(sumarMeses('2026-01', -1)).toBe('2025-12');
  });
});

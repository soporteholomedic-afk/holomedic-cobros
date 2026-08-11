import { describe, it, expect } from 'vitest';
import type { OrderRow, SpResultRow } from '@/types/sp-result';
import { resolveMatchingOrder, normalizeFecAte } from '../resolveMatchingOrder';

function makeOrder(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    IdAten: '1001',
    NroRuc: '20100039281',
    NomCFa: 'ACME S.A.',
    NroDId: '12345678',
    FecAte: '17/06/2026',
    ...overrides,
  } as OrderRow;
}

function makeRow(overrides: Partial<Pick<SpResultRow, 'NroDId' | 'FecAte' | 'NumOrd'>> = {}): Pick<
  SpResultRow,
  'NroDId' | 'FecAte' | 'NumOrd'
> {
  return { NroDId: '12345678', FecAte: '17/06/2026', ...overrides };
}

describe('resolveMatchingOrder', () => {
  it('resolves each row to its own order when two orders share DNI and FecAte but differ in NumOrd', () => {
    const orders = [
      makeOrder({ IdAten: '1001', NumOrd: 50001 }),
      makeOrder({ IdAten: '1002', NumOrd: 50002 }),
    ];

    expect(resolveMatchingOrder(orders, makeRow({ NumOrd: 50001 }))?.IdAten).toBe('1001');
    expect(resolveMatchingOrder(orders, makeRow({ NumOrd: 50002 }))?.IdAten).toBe('1002');
  });

  it('treats NumOrd as a plain string key regardless of driver typing (number vs string)', () => {
    const orders = [makeOrder({ IdAten: '1001', NumOrd: 50001 })];

    expect(resolveMatchingOrder(orders, makeRow({ NumOrd: '50001' }))?.IdAten).toBe('1001');
    expect(resolveMatchingOrder(orders, makeRow({ NumOrd: 50001 }))?.IdAten).toBe('1001');
  });

  it('falls back to DNI + FecAte for a legacy row without NumOrd', () => {
    const orders = [
      makeOrder({ IdAten: '1001', FecAte: '15/06/2026' }),
      makeOrder({ IdAten: '1002', FecAte: '17/06/2026' }),
    ];

    expect(resolveMatchingOrder(orders, makeRow({ NumOrd: undefined }))?.IdAten).toBe('1002');
  });

  it('normalizes ISO row dates to dd/MM/yyyy before the DNI + FecAte fallback', () => {
    const orders = [makeOrder({ IdAten: '1001', FecAte: '17/06/2026' })];

    expect(resolveMatchingOrder(orders, makeRow({ FecAte: '2026-06-17', NumOrd: undefined }))?.IdAten).toBe('1001');
  });

  it('falls back to DNI only when no order shares the date', () => {
    const orders = [
      makeOrder({ IdAten: '1001', NroDId: '99999999', FecAte: '15/06/2026' }),
      makeOrder({ IdAten: '1002', FecAte: '15/06/2026' }),
    ];

    expect(resolveMatchingOrder(orders, makeRow({ NumOrd: undefined }))?.IdAten).toBe('1002');
  });

  it('returns undefined when NumOrd is explicit but unmatched, instead of falling back', () => {
    const orders = [makeOrder({ IdAten: '1001', NumOrd: 50001 })];

    expect(resolveMatchingOrder(orders, makeRow({ NumOrd: 99999 }))).toBeUndefined();
  });

  it('treats blank NumOrd as absent and uses the fallback', () => {
    const orders = [makeOrder({ IdAten: '1001', NumOrd: 50001 })];

    expect(resolveMatchingOrder(orders, makeRow({ NumOrd: '' }))?.IdAten).toBe('1001');
    expect(resolveMatchingOrder(orders, makeRow({ NumOrd: '  ' }))?.IdAten).toBe('1001');
  });

  it('returns undefined when nothing matches', () => {
    expect(resolveMatchingOrder([], makeRow({ NumOrd: undefined }))).toBeUndefined();
  });
});

describe('normalizeFecAte', () => {
  it('passes dd/MM/yyyy through unchanged', () => {
    expect(normalizeFecAte('17/06/2026')).toBe('17/06/2026');
  });

  it('converts ISO dates using UTC parts', () => {
    expect(normalizeFecAte('2026-06-17')).toBe('17/06/2026');
  });

  it('returns empty string for blank or unparseable input', () => {
    expect(normalizeFecAte('')).toBe('');
    expect(normalizeFecAte(undefined)).toBe('');
    expect(normalizeFecAte('not-a-date')).toBe('');
  });
});

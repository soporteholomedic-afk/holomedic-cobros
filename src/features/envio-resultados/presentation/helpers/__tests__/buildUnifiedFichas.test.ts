import { describe, it, expect } from 'vitest';
import type { UnifiedFicha } from '@/types/sp-result';
import { buildUnifiedFichas } from '../buildUnifiedFichas';

interface WorkerFixture {
  proyecto: string;
  tipoExamen: string;
  condic: string;
  numOrd?: number | string | null;
}

interface OrderFixture {
  idAten: string;
  nroRuc: string;
  nomCFa: string;
  fecAte: string;
  numOrd?: number | string | null;
}

function makeWorker(overrides: Partial<WorkerFixture> = {}): WorkerFixture {
  return { proyecto: 'UNACEM', tipoExamen: 'PERIODICO', condic: 'APTO', ...overrides };
}

function makeOrder(overrides: Partial<OrderFixture> = {}): OrderFixture {
  return { idAten: 'ATE-001', nroRuc: '20100039281', nomCFa: 'ACME S.A.', fecAte: '17/06/2026', ...overrides };
}

/** Full expected ficha for byte-identity locks: every field asserted exactly. */
function expectedFicha(overrides: Partial<UnifiedFicha> = {}): UnifiedFicha {
  return { idAten: '', nroRuc: '', nomCFa: '', fecAte: '', proyecto: '', tipoExamen: '', condic: '', ...overrides };
}

/** The default makeWorker()+makeOrder() pair as one combined ficha. */
const FULL_FICHA = expectedFicha({
  idAten: 'ATE-001', nroRuc: '20100039281', nomCFa: 'ACME S.A.', fecAte: '17/06/2026',
  proyecto: 'UNACEM', tipoExamen: 'PERIODICO', condic: 'APTO',
});

describe('buildUnifiedFichas', () => {
  // ---- S-101.1: shuffled NumOrd pairing ----

  it('pairs worker and order rows by NumOrd even when array order is shuffled (S-101.1)', () => {
    const fichas = buildUnifiedFichas(
      [
        makeWorker({ proyecto: 'MINSUR', tipoExamen: 'PREOCUPACIONAL', condic: 'NO APTO', numOrd: 7 }),
        makeWorker({ proyecto: 'NEXA RESOURCES CAJAMARQUILLA', numOrd: 5 }),
      ],
      [
        makeOrder({ idAten: 'ATE-NEX', nroRuc: '20500000001', nomCFa: 'NEXA CO', fecAte: '01/06/2026', numOrd: ' 5 ' }),
        makeOrder({ idAten: 'ATE-MIN', nroRuc: '20500000002', nomCFa: 'MINSUR CO', fecAte: '02/06/2026', numOrd: 7 }),
      ],
    );
    expect(fichas).toHaveLength(2);
    expect(fichas.find((f) => f.idAten === 'ATE-NEX')).toMatchObject({ proyecto: 'NEXA RESOURCES CAJAMARQUILLA', tipoExamen: 'PERIODICO', nroRuc: '20500000001', fecAte: '01/06/2026' });
    expect(fichas.find((f) => f.idAten === 'ATE-MIN')).toMatchObject({ proyecto: 'MINSUR', tipoExamen: 'PREOCUPACIONAL', condic: 'NO APTO', nroRuc: '20500000002', fecAte: '02/06/2026' });
  });

  it('matches number and string NumOrd forms interchangeably through trimmed-string keys', () => {
    const fichas = buildUnifiedFichas([makeWorker({ proyecto: 'NEXA', numOrd: 50001 })], [makeOrder({ idAten: 'ATE-S', numOrd: '50001' })]);
    expect(fichas).toHaveLength(1);
    expect(fichas[0]).toMatchObject({ proyecto: 'NEXA', idAten: 'ATE-S' });
  });

  // ---- S-101.2: legacy positional characterization (NumOrd absent on either side) ----

  it('reproduces the legacy positional zip when NumOrd is absent on both sides (S-101.2)', () => {
    const fichas = buildUnifiedFichas(
      [makeWorker({ proyecto: 'NEXA' }), makeWorker({ proyecto: 'MINSUR' })],
      [makeOrder({ idAten: 'ATE-1' }), makeOrder({ idAten: 'ATE-2', nroRuc: '20500000002' })],
    );
    expect(fichas).toEqual([
      { ...FULL_FICHA, idAten: 'ATE-1', proyecto: 'NEXA' },
      expectedFicha({ idAten: 'ATE-2', nroRuc: '20500000002', nomCFa: 'ACME S.A.', fecAte: '17/06/2026', proyecto: 'MINSUR', tipoExamen: 'PERIODICO', condic: 'APTO' }),
    ]);
  });

  it('falls back to the positional zip when keys exist only on the worker side', () => {
    const fichas = buildUnifiedFichas(
      [makeWorker({ proyecto: 'NEXA', numOrd: 5 }), makeWorker({ proyecto: 'MINSUR', numOrd: 7 })],
      [makeOrder({ idAten: 'ATE-1', numOrd: undefined }), makeOrder({ idAten: 'ATE-2', numOrd: null })],
    );
    expect(fichas).toHaveLength(2);
    expect(fichas[0]).toMatchObject({ proyecto: 'NEXA', idAten: 'ATE-1' });
    expect(fichas[1]).toMatchObject({ proyecto: 'MINSUR', idAten: 'ATE-2' });
  });

  it('keeps the legacy one-worker-many-orders zip: worker pairs with the first order, rest stay pure-order', () => {
    const fichas = buildUnifiedFichas(
      [makeWorker({ proyecto: 'NEXA' })],
      [makeOrder({ idAten: 'ATE-1' }), makeOrder({ idAten: 'ATE-2', nroRuc: '20500000002' })],
    );
    expect(fichas).toEqual([
      { ...FULL_FICHA, idAten: 'ATE-1', proyecto: 'NEXA' },
      expectedFicha({ idAten: 'ATE-2', nroRuc: '20500000002', nomCFa: 'ACME S.A.', fecAte: '17/06/2026' }),
    ]);
  });

  it('keeps the legacy many-workers-one-order zip: first worker pairs, second stays worker-only', () => {
    const fichas = buildUnifiedFichas(
      [makeWorker({ proyecto: 'NEXA' }), makeWorker({ proyecto: 'MINSUR', tipoExamen: 'PREOCUPACIONAL' })],
      [makeOrder({ idAten: 'ATE-1' })],
    );
    expect(fichas).toEqual([
      { ...FULL_FICHA, idAten: 'ATE-1', proyecto: 'NEXA' },
      expectedFicha({ proyecto: 'MINSUR', tipoExamen: 'PREOCUPACIONAL', condic: 'APTO' }),
    ]);
  });

  // ---- S-101.3: single-ficha regression lock ----

  it('keeps the single-ficha output identical to today (S-101.3)', () => {
    expect(buildUnifiedFichas([makeWorker()], [makeOrder()])).toEqual([FULL_FICHA]);
  });

  // ---- Mixed keys: keyed pairing first, then first-unconsumed fill ----

  it('pairs keyed rows first and fills keyless workers with the first unconsumed order', () => {
    const fichas = buildUnifiedFichas(
      [makeWorker({ proyecto: 'MINSUR', numOrd: undefined }), makeWorker({ proyecto: 'NEXA', numOrd: 'X-9' })],
      [makeOrder({ idAten: 'ATE-X', numOrd: 'X-9' }), makeOrder({ idAten: 'ATE-N' })],
    );
    expect(fichas).toHaveLength(2);
    expect(fichas[0]).toMatchObject({ proyecto: 'MINSUR', idAten: 'ATE-N', nroRuc: '20100039281' });
    expect(fichas[1]).toMatchObject({ proyecto: 'NEXA', idAten: 'ATE-X' });
  });

  // ---- Unmatched worker key: positional fallback, cardinality preserved ----

  it('gives an unmatched-key worker the first unconsumed order instead of dropping the ficha', () => {
    const fichas = buildUnifiedFichas(
      [makeWorker({ proyecto: 'NEXA', numOrd: 999 })],
      [makeOrder({ idAten: 'ATE-1' }), makeOrder({ idAten: 'ATE-2', nroRuc: '20500000002' })],
    );
    expect(fichas).toHaveLength(2);
    expect(fichas[0]).toMatchObject({ proyecto: 'NEXA', idAten: 'ATE-1' });
    expect(fichas[1]).toMatchObject({ idAten: 'ATE-2', proyecto: '' });
  });

  it('keeps ficha cardinality when a keyed order is claimed by another worker (unmatched worker stays empty)', () => {
    const fichas = buildUnifiedFichas(
      [makeWorker({ proyecto: 'NEXA', numOrd: 999 }), makeWorker({ proyecto: 'MINSUR', numOrd: 7 })],
      [makeOrder({ idAten: 'ATE-MIN', numOrd: 7 })],
    );
    expect(fichas).toHaveLength(2);
    expect(fichas[0]).toMatchObject({ proyecto: 'NEXA', idAten: '', nroRuc: '', fecAte: '' });
    expect(fichas[1]).toMatchObject({ proyecto: 'MINSUR', idAten: 'ATE-MIN' });
  });

  // ---- Leftover orders append as pure-order fichas ----

  it('appends leftover orders as pure-order fichas after the paired workers', () => {
    const fichas = buildUnifiedFichas(
      [makeWorker({ proyecto: 'NEXA' })],
      [makeOrder({ idAten: 'ATE-1' }), makeOrder({ idAten: 'ATE-2', nroRuc: '20500000002' }), makeOrder({ idAten: 'ATE-3', nroRuc: '20500000003' })],
    );
    expect(fichas).toHaveLength(3);
    expect(fichas[0]).toMatchObject({ proyecto: 'NEXA', idAten: 'ATE-1' });
    expect(fichas[1]).toMatchObject({ idAten: 'ATE-2', proyecto: '', tipoExamen: '', condic: '' });
    expect(fichas[2]).toMatchObject({ idAten: 'ATE-3', proyecto: '', tipoExamen: '', condic: '' });
  });

  // ---- Worker-only / order-only ----

  it('emits worker-only fichas when there are more workers than orders', () => {
    const fichas = buildUnifiedFichas([makeWorker({ proyecto: 'NEXA' }), makeWorker({ proyecto: 'MINSUR' })], []);
    expect(fichas).toHaveLength(2);
    expect(fichas[0]).toMatchObject({ proyecto: 'NEXA', idAten: '', nroRuc: '', fecAte: '' });
    expect(fichas[1]).toMatchObject({ proyecto: 'MINSUR', idAten: '', nroRuc: '', fecAte: '' });
  });

  it('keeps the legacy zero-ficha output for a lone worker with no orders', () => {
    expect(buildUnifiedFichas([makeWorker()], [])).toEqual([]);
  });

  it('emits pure-order fichas when there are no workers', () => {
    const fichas = buildUnifiedFichas([], [makeOrder({ idAten: 'ATE-1' }), makeOrder({ idAten: 'ATE-2', nroRuc: '20500000002' })]);
    expect(fichas).toHaveLength(2);
    expect(fichas[0]).toMatchObject({ idAten: 'ATE-1', proyecto: '', condic: '' });
    expect(fichas[1]).toMatchObject({ idAten: 'ATE-2', proyecto: '', condic: '' });
  });

  it('returns an empty array for empty inputs', () => {
    expect(buildUnifiedFichas([], [])).toEqual([]);
  });
});

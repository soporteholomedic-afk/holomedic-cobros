import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { JjcEvaluacion } from '@/types/jjc';

// ---- In-memory store ----

interface FakeRow {
  idAtencion: string;
  fechaEvaluacion: string;
  lugar: string;
  fototipo: string;
  observaciones: string | null;
  lesionesJson: string;
}

const store = new Map<string, FakeRow>();

// Build a chained fake request. Each call to .input() records the value
// and returns the same fakeRequest so the .query() chain works.
function makeFakeRequest() {
  const ctx: Record<string, unknown> = {};

  const fakeRequest = {
    input: vi.fn((name: string, _type: unknown, value: unknown) => {
      ctx[name] = value;
      return fakeRequest;
    }),
    query: vi.fn(async (sql: string) => {
      if (sql.includes('MERGE')) {
        const row: FakeRow = {
          idAtencion: ctx.idAtencion as string,
          fechaEvaluacion:
            ctx.fechaEvaluacion instanceof Date
              ? ctx.fechaEvaluacion.toISOString().slice(0, 10)
              : String(ctx.fechaEvaluacion),
          lugar: ctx.lugar as string,
          fototipo: ctx.fototipo as string,
          observaciones: (ctx.observaciones as string) || null,
          lesionesJson: ctx.lesionesJson as string,
        };
        store.set(row.idAtencion, row);
        return { recordset: [], rowsAffected: [1] };
      }

      if (sql.includes('SELECT') && sql.includes('dbo.JjcEvaluacion')) {
        const id = ctx.idAtencion as string;
        const row = store.get(id);
        if (!row) return { recordset: [] };
        return {
          recordset: [
            {
              idAtencion: row.idAtencion,
              fechaEvaluacion: new Date(row.fechaEvaluacion),
              lugar: row.lugar,
              fototipo: row.fototipo,
              observaciones: row.observaciones,
              lesionesJson: row.lesionesJson,
            },
          ],
        };
      }

      return { recordset: [] };
    }),
  };

  return fakeRequest;
}

const fakePool = {
  request: vi.fn(() => makeFakeRequest()),
  connect: vi.fn().mockResolvedValue(undefined),
  close: vi.fn(),
};

vi.mock('@/lib/db', () => ({
  getHolomedicPool: vi.fn().mockResolvedValue(fakePool),
}));

const { SqlServerJjcEvaluacionRepository } = await import('../JjcEvaluacionRepository');

const sampleEval: JjcEvaluacion = {
  idAtencion: '01001000001',
  fechaEvaluacion: '2026-07-20',
  lugar: 'HOLOMEDIC',
  fototipo: 'III-IV',
  observaciones: 'Paciente con pecas en mejillas',
  lesiones: [
    { id: 'p1', type: 'P', x: 0.5, y: 0.3 },
    { id: 'p2', type: 'L', x: 0.7, y: 0.6 },
  ],
};

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
});

describe('SqlServerJjcEvaluacionRepository', () => {
  it('save → loadByAtencion round-trip', async () => {
    const repo = new SqlServerJjcEvaluacionRepository();

    await repo.save(sampleEval);
    const loaded = await repo.loadByAtencion('01001000001');

    expect(loaded).not.toBeNull();
    expect(loaded!.idAtencion).toBe('01001000001');
    expect(loaded!.fototipo).toBe('III-IV');
    expect(loaded!.observaciones).toBe('Paciente con pecas en mejillas');
    expect(loaded!.lesiones).toHaveLength(2);
    expect(loaded!.lesiones[0].type).toBe('P');
    expect(loaded!.lesiones[1].type).toBe('L');
  });

  it('loadByAtencion returns null for unknown id', async () => {
    const repo = new SqlServerJjcEvaluacionRepository();
    const loaded = await repo.loadByAtencion('unknown');
    expect(loaded).toBeNull();
  });

  it('upsert — second save overwrites first', async () => {
    const repo = new SqlServerJjcEvaluacionRepository();

    await repo.save(sampleEval);

    const updated: JjcEvaluacion = {
      ...sampleEval,
      fototipo: 'V-VI',
      observaciones: 'Actualizado',
      lesiones: [],
    };
    await repo.save(updated);

    const loaded = await repo.loadByAtencion('01001000001');
    expect(loaded!.fototipo).toBe('V-VI');
    expect(loaded!.observaciones).toBe('Actualizado');
    expect(loaded!.lesiones).toHaveLength(0);
  });

  it('handles empty observaciones gracefully on load', async () => {
    const repo = new SqlServerJjcEvaluacionRepository();
    const evalNoObs: JjcEvaluacion = { ...sampleEval, observaciones: '' };

    await repo.save(evalNoObs);
    const loaded = await repo.loadByAtencion('01001000001');

    expect(loaded!.observaciones).toBe('');
  });
});

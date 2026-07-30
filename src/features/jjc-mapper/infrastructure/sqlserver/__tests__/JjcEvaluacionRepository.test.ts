import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { JjcEvaluacion } from '@/types/jjc';

// ---- In-memory store ----
// Combined row from Evaluacion (generic) JOIN EvaluacionMedicina (medicina-specific).

interface FakeRow {
  idAtencion: string;
  area: string;
  fechaEvaluacion: string;
  lugar: string;
  fototipo: string;
  fotoprotector: string | null;
  observaciones: string | null;
  lesionesJson: string;
  preguntasJson: string | null;
  createdBy: string | null;
}

const store = new Map<string, FakeRow>();

// FakeRequest mimics the chained .input() → .query() API. Inputs are stored
// in a private context and the SQL is parsed to decide between MERGE (upsert)
// and SELECT (lookup) branches.
class FakeRequest {
  private ctx: Record<string, unknown> = {};
  constructor(private readonly sharedCtx?: Record<string, unknown>) {}
  input(name: string, _type: unknown, value: unknown): this {
    this.ctx[name] = value;
    if (this.sharedCtx) this.sharedCtx[name] = value;
    return this;
  }
  async query(sql: string) {
    if (sql.includes('MERGE')) {
      // MERGE may target either Evaluacion (generic) or EvaluacionMedicina
      // (medicina-specific). Use whichever fields are present in ctx; the
      // repository issues both statements within a single transaction so
      // they share the same logical row by (idAtencion, area).
      const src = { ...(this.sharedCtx ?? {}), ...this.ctx };
      const key = `${src.idAtencion}:${src.area}`;
      const existing = store.get(key);
      const row: FakeRow = {
        idAtencion: src.idAtencion as string,
        area: src.area as string,
        fechaEvaluacion: existing?.fechaEvaluacion ?? (
          src.fechaEvaluacion instanceof Date
            ? (src.fechaEvaluacion as Date).toISOString().slice(0, 10)
            : String(src.fechaEvaluacion ?? '')
        ),
        lugar: existing?.lugar ?? (src.lugar as string | undefined) ?? 'HOLOMEDIC',
        fototipo: (src.fototipo as string | undefined) ?? existing?.fototipo ?? 'unknown',
        fotoprotector: (src.fotoprotector as string | undefined) ?? existing?.fotoprotector ?? null,
        observaciones: (src.observaciones as string | undefined) ?? existing?.observaciones ?? null,
        lesionesJson: (src.lesionesJson as string | undefined) ?? existing?.lesionesJson ?? '[]',
        preguntasJson: (src.preguntasJson as string | undefined) ?? existing?.preguntasJson ?? null,
        createdBy: (src.createdBy as string | undefined) ?? existing?.createdBy ?? null,
      };
      store.set(key, row);
      return { recordset: [], rowsAffected: [1] };
    }

    if (sql.includes('SELECT') && sql.includes('dbo.Evaluacion')) {
      const id = this.ctx.idAtencion as string;
      const area = this.ctx.area as string;
      const row = store.get(`${id}:${area}`);
      if (!row) return { recordset: [] };
      return {
        recordset: [
          {
            idAtencion: row.idAtencion,
            area: row.area,
            fechaEvaluacion: new Date(row.fechaEvaluacion),
            lugar: row.lugar,
            fototipo: row.fototipo,
            fotoprotector: row.fotoprotector,
            observaciones: row.observaciones,
            lesionesJson: row.lesionesJson,
            preguntasJson: row.preguntasJson,
            createdBy: row.createdBy,
          },
        ],
      };
    }

    return { recordset: [] };
  }
}

// FakeTransaction supports begin/commit/rollback. Requests inside the
// transaction share a private context so the two MERGEs (Evaluacion +
// EvaluacionMedicina) contribute fields to the same logical row.
class FakeTransaction {
  private sharedCtx: Record<string, unknown> = {};
  begin(): Promise<void> { return Promise.resolve(); }
  commit(): Promise<void> { return Promise.resolve(); }
  rollback(): Promise<void> { return Promise.resolve(); }
  request(): FakeRequest { return new FakeRequest(this.sharedCtx); }
}

const fakePool = {
  request: vi.fn(() => new FakeRequest()),
  connect: vi.fn().mockResolvedValue(undefined),
  close: vi.fn(),
};

vi.mock('@/lib/db', () => ({
  getHolomedicPool: vi.fn().mockResolvedValue(fakePool),
}));

// Mock mssql to provide our FakeRequest / FakeTransaction. The type
// constructors (VarChar, NVarChar, Date, DateTime, MAX) are no-op markers
// for the test — the fake just records names, not values.
const mssqlMock = {
  Request: FakeRequest,
  Transaction: FakeTransaction,
  VarChar: (n: number) => ({ __varchar: n }),
  NVarChar: (n: number) => ({ __nvarchar: n }),
  Date: () => ({ __date: true }),
  DateTime: () => ({ __datetime: true }),
  MAX: Number.MAX_SAFE_INTEGER,
};
vi.mock('mssql', () => ({ ...mssqlMock, default: mssqlMock }));

const { SqlServerJjcEvaluacionRepository } = await import('../JjcEvaluacionRepository');

const sampleEval: JjcEvaluacion = {
  idAtencion: '01001000001',
  area: 'medicina',
  fechaEvaluacion: '2026-07-20',
  lugar: 'HOLOMEDIC',
  fototipo: 'III-IV',
  fotoprotector: 'FPS recomendado +65',
  observaciones: 'Paciente con pecas en mejillas',
  lesiones: [
    { id: 'p1', type: 'P', x: 0.5, y: 0.3 },
    { id: 'p2', type: 'L', x: 0.7, y: 0.6 },
  ],
  preguntas: null,
  createdBy: null,
};

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
});

describe('SqlServerJjcEvaluacionRepository', () => {
  it('save → loadByAtencion round-trip', async () => {
    const repo = new SqlServerJjcEvaluacionRepository();

    await repo.save(sampleEval);
    const loaded = await repo.loadByAtencion('01001000001', 'medicina');

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
    const loaded = await repo.loadByAtencion('unknown', 'medicina');
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

    const loaded = await repo.loadByAtencion('01001000001', 'medicina');
    expect(loaded!.fototipo).toBe('V-VI');
    expect(loaded!.observaciones).toBe('Actualizado');
    expect(loaded!.lesiones).toHaveLength(0);
  });

  it('handles empty observaciones gracefully on load', async () => {
    const repo = new SqlServerJjcEvaluacionRepository();
    const evalNoObs: JjcEvaluacion = { ...sampleEval, observaciones: '' };

    await repo.save(evalNoObs);
    const loaded = await repo.loadByAtencion('01001000001', 'medicina');

    expect(loaded!.observaciones).toBe('');
  });
});

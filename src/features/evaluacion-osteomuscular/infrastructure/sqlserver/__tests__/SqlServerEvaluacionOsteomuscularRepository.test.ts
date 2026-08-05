import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EvaluacionOsteomuscular } from '@/types/evaluacion-osteomuscular';
import { initialEvaluacionState } from '@/features/evaluacion-osteomuscular/presentation/hooks/useEvaluacionOsteomuscular';
import { SqlServerEvaluacionOsteomuscularRepository } from '../SqlServerEvaluacionOsteomuscularRepository';

/**
 * Fakes hoisted so they can be referenced from the (hoisted) vi.mock factory.
 * `state.store` simulates `dbo.EvaluacionMusculoEsqueletica`
 * (idAtencion|area → JSON).
 */
const fakes = vi.hoisted(() => {
  const state = { store: new Map<string, string>() };

  class FakeRequest {
    private inputs: Record<string, unknown> = {};

    input(name: string, _type: unknown, value: unknown): FakeRequest {
      this.inputs[name] = value;
      return this;
    }

    async query(sql: string): Promise<{ recordset: Array<{ evaluacionJson: string | null }> }> {
      if (sql.includes('MERGE dbo.EvaluacionMusculoEsqueletica')) {
        state.store.set(
          `${this.inputs.idAtencion}|${this.inputs.area}`,
          this.inputs.evaluacionJson as string,
        );
        return { recordset: [] };
      }

      if (sql.includes('MERGE dbo.Evaluacion')) {
        return { recordset: [] };
      }

      if (sql.includes('SELECT') && sql.includes('EvaluacionMusculoEsqueletica')) {
        const json = state.store.get(`${this.inputs.idAtencion}|${this.inputs.area}`);
        return { recordset: json ? [{ evaluacionJson: json }] : [] };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    }
  }

  class FakeTransaction {
    async begin(): Promise<void> {}
    async commit(): Promise<void> {}
    async rollback(): Promise<void> {}
  }

  const fakePool = {
    connect: async () => undefined,
    request: () => new FakeRequest(),
  };

  return { state, FakeRequest, FakeTransaction, fakePool };
});

vi.mock('mssql', () => ({
  default: {
    Transaction: fakes.FakeTransaction,
    Request: fakes.FakeRequest,
    VarChar: () => ({}),
    NVarChar: () => ({}),
    Date: () => ({}),
    DateTime: () => ({}),
    MAX: 'MAX',
  },
}));

vi.mock('@/lib/db', () => ({
  getHolomedicPool: vi.fn().mockResolvedValue(fakes.fakePool),
}));

function buildEvaluacion(): EvaluacionOsteomuscular {
  const evaluacion = initialEvaluacionState(null);
  evaluacion.idAtencion = 'AT-1001';
  evaluacion.evaluacionClinicaOsteomuscular.miembrosSuperiores.codo.gravedadPatologiaCodo = 'GRAVE';
  evaluacion.aproximacionDiagnosticaEvaluacion = 'Síndrome de túnel carpiano';
  return evaluacion;
}

describe('SqlServerEvaluacionOsteomuscularRepository', () => {
  beforeEach(() => {
    fakes.state.store = new Map();
  });

  it('save + loadByAtencion round-trip preserva el JSON de la evaluación', async () => {
    const repo = new SqlServerEvaluacionOsteomuscularRepository();
    const evaluacion = buildEvaluacion();

    await repo.save(evaluacion);
    const loaded = await repo.loadByAtencion('AT-1001');

    expect(loaded).not.toBeNull();
    expect(loaded?.idAtencion).toBe('AT-1001');
    expect(loaded?.evaluacionClinicaOsteomuscular.miembrosSuperiores.codo.gravedadPatologiaCodo).toBe('GRAVE');
    expect(loaded?.aproximacionDiagnosticaEvaluacion).toBe('Síndrome de túnel carpiano');
  });

  it('save es idempotente: la segunda escritura sobrescribe la primera', async () => {
    const repo = new SqlServerEvaluacionOsteomuscularRepository();

    await repo.save(buildEvaluacion());

    const segunda = buildEvaluacion();
    segunda.aproximacionDiagnosticaEvaluacion = 'Lumbalgia mecánica';
    await repo.save(segunda);

    const loaded = await repo.loadByAtencion('AT-1001');
    expect(loaded?.aproximacionDiagnosticaEvaluacion).toBe('Lumbalgia mecánica');
  });

  it('loadByAtencion devuelve null cuando no existe registro', async () => {
    const repo = new SqlServerEvaluacionOsteomuscularRepository();
    const loaded = await repo.loadByAtencion('AT-INEXISTENTE');
    expect(loaded).toBeNull();
  });

  it('loadByAtencion devuelve null con JSON corrupto', async () => {
    fakes.state.store.set('AT-1001|musculoesqueletica', '{corrupto');
    const repo = new SqlServerEvaluacionOsteomuscularRepository();

    const loaded = await repo.loadByAtencion('AT-1001');
    expect(loaded).toBeNull();
  });
});

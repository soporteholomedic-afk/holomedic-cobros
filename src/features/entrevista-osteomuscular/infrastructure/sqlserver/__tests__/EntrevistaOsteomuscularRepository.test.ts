import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntrevistaOsteomuscular } from '@/types/entrevista-osteomuscular';
import { initialEntrevistaState } from '@/features/entrevista-osteomuscular/presentation/hooks/useEntrevistaOsteomuscular';
import { SqlServerEntrevistaOsteomuscularRepository } from '../EntrevistaOsteomuscularRepository';

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

    async query(sql: string): Promise<{ recordset: Array<{ entrevistaJson: string | null }> }> {
      if (sql.includes('MERGE dbo.EvaluacionMusculoEsqueletica')) {
        state.store.set(
          `${this.inputs.idAtencion}|${this.inputs.area}`,
          this.inputs.entrevistaJson as string,
        );
        return { recordset: [] };
      }

      if (sql.includes('MERGE dbo.Evaluacion')) {
        return { recordset: [] };
      }

      if (sql.includes('SELECT') && sql.includes('EvaluacionMusculoEsqueletica')) {
        const json = state.store.get(`${this.inputs.idAtencion}|${this.inputs.area}`);
        return { recordset: json ? [{ entrevistaJson: json }] : [] };
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

function buildEntrevista(): EntrevistaOsteomuscular {
  const entrevista = initialEntrevistaState(null);
  entrevista.idAtencion = 'AT-1001';
  entrevista.columna.cervical.irradiacion.detalleIrradiacion = 'Hombro derecho';
  entrevista.columna.dorsal.irradiacion.detalleIrradiacion = 'Región escapular';
  entrevista.columna.lumboSacra.irradiacion.detalleIrradiacion = 'Ciática izquierda';
  return entrevista;
}

describe('SqlServerEntrevistaOsteomuscularRepository', () => {
  beforeEach(() => {
    fakes.state.store = new Map();
  });

  it('save + loadByAtencion round-trip preserva el JSON de la entrevista', async () => {
    const repo = new SqlServerEntrevistaOsteomuscularRepository();
    const entrevista = buildEntrevista();

    await repo.save(entrevista);
    const loaded = await repo.loadByAtencion('AT-1001');

    expect(loaded).not.toBeNull();
    expect(loaded?.idAtencion).toBe('AT-1001');
    expect(loaded?.columna.cervical.irradiacion.detalleIrradiacion).toBe('Hombro derecho');
    expect(loaded?.columna.dorsal.irradiacion.detalleIrradiacion).toBe('Región escapular');
    expect(loaded?.columna.lumboSacra.irradiacion.detalleIrradiacion).toBe('Ciática izquierda');
  });

  it('save es idempotente: la segunda escritura sobrescribe la primera', async () => {
    const repo = new SqlServerEntrevistaOsteomuscularRepository();

    await repo.save(buildEntrevista());

    const segunda = buildEntrevista();
    segunda.columna.cervical.irradiacion.detalleIrradiacion = 'Brazo izquierdo';
    await repo.save(segunda);

    const loaded = await repo.loadByAtencion('AT-1001');
    expect(loaded?.columna.cervical.irradiacion.detalleIrradiacion).toBe('Brazo izquierdo');
  });

  it('loadByAtencion devuelve null cuando no existe registro', async () => {
    const repo = new SqlServerEntrevistaOsteomuscularRepository();
    const loaded = await repo.loadByAtencion('AT-INEXISTENTE');
    expect(loaded).toBeNull();
  });

  it('loadByAtencion devuelve null con JSON corrupto', async () => {
    fakes.state.store.set('AT-1001|musculoesqueletica', '{corrupto');
    const repo = new SqlServerEntrevistaOsteomuscularRepository();

    const loaded = await repo.loadByAtencion('AT-1001');
    expect(loaded).toBeNull();
  });
});

import { describe, expect, it, vi } from 'vitest';

import { InMemoryCrmEmpresaRepository } from './inMemoryCrmEmpresaRepository';
import type { PipelineEmpresa } from '../../domain/entities';
import type { CandidatoCola, CrmPipelineRepositoryPort } from '../../domain/ports';
import { ListarCarteraUseCase, proximaAccion } from '../listarCartera';

/**
 * Use-case contract for the cartera list (tasks pr15/WU1, spec G5
 * "Cartera views"): a plain `crm` holder sees ONLY their assigned
 * empresas — user A never sees user B's; a `crm_admin` sees all with
 * the `verTodas` toggle and their OWN cartera without it. The scoping
 * enforcement lives HERE (application policy), so a caller cannot leak
 * the whole registry by asking for `verTodas` without being admin.
 *
 * `etapa`/`flujo`/`proximaAccion` are decoration derived on request
 * from the pipeline rows (pr12 predicates + injected clock, design §3
 * — zero background jobs); a pipeline-less empresa renders null stage.
 */

const HOY = '2026-06-01';
const reloj = () => new Date(2026, 5, 1, 9, 0, 0); // hoy local = 2026-06-01

async function sembrar(repo: InMemoryCrmEmpresaRepository): Promise<void> {
  await repo.crear({
    ruc: '900000001',
    razonSocial: 'De jperez Uno',
    tipo: 'Prospecto',
    responsable: 'jperez',
    contactos: [],
  }); // id 1
  await repo.crear({
    ruc: '900000002',
    razonSocial: 'De jperez Dos',
    tipo: 'Cliente',
    responsable: 'jperez',
    contactos: [],
  }); // id 2
  await repo.crear({
    ruc: '900000003',
    razonSocial: 'De mgarcia',
    tipo: 'Prospecto',
    responsable: 'mgarcia',
    contactos: [],
  }); // id 3
  await repo.crear({
    ruc: '900000004',
    razonSocial: 'Del pool',
    tipo: 'Prospecto',
    responsable: null,
    contactos: [],
  }); // id 4
}

function candidato(
  overrides: Partial<PipelineEmpresa> & { empresaId: number },
): CandidatoCola {
  return {
    flujo: 'OUTBOUND',
    etapa: 'CADENCIA',
    ciclo: 1,
    enviosCiclo: 1,
    fechaCicloInicio: '2026-05-25',
    fechaUltimoEnvio: '2026-05-25',
    descansoHasta: null,
    rechazadoHasta: null,
    motivoRechazo: null,
    updatedBy: null,
    updatedAt: '2026-05-25T00:00:00.000Z',
    razonSocial: 'Constructora X',
    responsable: null,
    ...overrides,
  };
}

class FakePipelineRepository implements CrmPipelineRepositoryPort {
  candidatos: CandidatoCola[] = [];
  listarCandidatosCola = vi.fn(async (): Promise<CandidatoCola[]> =>
    structuredClone(this.candidatos),
  );

  async obtenerPorEmpresaId(): Promise<PipelineEmpresa | null> {
    throw new Error('no debe ser llamado por la cartera');
  }
  async registrarTransicion(): Promise<never> {
    throw new Error('no debe ser llamado por la cartera');
  }
  async cambiarTipo(): Promise<void> {
    throw new Error('no debe ser llamado por la cartera');
  }
  async listarTransiciones(): Promise<never[]> {
    return [];
  }
  async listarHandoffs(): Promise<never[]> {
    return [];
  }
}

function makeUseCase(): {
  empresas: InMemoryCrmEmpresaRepository;
  pipelines: FakePipelineRepository;
  useCase: ListarCarteraUseCase;
} {
  const empresas = new InMemoryCrmEmpresaRepository();
  const pipelines = new FakePipelineRepository();
  return { empresas, pipelines, useCase: new ListarCarteraUseCase(empresas, pipelines, reloj) };
}

describe('ListarCarteraUseCase — own-vs-all scoping (spec G5, tasks pr15/WU1)', () => {
  it('scopes a plain user to OWN empresas only — never another user’s', async () => {
    const { empresas, pipelines, useCase } = makeUseCase();
    await sembrar(empresas);
    pipelines.candidatos = [candidato({ empresaId: 1 })];

    const filas = await useCase.execute({ usuario: 'jperez', esAdmin: false, verTodas: false });

    expect(filas.map((f) => f.empresaId)).toEqual([1, 2]);
    expect(pipelines.listarCandidatosCola).toHaveBeenCalledTimes(1);
  });

  it('a plain user asking verTodas stays scoped to own (server-enforced, no leak)', async () => {
    const { empresas, useCase } = makeUseCase();
    await sembrar(empresas);

    const filas = await useCase.execute({ usuario: 'jperez', esAdmin: false, verTodas: true });

    expect(filas.map((f) => f.empresaId)).toEqual([1, 2]);
  });

  it('admin with verTodas sees ALL empresas (both owners + the pool)', async () => {
    const { empresas, useCase } = makeUseCase();
    await sembrar(empresas);

    const filas = await useCase.execute({ usuario: 'agarcia', esAdmin: true, verTodas: true });

    expect(filas.map((f) => f.empresaId)).toEqual([1, 2, 3, 4]);
    expect(filas.find((f) => f.empresaId === 4)?.responsable).toBeNull();
  });

  it('admin without verTodas sees only their OWN cartera', async () => {
    const { empresas, pipelines, useCase } = makeUseCase();
    await sembrar(empresas);
    pipelines.candidatos = [candidato({ empresaId: 3 })];

    const filas = await useCase.execute({ usuario: 'mgarcia', esAdmin: true, verTodas: false });

    expect(filas.map((f) => f.empresaId)).toEqual([3]);
  });

  it('decorates each row with flujo/etapa/proximaAccion from the pipeline row', async () => {
    const { empresas, pipelines, useCase } = makeUseCase();
    await sembrar(empresas);
    pipelines.candidatos = [
      candidato({ empresaId: 1, flujo: 'OUTBOUND', etapa: 'CADENCIA', fechaUltimoEnvio: '2026-05-25' }),
    ];

    const filas = await useCase.execute({ usuario: 'jperez', esAdmin: false, verTodas: false });

    expect(filas[0]).toMatchObject({
      empresaId: 1,
      ruc: '900000001',
      razonSocial: 'De jperez Uno',
      tipo: 'Prospecto',
      responsable: 'jperez',
      flujo: 'OUTBOUND',
      etapa: 'CADENCIA',
      proximaAccion: 'Enviar seguimiento (vencido hoy)',
    });
  });

  it('a pipeline-less empresa renders flujo/etapa null and "Sin pipeline"', async () => {
    const { empresas, useCase } = makeUseCase();
    await sembrar(empresas); // no pipeline candidates at all

    const filas = await useCase.execute({ usuario: 'jperez', esAdmin: false, verTodas: false });

    expect(filas).toHaveLength(2);
    expect(filas[0]).toMatchObject({ flujo: null, etapa: null, proximaAccion: 'Sin pipeline' });
  });

  it('returns an EMPTY list for a user with no assigned empresas (real empty — repo ran)', async () => {
    const { empresas, useCase } = makeUseCase();
    await sembrar(empresas);

    const filas = await useCase.execute({ usuario: 'nadie', esAdmin: false, verTodas: false });

    expect(filas).toEqual([]);
  });

  it('a repository failure propagates (reads fail loudly, no swallowed errors)', async () => {
    const { empresas, pipelines, useCase } = makeUseCase();
    await sembrar(empresas);
    pipelines.listarCandidatosCola = vi.fn(async () => {
      throw new Error('db down');
    });

    await expect(
      useCase.execute({ usuario: 'jperez', esAdmin: false, verTodas: false }),
    ).rejects.toThrow('db down');
  });
});

describe('proximaAccion (pure — pipeline row + injected hoy, spec G4 predicates)', () => {
  it('maps every cadence situation to its Spanish next action', () => {
    const casos: { pipeline: PipelineEmpresa | null; esperado: string }[] = [
      { pipeline: null, esperado: 'Sin pipeline' },
      // Vencida: ACTIVE stage, envios < 3, proximo (05-25 + 7d = 06-01) <= hoy.
      {
        pipeline: candidato({ empresaId: 1, etapa: 'CADENCIA', fechaUltimoEnvio: '2026-05-25' }),
        esperado: 'Enviar seguimiento (vencido hoy)',
      },
      // Fork INBOUND agotada (3 envíos): user decision T13/T14.
      {
        pipeline: candidato({
          empresaId: 2,
          flujo: 'INBOUND',
          etapa: 'SEGUIMIENTO',
          enviosCiclo: 3,
        }),
        esperado: 'Decisión requerida: pasar a Outbound o rechazar',
      },
      // DESCANSO cumplido: T9 reinicio.
      {
        pipeline: candidato({
          empresaId: 3,
          etapa: 'DESCANSO',
          enviosCiclo: 3,
          descansoHasta: HOY,
        }),
        esperado: 'Reiniciar cadencia',
      },
      // RECHAZADO con cooldown cumplido: T15 reactivar.
      {
        pipeline: candidato({ empresaId: 4, etapa: 'RECHAZADO', rechazadoHasta: HOY }),
        esperado: 'Reactivar',
      },
      // Weekly on track: proximo (05-30 + 7d = 06-06) > hoy.
      {
        pipeline: candidato({ empresaId: 5, etapa: 'SEGUIMIENTO', fechaUltimoEnvio: '2026-05-30' }),
        esperado: 'Seguimiento semanal al día',
      },
      // Non-cadence stage without due markers.
      {
        pipeline: candidato({ empresaId: 6, etapa: 'NUEVO', fechaUltimoEnvio: null }),
        esperado: 'Sin acción pendiente',
      },
    ];

    for (const { pipeline, esperado } of casos) {
      expect(proximaAccion(pipeline, HOY)).toBe(esperado);
    }
  });
});

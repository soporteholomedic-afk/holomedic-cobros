import { describe, expect, it, vi } from 'vitest';

import type { CandidatoCola } from '../../domain/ports';
import type { PipelineEmpresa } from '../../domain/entities';
import type { CrmPipelineRepositoryPort } from '../../domain/ports';
import { ListarColaHoyUseCase } from '../listarColaHoy';

/**
 * Use-case contract for the daily queue (tasks pr13/WU2, design §3,
 * spec G4): DERIVED on request — zero background jobs, zero writes.
 * The union of the four pr12 predicates partitions every pipeline row
 * into "a quién le toca hoy": vencidas hoy, reinicios de cadencia,
 * decisión requerida, reactivables. The injected clock decides `hoy`.
 */

const HOY = '2026-06-01';
const reloj = () => new Date(2026, 5, 1, 9, 0, 0); // hoy local = 2026-06-01

function candidato(overrides: Partial<PipelineEmpresa> & { razonSocial?: string; responsable?: string | null }): CandidatoCola {
  return {
    empresaId: 1,
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
  listarCandidatosCola = vi.fn(async (): Promise<CandidatoCola[]> => structuredClone(this.candidatos));

  async obtenerPorEmpresaId(): Promise<PipelineEmpresa | null> {
    throw new Error('no debe ser llamado por la cola');
  }
  async registrarTransicion(): Promise<never> {
    throw new Error('no debe ser llamado por la cola');
  }
  async cambiarTipo(): Promise<void> {
    throw new Error('no debe ser llamado por la cola');
  }
  async listarTransiciones(): Promise<never[]> {
    return [];
  }
  async listarHandoffs(): Promise<never[]> {
    return [];
  }
}

describe('ListarColaHoyUseCase — la cola se deriva en el pedido (spec G4)', () => {
  it('partitions candidates into the four sections and drops not-due rows', async () => {
    const repo = new FakePipelineRepository();
    repo.candidatos = [
      candidato({ empresaId: 10, razonSocial: 'Vencida Uno', fechaUltimoEnvio: '2026-05-25' }), // proximo = hoy
      candidato({ empresaId: 11, razonSocial: 'Vencida Dos', flujo: 'INBOUND', etapa: 'SEGUIMIENTO', fechaUltimoEnvio: '2026-05-20' }),
      candidato({
        empresaId: 20,
        razonSocial: 'Agotada Fork',
        flujo: 'INBOUND',
        etapa: 'SEGUIMIENTO',
        enviosCiclo: 3,
        fechaUltimoEnvio: '2026-05-25',
      }),
      candidato({
        empresaId: 30,
        razonSocial: 'Descanso Cumplido',
        etapa: 'DESCANSO',
        enviosCiclo: 3,
        fechaUltimoEnvio: '2026-03-16',
        descansoHasta: HOY,
      }),
      candidato({
        empresaId: 40,
        razonSocial: 'Reactivable',
        etapa: 'RECHAZADO',
        rechazadoHasta: HOY,
        motivoRechazo: 'Sin presupuesto',
      }),
      candidato({ empresaId: 50, razonSocial: 'Aún no vence', fechaUltimoEnvio: '2026-05-30' }), // proximo = 06-06
      candidato({
        empresaId: 60,
        razonSocial: 'Descanso Corriendo',
        etapa: 'DESCANSO',
        descansoHasta: '2026-09-01',
      }),
    ];

    const cola = await new ListarColaHoyUseCase(repo, reloj).execute();

    expect(repo.listarCandidatosCola).toHaveBeenCalledTimes(1);
    expect(cola.vencidasHoy.map((f) => f.empresaId)).toEqual([10, 11]);
    expect(cola.decisionRequerida.map((f) => f.empresaId)).toEqual([20]);
    expect(cola.reinicios.map((f) => f.empresaId)).toEqual([30]);
    expect(cola.reactivables.map((f) => f.empresaId)).toEqual([40]);
  });

  it('carries the empresa display fields (razonSocial, responsable) through untouched', async () => {
    const repo = new FakePipelineRepository();
    repo.candidatos = [candidato({ empresaId: 10, responsable: 'jperez' })];

    const cola = await new ListarColaHoyUseCase(repo, reloj).execute();

    expect(cola.vencidasHoy[0]).toMatchObject({
      empresaId: 10,
      razonSocial: 'Constructora X',
      responsable: 'jperez',
      etapa: 'CADENCIA',
      ciclo: 1,
      enviosCiclo: 1,
    });
  });

  it('returns four EMPTY sections for a queue with no candidates (real empty — repo ran)', async () => {
    const repo = new FakePipelineRepository();

    const cola = await new ListarColaHoyUseCase(repo, reloj).execute();

    expect(cola).toEqual({
      vencidasHoy: [],
      reinicios: [],
      decisionRequerida: [],
      reactivables: [],
    });
  });

  it('a repository failure propagates (reads fail loudly, no swallowed errors)', async () => {
    const repo = new FakePipelineRepository();
    repo.listarCandidatosCola = vi.fn(async () => {
      throw new Error('db down');
    });

    await expect(new ListarColaHoyUseCase(repo, reloj).execute()).rejects.toThrow('db down');
  });
});

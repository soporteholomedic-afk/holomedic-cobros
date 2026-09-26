import { describe, expect, it, vi } from 'vitest';

import { ObtenerDetalleEmpresaUseCase } from '../obtenerDetalleEmpresa';
import { NotFoundError } from '../../domain/errors';
import type {
  CrmEmpresaRepositoryPort,
  CrmPipelineRepositoryPort,
  HandoffHistorial,
  TransicionHistorial,
} from '../../domain/ports';
import type { Empresa, PipelineEmpresa } from '../../domain/entities';

// ---- Fixtures ----

const empresa: Empresa = {
  id: 42,
  ruc: '900123456',
  rucNormalizado: '900123456',
  razonSocial: 'Constructora X',
  tipo: 'Prospecto',
  origen: 'Inbound',
  proyectoObra: null,
  destinoComun: null,
  notas: null,
  responsable: null,
  contactos: [],
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const pipeline: PipelineEmpresa = {
  empresaId: 42,
  flujo: 'INBOUND',
  etapa: 'REGISTRADO',
  ciclo: 1,
  enviosCiclo: 0,
  fechaCicloInicio: null,
  fechaUltimoEnvio: null,
  descansoHasta: null,
  rechazadoHasta: null,
  motivoRechazo: null,
  updatedBy: null,
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const transicion: TransicionHistorial = {
  id: 7,
  empresaId: 42,
  flujoPrevio: null,
  etapaPrevia: null,
  flujoNuevo: 'INBOUND',
  etapaNueva: 'REGISTRADO',
  evento: 'T1',
  motivo: null,
  usuario: 'jperez',
  createdAt: '2026-09-01T00:00:00.000Z',
};

const handoff: HandoffHistorial = {
  id: 3,
  empresaId: 42,
  area: 'Operaciones',
  nota: null,
  usuario: 'jperez',
  createdAt: '2026-09-02T00:00:00.000Z',
};

function makeEmpresas(overrides: Partial<CrmEmpresaRepositoryPort> = {}): CrmEmpresaRepositoryPort {
  return {
    crear: vi.fn(),
    listar: vi.fn(),
    obtenerPorId: vi.fn().mockResolvedValue(empresa),
    actualizar: vi.fn(),
    ...overrides,
  };
}

function makePipelines(
  overrides: Partial<CrmPipelineRepositoryPort> = {},
): CrmPipelineRepositoryPort {
  return {
    obtenerPorEmpresaId: vi.fn().mockResolvedValue(pipeline),
    listarTransiciones: vi.fn().mockResolvedValue([transicion]),
    listarHandoffs: vi.fn().mockResolvedValue([handoff]),
    listarCandidatosCola: vi.fn().mockResolvedValue([]),
    registrarTransicion: vi.fn(),
    cambiarTipo: vi.fn(),
    ...overrides,
  };
}

// ---- ObtenerDetalleEmpresaUseCase ----

describe('ObtenerDetalleEmpresaUseCase', () => {
  it('returns the full detail read model: aggregate + pipeline + history', async () => {
    const empresas = makeEmpresas();
    const pipelines = makePipelines();

    const detalle = await new ObtenerDetalleEmpresaUseCase(empresas, pipelines).execute(42);

    expect(detalle.empresa).toEqual(empresa);
    expect(detalle.pipeline).toEqual(pipeline);
    expect(detalle.transiciones).toEqual([transicion]);
    expect(detalle.handoffs).toEqual([handoff]);
    expect(empresas.obtenerPorId).toHaveBeenCalledWith(42);
    expect(pipelines.obtenerPorEmpresaId).toHaveBeenCalledWith(42);
    expect(pipelines.listarTransiciones).toHaveBeenCalledWith(42);
    expect(pipelines.listarHandoffs).toHaveBeenCalledWith(42);
  });

  it('raises NotFoundError when the empresa does not exist — pipeline untouched', async () => {
    const pipelines = makePipelines();

    await expect(
      new ObtenerDetalleEmpresaUseCase(makeEmpresas({ obtenerPorId: vi.fn().mockResolvedValue(null) }), pipelines).execute(99),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(pipelines.obtenerPorEmpresaId).not.toHaveBeenCalled();
    expect(pipelines.listarTransiciones).not.toHaveBeenCalled();
    expect(pipelines.listarHandoffs).not.toHaveBeenCalled();
  });

  it('returns pipeline null and EMPTY histories for a pipeline-less empresa (origen null)', async () => {
    const pipelines = makePipelines({
      obtenerPorEmpresaId: vi.fn().mockResolvedValue(null),
      listarTransiciones: vi.fn().mockResolvedValue([]),
      listarHandoffs: vi.fn().mockResolvedValue([]),
      listarCandidatosCola: vi.fn().mockResolvedValue([]),
    });

    const detalle = await new ObtenerDetalleEmpresaUseCase(makeEmpresas(), pipelines).execute(42);

    expect(detalle.pipeline).toBeNull();
    expect(detalle.transiciones).toEqual([]);
    expect(detalle.handoffs).toEqual([]);
  });
});

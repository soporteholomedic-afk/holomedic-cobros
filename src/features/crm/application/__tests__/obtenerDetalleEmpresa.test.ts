import { describe, expect, it, vi } from 'vitest';

import { ObtenerDetalleEmpresaUseCase } from '../obtenerDetalleEmpresa';
import { NotFoundError } from '../../domain/errors';
import type {
  CrmEmpresaRepositoryPort,
  CrmEnviosCorreoRepositoryPort,
  CrmPipelineRepositoryPort,
  EnvioCorreoHistorial,
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

const envio: EnvioCorreoHistorial = {
  id: 5,
  plantilla: 'carta_presentacion',
  destinatario: 'ana@x.com',
  estado: 'ENVIADO',
  createdAt: '2026-09-03T00:00:00.000Z',
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

function makeEnvios(
  overrides: Partial<CrmEnviosCorreoRepositoryPort> = {},
): CrmEnviosCorreoRepositoryPort {
  return {
    registrar: vi.fn(),
    listarPorEmpresa: vi.fn().mockResolvedValue([envio]),
    ...overrides,
  };
}

// ---- ObtenerDetalleEmpresaUseCase ----

describe('ObtenerDetalleEmpresaUseCase', () => {
  it('returns the full detail read model: aggregate + pipeline + history + envios log', async () => {
    const empresas = makeEmpresas();
    const pipelines = makePipelines();
    const envios = makeEnvios();

    const detalle = await new ObtenerDetalleEmpresaUseCase(empresas, pipelines, envios).execute(42);

    expect(detalle.empresa).toEqual(empresa);
    expect(detalle.pipeline).toEqual(pipeline);
    expect(detalle.transiciones).toEqual([transicion]);
    expect(detalle.handoffs).toEqual([handoff]);
    expect(detalle.envios).toEqual([envio]);
    expect(empresas.obtenerPorId).toHaveBeenCalledWith(42);
    expect(pipelines.obtenerPorEmpresaId).toHaveBeenCalledWith(42);
    expect(pipelines.listarTransiciones).toHaveBeenCalledWith(42);
    expect(pipelines.listarHandoffs).toHaveBeenCalledWith(42);
    expect(envios.listarPorEmpresa).toHaveBeenCalledWith(42);
  });

  it('raises NotFoundError when the empresa does not exist — pipeline and envios untouched', async () => {
    const pipelines = makePipelines();
    const envios = makeEnvios();

    await expect(
      new ObtenerDetalleEmpresaUseCase(
        makeEmpresas({ obtenerPorId: vi.fn().mockResolvedValue(null) }),
        pipelines,
        envios,
      ).execute(99),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(pipelines.obtenerPorEmpresaId).not.toHaveBeenCalled();
    expect(pipelines.listarTransiciones).not.toHaveBeenCalled();
    expect(pipelines.listarHandoffs).not.toHaveBeenCalled();
    expect(envios.listarPorEmpresa).not.toHaveBeenCalled();
  });

  it('returns pipeline null and EMPTY histories for a pipeline-less empresa (origen null)', async () => {
    const pipelines = makePipelines({
      obtenerPorEmpresaId: vi.fn().mockResolvedValue(null),
      listarTransiciones: vi.fn().mockResolvedValue([]),
      listarHandoffs: vi.fn().mockResolvedValue([]),
      listarCandidatosCola: vi.fn().mockResolvedValue([]),
    });
    const envios = makeEnvios({ listarPorEmpresa: vi.fn().mockResolvedValue([]) });

    const detalle = await new ObtenerDetalleEmpresaUseCase(makeEmpresas(), pipelines, envios).execute(42);

    expect(detalle.pipeline).toBeNull();
    expect(detalle.transiciones).toEqual([]);
    expect(detalle.handoffs).toEqual([]);
    expect(detalle.envios).toEqual([]);
  });

  it('carries FALLIDO send-log rows too — the sin_carta retry state needs the failed dispatch visible', async () => {
    const fallido: EnvioCorreoHistorial = {
      id: 6,
      plantilla: 'carta_presentacion',
      destinatario: 'ana@x.com',
      estado: 'FALLIDO',
      createdAt: '2026-09-04T00:00:00.000Z',
    };
    const envios = makeEnvios({ listarPorEmpresa: vi.fn().mockResolvedValue([fallido, envio]) });

    const detalle = await new ObtenerDetalleEmpresaUseCase(
      makeEmpresas(),
      makePipelines(),
      envios,
    ).execute(42);

    expect(detalle.envios).toEqual([fallido, envio]);
  });
});

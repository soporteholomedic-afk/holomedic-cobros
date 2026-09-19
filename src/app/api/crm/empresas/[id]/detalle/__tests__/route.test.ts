import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mock auth session (auth/me route.test.ts precedent) ----

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
}));

// ---- Import under test (after mocks) ----

import { GET } from '../route';
import { __setCrmDbForTests, type CrmDb } from '@/features/crm/infrastructure/getCrmDb';
import type { CrmEmpresaRepositoryPort, CrmPipelineRepositoryPort } from '@/features/crm/domain/ports';
import type { Empresa, PipelineEmpresa } from '@/features/crm/domain/entities';
import type { HandoffHistorial, TransicionHistorial } from '@/features/crm/domain/ports';

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
  contactos: [
    {
      id: 11,
      empresaId: 42,
      nombre: 'Ana',
      telefono: '987654321',
      esPrincipal: true,
      correos: [{ id: 111, contactoId: 11, correo: 'ana@x.com' }],
    },
  ],
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
  nota: 'Coordinar entrega',
  usuario: 'jperez',
  createdAt: '2026-09-02T00:00:00.000Z',
};

function makeFakeEmpresas(overrides: Partial<CrmEmpresaRepositoryPort> = {}): CrmEmpresaRepositoryPort {
  return {
    crear: vi.fn(),
    listar: vi.fn(),
    obtenerPorId: vi.fn(),
    actualizar: vi.fn(),
    ...overrides,
  };
}

function makeFakePipeline(overrides: Partial<CrmPipelineRepositoryPort> = {}): CrmPipelineRepositoryPort {
  return {
    obtenerPorEmpresaId: vi.fn(),
    listarTransiciones: vi.fn(),
    listarHandoffs: vi.fn(),
    listarCandidatosCola: vi.fn().mockResolvedValue([]),
    registrarTransicion: vi.fn(),
    cambiarTipo: vi.fn(),
    ...overrides,
  };
}

function setDb(empresas: CrmEmpresaRepositoryPort, pipeline: CrmPipelineRepositoryPort): void {
  __setCrmDbForTests({
    pool: {} as never,
    empresas,
    importador: {} as never,
    pipeline,
    transiciones: {} as never,
    resultados: {} as never,
    handoffs: {} as never,
    actividades: {} as never,
    asignaciones: {} as never,
    } satisfies CrmDb);
}

const sessionBase = { sub: 'u-1', nombre: 'Juana Perez', area: 'ventas' };
const crmSession = { ...sessionBase, permisos: ['crm'] };

function routeContext(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function getDetalle(id: string): Promise<Response> {
  return GET(new Request(`http://localhost/api/crm/empresas/${id}/detalle`), routeContext(id));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockReset();
});

afterEach(() => {
  __setCrmDbForTests(null);
});

// ---- GET /api/crm/empresas/[id]/detalle ----

describe('GET /api/crm/empresas/[id]/detalle', () => {
  it('returns 401 UNAUTHORIZED without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    setDb(makeFakeEmpresas(), makeFakePipeline());

    const response = await getDetalle('42');
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 FORBIDDEN without the crm permiso', async () => {
    mockGetSession.mockResolvedValue({ ...sessionBase, permisos: ['cobranza'] });
    setDb(makeFakeEmpresas(), makeFakePipeline());

    const response = await getDetalle('42');
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe('FORBIDDEN');
  });

  it('returns 400 for a non-numeric id (repos untouched)', async () => {
    mockGetSession.mockResolvedValue(crmSession);
    const obtenerPorId = vi.fn();
    setDb(makeFakeEmpresas({ obtenerPorId }), makeFakePipeline());

    const response = await getDetalle('abc');
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(obtenerPorId).not.toHaveBeenCalled();
  });

  it('returns 200 with the full detail read model (aggregate + pipeline + history)', async () => {
    mockGetSession.mockResolvedValue(crmSession);
    const obtenerPorId = vi.fn().mockResolvedValue(empresa);
    setDb(
      makeFakeEmpresas({ obtenerPorId }),
      makeFakePipeline({
        obtenerPorEmpresaId: vi.fn().mockResolvedValue(pipeline),
        listarTransiciones: vi.fn().mockResolvedValue([transicion]),
        listarHandoffs: vi.fn().mockResolvedValue([handoff]),
        listarCandidatosCola: vi.fn().mockResolvedValue([]),
      }),
    );

    const response = await getDetalle('42');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.empresa).toEqual(empresa);
    expect(body.pipeline).toEqual(pipeline);
    expect(body.transiciones).toEqual([transicion]);
    expect(body.handoffs).toEqual([handoff]);
  });

  it('returns 200 with pipeline null and empty histories for a pipeline-less empresa', async () => {
    mockGetSession.mockResolvedValue(crmSession);
    setDb(
      makeFakeEmpresas({ obtenerPorId: vi.fn().mockResolvedValue(empresa) }),
      makeFakePipeline({
        obtenerPorEmpresaId: vi.fn().mockResolvedValue(null),
        listarTransiciones: vi.fn().mockResolvedValue([]),
        listarHandoffs: vi.fn().mockResolvedValue([]),
        listarCandidatosCola: vi.fn().mockResolvedValue([]),
      }),
    );

    const response = await getDetalle('42');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.pipeline).toBeNull();
    expect(body.transiciones).toEqual([]);
    expect(body.handoffs).toEqual([]);
  });

  it('returns 404 NOT_FOUND_ERROR when the empresa does not exist', async () => {
    mockGetSession.mockResolvedValue(crmSession);
    setDb(makeFakeEmpresas({ obtenerPorId: vi.fn().mockResolvedValue(null) }), makeFakePipeline());

    const response = await getDetalle('99');
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.code).toBe('NOT_FOUND_ERROR');
  });

  it('returns 500 INTERNAL_ERROR on an unexpected failure', async () => {
    mockGetSession.mockResolvedValue(crmSession);
    setDb(
      makeFakeEmpresas({ obtenerPorId: vi.fn().mockRejectedValue(new Error('db down')) }),
      makeFakePipeline(),
    );

    const response = await getDetalle('42');
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mock auth session (auth/me route.test.ts precedent) ----

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
}));

// ---- Import under test (after mocks) ----

import { POST } from '../route';
import { __setCrmDbForTests, type CrmDb } from '@/features/crm/infrastructure/getCrmDb';
import type { CrmEmpresaRepositoryPort, CrmPipelineRepositoryPort } from '@/features/crm/domain/ports';
import type { Empresa } from '@/features/crm/domain/entities';

// ---- Fixtures ----

const empresa: Empresa = {
  id: 42,
  ruc: '900123456',
  rucNormalizado: '900123456',
  razonSocial: 'Constructora X',
  tipo: 'Prospecto',
  origen: null,
  proyectoObra: null,
  destinoComun: null,
  notas: null,
  responsable: null,
  contactos: [],
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

function makeFakePipeline(overrides: Partial<CrmPipelineRepositoryPort> = {}): CrmPipelineRepositoryPort {
  return {
    obtenerPorEmpresaId: vi.fn(),
    listarTransiciones: vi.fn().mockResolvedValue([]),
    listarHandoffs: vi.fn().mockResolvedValue([]),
    listarCandidatosCola: vi.fn().mockResolvedValue([]),
    registrarTransicion: vi.fn(),
    cambiarTipo: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeFakeEmpresas(overrides: Partial<CrmEmpresaRepositoryPort> = {}): CrmEmpresaRepositoryPort {
  return {
    crear: vi.fn(),
    listar: vi.fn(),
    obtenerPorId: vi.fn().mockResolvedValue(empresa),
    actualizar: vi.fn(),
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
    } satisfies CrmDb);
}

const sessionBase = { sub: 'u-1', nombre: 'Juana Perez', area: 'ventas' };
const crmSession = { ...sessionBase, permisos: ['crm'] };
const adminSession = { ...sessionBase, permisos: ['crm', 'crm_admin'] };

function routeContext(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function jsonPost(id: string, body: unknown): Parameters<typeof POST>[0] {
  return new Request(`http://localhost/api/crm/empresas/${id}/tipo`, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }) as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockReset();
});

afterEach(() => {
  __setCrmDbForTests(null);
});

describe('POST /api/crm/empresas/[id]/tipo — T16 (crm_admin in-route)', () => {
  it('returns 401 UNAUTHORIZED without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    setDb(makeFakeEmpresas(), makeFakePipeline());

    const response = await POST(jsonPost('42', { tipo: 'Cliente' }), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 when only crm is held — the conversion requires crm_admin in-route', async () => {
    mockGetSession.mockResolvedValue(crmSession);
    const pipeline = makeFakePipeline();
    setDb(makeFakeEmpresas(), pipeline);

    const response = await POST(jsonPost('42', { tipo: 'Cliente' }), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe('FORBIDDEN');
    expect(pipeline.cambiarTipo).not.toHaveBeenCalled();
  });

  it('returns 200 with the conversion flag for Prospecto→Cliente', async () => {
    mockGetSession.mockResolvedValue(adminSession);
    const pipeline = makeFakePipeline();
    setDb(makeFakeEmpresas(), pipeline);

    const response = await POST(jsonPost('42', { tipo: 'Cliente' }), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, tipo: 'Cliente', conversion: true });
    expect(pipeline.cambiarTipo).toHaveBeenCalledWith(
      expect.objectContaining({ empresaId: 42, nuevoTipo: 'Cliente', usuario: 'u-1', convertir: true }),
    );
  });

  it('returns 200 with conversion: false for the demotion direction', async () => {
    mockGetSession.mockResolvedValue(adminSession);
    const pipeline = makeFakePipeline();
    setDb(makeFakeEmpresas({ obtenerPorId: vi.fn().mockResolvedValue({ ...empresa, tipo: 'Cliente' }) }), pipeline);

    const response = await POST(jsonPost('42', { tipo: 'Prospecto' }), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, tipo: 'Prospecto', conversion: false });
    expect(pipeline.cambiarTipo).toHaveBeenCalledWith(
      expect.objectContaining({ nuevoTipo: 'Prospecto', convertir: false }),
    );
  });

  it('returns 404 NOT_FOUND_ERROR when the empresa does not exist', async () => {
    mockGetSession.mockResolvedValue(adminSession);
    const pipeline = makeFakePipeline();
    setDb(makeFakeEmpresas({ obtenerPorId: vi.fn().mockResolvedValue(null) }), pipeline);

    const response = await POST(jsonPost('99', { tipo: 'Cliente' }), routeContext('99'));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.code).toBe('NOT_FOUND_ERROR');
    expect(pipeline.cambiarTipo).not.toHaveBeenCalled();
  });

  it('returns 400 for a no-op tipo change (use case guard)', async () => {
    mockGetSession.mockResolvedValue(adminSession);
    const pipeline = makeFakePipeline();
    setDb(makeFakeEmpresas(), pipeline);

    const response = await POST(jsonPost('42', { tipo: 'Prospecto' }), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(pipeline.cambiarTipo).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid tipo value (shape guard)', async () => {
    mockGetSession.mockResolvedValue(adminSession);
    const pipeline = makeFakePipeline();
    setDb(makeFakeEmpresas(), pipeline);

    const response = await POST(jsonPost('42', { tipo: 'Lead' }), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(pipeline.cambiarTipo).not.toHaveBeenCalled();
  });

  it('returns 400 for a non-numeric id', async () => {
    mockGetSession.mockResolvedValue(adminSession);
    const pipeline = makeFakePipeline();
    setDb(makeFakeEmpresas(), pipeline);

    const response = await POST(jsonPost('abc', { tipo: 'Cliente' }), routeContext('abc'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(pipeline.cambiarTipo).not.toHaveBeenCalled();
  });

  it('returns 500 INTERNAL_ERROR on an unexpected failure', async () => {
    mockGetSession.mockResolvedValue(adminSession);
    setDb(
      makeFakeEmpresas(),
      makeFakePipeline({ cambiarTipo: vi.fn().mockRejectedValue(new Error('db down')) }),
    );

    const response = await POST(jsonPost('42', { tipo: 'Cliente' }), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mock auth session (auth/me route.test.ts precedent) ----

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
}));

// ---- Import under test (after mocks) ----

import { POST } from '../route';
import { __setCrmDbForTests, type CrmDb } from '@/features/crm/infrastructure/getCrmDb';
import type {
  CrmAsignacionesRepositoryPort,
  CrmEmpresaRepositoryPort,
} from '@/features/crm/domain/ports';
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

function makeFakeEmpresas(overrides: Partial<CrmEmpresaRepositoryPort> = {}): CrmEmpresaRepositoryPort {
  return {
    crear: vi.fn(),
    listar: vi.fn(),
    obtenerPorId: vi.fn().mockResolvedValue(empresa),
    actualizar: vi.fn(),
    ...overrides,
  };
}

function makeFakeAsignaciones(overrides: Partial<CrmAsignacionesRepositoryPort> = {}): CrmAsignacionesRepositoryPort {
  return {
    registrarAsignacion: vi.fn().mockResolvedValue(undefined),
    listarAsignaciones: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function setDb(empresas: CrmEmpresaRepositoryPort, asignaciones: CrmAsignacionesRepositoryPort): void {
  __setCrmDbForTests({
    pool: {} as never,
    empresas,
    importador: {} as never,
    pipeline: {} as never,
    transiciones: {} as never,
    resultados: {} as never,
    handoffs: {} as never,
    actividades: {} as never,
    asignaciones,
  } satisfies CrmDb);
}

const sessionBase = { sub: 'u-1', nombre: 'Juana Perez', area: 'ventas' };
const crmSession = { ...sessionBase, permisos: ['crm'] };
const adminSession = { ...sessionBase, permisos: ['crm', 'crm_admin'] };

function routeContext(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function jsonPost(id: string, body: unknown): Parameters<typeof POST>[0] {
  return new Request(`http://localhost/api/crm/empresas/${id}/asignar`, {
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

describe('POST /api/crm/empresas/[id]/asignar — crm_admin in-route (spec G5)', () => {
  it('returns 401 UNAUTHORIZED without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const asignaciones = makeFakeAsignaciones();
    setDb(makeFakeEmpresas(), asignaciones);

    const response = await POST(jsonPost('42', { responsable: 'jperez' }), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 when only crm is held — assignment requires crm_admin in-route', async () => {
    mockGetSession.mockResolvedValue(crmSession);
    const asignaciones = makeFakeAsignaciones();
    setDb(makeFakeEmpresas(), asignaciones);

    const response = await POST(jsonPost('42', { responsable: 'jperez' }), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe('FORBIDDEN');
    expect(asignaciones.registrarAsignacion).not.toHaveBeenCalled();
  });

  it('returns 200 ASIGNADO when an admin assigns a pool empresa', async () => {
    mockGetSession.mockResolvedValue(adminSession);
    const asignaciones = makeFakeAsignaciones();
    setDb(makeFakeEmpresas(), asignaciones);

    const response = await POST(jsonPost('42', { responsable: 'jperez' }), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      accion: 'ASIGNADO',
      responsable: 'jperez',
      responsablePrevio: null,
    });
    expect(asignaciones.registrarAsignacion).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: 42,
        accion: 'ASIGNADO',
        responsablePrevio: null,
        responsableNuevo: 'jperez',
        actorUsuario: 'u-1',
      }),
    );
  });

  it('returns 200 REASIGNADO when the empresa already had an owner', async () => {
    mockGetSession.mockResolvedValue(adminSession);
    const asignaciones = makeFakeAsignaciones();
    setDb(
      makeFakeEmpresas({ obtenerPorId: vi.fn().mockResolvedValue({ ...empresa, responsable: 'jperez' }) }),
      asignaciones,
    );

    const response = await POST(jsonPost('42', { responsable: 'mgarcia' }), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      accion: 'REASIGNADO',
      responsable: 'mgarcia',
      responsablePrevio: 'jperez',
    });
    expect(asignaciones.registrarAsignacion).toHaveBeenCalledWith(
      expect.objectContaining({ accion: 'REASIGNADO', responsableNuevo: 'mgarcia' }),
    );
  });

  it('returns 404 NOT_FOUND_ERROR when the empresa does not exist', async () => {
    mockGetSession.mockResolvedValue(adminSession);
    const asignaciones = makeFakeAsignaciones();
    setDb(makeFakeEmpresas({ obtenerPorId: vi.fn().mockResolvedValue(null) }), asignaciones);

    const response = await POST(jsonPost('99', { responsable: 'jperez' }), routeContext('99'));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.code).toBe('NOT_FOUND_ERROR');
    expect(asignaciones.registrarAsignacion).not.toHaveBeenCalled();
  });

  it('returns 400 when the responsable is unchanged (no-op guard)', async () => {
    mockGetSession.mockResolvedValue(adminSession);
    const asignaciones = makeFakeAsignaciones();
    setDb(
      makeFakeEmpresas({ obtenerPorId: vi.fn().mockResolvedValue({ ...empresa, responsable: 'jperez' }) }),
      asignaciones,
    );

    const response = await POST(jsonPost('42', { responsable: 'jperez' }), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(asignaciones.registrarAsignacion).not.toHaveBeenCalled();
  });

  it('returns 400 for a body without a responsable', async () => {
    mockGetSession.mockResolvedValue(adminSession);
    const asignaciones = makeFakeAsignaciones();
    setDb(makeFakeEmpresas(), asignaciones);

    const response = await POST(jsonPost('42', { otro: 'x' }), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(asignaciones.registrarAsignacion).not.toHaveBeenCalled();
  });

  it('returns 400 for a non-JSON body', async () => {
    mockGetSession.mockResolvedValue(adminSession);
    const asignaciones = makeFakeAsignaciones();
    setDb(makeFakeEmpresas(), asignaciones);

    const response = await POST(jsonPost('42', 'not-json'), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for a non-numeric id', async () => {
    mockGetSession.mockResolvedValue(adminSession);
    const asignaciones = makeFakeAsignaciones();
    setDb(makeFakeEmpresas(), asignaciones);

    const response = await POST(jsonPost('abc', { responsable: 'jperez' }), routeContext('abc'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(asignaciones.registrarAsignacion).not.toHaveBeenCalled();
  });

  it('returns 500 INTERNAL_ERROR on an unexpected failure', async () => {
    mockGetSession.mockResolvedValue(adminSession);
    setDb(
      makeFakeEmpresas(),
      makeFakeAsignaciones({ registrarAsignacion: vi.fn().mockRejectedValue(new Error('db down')) }),
    );

    const response = await POST(jsonPost('42', { responsable: 'jperez' }), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});

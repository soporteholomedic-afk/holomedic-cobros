import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mock auth session (auth/me route.test.ts precedent) ----

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
}));

// ---- Import under test (after mocks) ----

import { GET, PUT } from '../route';
import { __setCrmDbForTests, type CrmDb } from '@/features/crm/infrastructure/getCrmDb';
import type { CrmEmpresaRepositoryPort } from '@/features/crm/domain/ports';
import { ConflictError, ValidationError } from '@/features/crm/domain/errors';
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

function makeFakeRepo(overrides: Partial<CrmEmpresaRepositoryPort> = {}): CrmEmpresaRepositoryPort {
  return {
    crear: vi.fn(),
    listar: vi.fn(),
    obtenerPorId: vi.fn(),
    actualizar: vi.fn(),
    ...overrides,
  };
}

function setDb(repo: CrmEmpresaRepositoryPort): void {
  __setCrmDbForTests({
    pool: {} as never,
    empresas: repo,
    importador: {} as never,
    pipeline: {} as never,
    transiciones: {} as never,
    resultados: {} as never,
    handoffs: {} as never,
  } satisfies CrmDb);
}

const sessionBase = { sub: 'u-1', nombre: 'Juana Perez', area: 'ventas' };
const crmSession = { ...sessionBase, permisos: ['crm'] };
const adminSession = { ...sessionBase, permisos: ['crm', 'crm_admin'] };

function routeContext(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function jsonPut(id: string, body: unknown): Parameters<typeof PUT>[0] {
  return new Request(`http://localhost/api/crm/empresas/${id}`, {
    method: 'PUT',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }) as Parameters<typeof PUT>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockReset();
});

afterEach(() => {
  __setCrmDbForTests(null);
});

// ---- GET /api/crm/empresas/[id] ----

describe('GET /api/crm/empresas/[id]', () => {
  it('returns 401 UNAUTHORIZED without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    setDb(makeFakeRepo());

    const response = await GET(new Request('http://localhost/api/crm/empresas/42'), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 FORBIDDEN without the crm permiso', async () => {
    mockGetSession.mockResolvedValue({ ...sessionBase, permisos: ['cobranza'] });
    setDb(makeFakeRepo());

    const response = await GET(new Request('http://localhost/api/crm/empresas/42'), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe('FORBIDDEN');
  });

  it('returns 200 with the full empresa aggregate', async () => {
    mockGetSession.mockResolvedValue(crmSession);
    const obtenerPorId = vi.fn().mockResolvedValue(empresa);
    setDb(makeFakeRepo({ obtenerPorId }));

    const response = await GET(new Request('http://localhost/api/crm/empresas/42'), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(obtenerPorId).toHaveBeenCalledWith(42);
    expect(body.success).toBe(true);
    expect(body.empresa).toEqual(empresa);
  });

  it('returns 404 NOT_FOUND_ERROR when the empresa does not exist', async () => {
    mockGetSession.mockResolvedValue(crmSession);
    setDb(makeFakeRepo({ obtenerPorId: vi.fn().mockResolvedValue(null) }));

    const response = await GET(new Request('http://localhost/api/crm/empresas/99'), routeContext('99'));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.code).toBe('NOT_FOUND_ERROR');
  });

  it('returns 400 for a non-numeric id', async () => {
    mockGetSession.mockResolvedValue(crmSession);
    const obtenerPorId = vi.fn();
    setDb(makeFakeRepo({ obtenerPorId }));

    const response = await GET(new Request('http://localhost/api/crm/empresas/abc'), routeContext('abc'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(obtenerPorId).not.toHaveBeenCalled();
  });

  it('returns 500 INTERNAL_ERROR on an unexpected failure', async () => {
    mockGetSession.mockResolvedValue(crmSession);
    setDb(makeFakeRepo({ obtenerPorId: vi.fn().mockRejectedValue(new Error('db down')) }));

    const response = await GET(new Request('http://localhost/api/crm/empresas/42'), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});

// ---- PUT /api/crm/empresas/[id] ----

describe('PUT /api/crm/empresas/[id]', () => {
  it('returns 401 UNAUTHORIZED without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    setDb(makeFakeRepo());

    const response = await PUT(jsonPut('42', { tipo: 'Cliente' }), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 when only crm is held — writes require crm_admin in-route', async () => {
    mockGetSession.mockResolvedValue(crmSession);
    setDb(makeFakeRepo());

    const response = await PUT(jsonPut('42', { tipo: 'Cliente' }), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe('FORBIDDEN');
  });

  it('updates the empresa (200) with only the submitted fields', async () => {
    mockGetSession.mockResolvedValue(adminSession);
    const actualizada: Empresa = { ...empresa, tipo: 'Cliente', responsable: 'mgarcia' };
    const actualizar = vi.fn().mockResolvedValue(actualizada);
    setDb(makeFakeRepo({ actualizar }));

    const response = await PUT(
      jsonPut('42', { tipo: 'Cliente', responsable: 'mgarcia' }),
      routeContext('42'),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(actualizar).toHaveBeenCalledWith(42, { tipo: 'Cliente', responsable: 'mgarcia' });
    expect(body.success).toBe(true);
    expect(body.empresa).toEqual(actualizada);
  });

  it('returns 404 NOT_FOUND_ERROR when the empresa does not exist', async () => {
    mockGetSession.mockResolvedValue(adminSession);
    setDb(makeFakeRepo({ actualizar: vi.fn().mockResolvedValue(null) }));

    const response = await PUT(jsonPut('99', { tipo: 'Cliente' }), routeContext('99'));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.code).toBe('NOT_FOUND_ERROR');
  });

  it('returns 409 CONFLICT_ERROR when the adapter raises a registry conflict', async () => {
    mockGetSession.mockResolvedValue(adminSession);
    setDb(
      makeFakeRepo({
        actualizar: vi.fn().mockRejectedValue(new ConflictError('Ya existe una empresa con ese RUC')),
      }),
    );

    const response = await PUT(jsonPut('42', { tipo: 'Cliente' }), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe('CONFLICT_ERROR');
  });

  it('maps ValidationError from the use case to 400 (blank razonSocial)', async () => {
    mockGetSession.mockResolvedValue(adminSession);
    const actualizar = vi.fn().mockRejectedValue(new ValidationError('La razón social es obligatoria'));
    setDb(makeFakeRepo({ actualizar }));

    // The use case rejects BEFORE any repo call — no write must happen.
    const response = await PUT(jsonPut('42', { razonSocial: '   ' }), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(actualizar).not.toHaveBeenCalled();
  });

  it('returns 400 for a non-numeric id', async () => {
    mockGetSession.mockResolvedValue(adminSession);
    const actualizar = vi.fn();
    setDb(makeFakeRepo({ actualizar }));

    const response = await PUT(jsonPut('abc', { tipo: 'Cliente' }), routeContext('abc'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(actualizar).not.toHaveBeenCalled();
  });

  it('returns 400 for an unknown tipo value', async () => {
    mockGetSession.mockResolvedValue(adminSession);
    setDb(makeFakeRepo());

    const response = await PUT(jsonPut('42', { tipo: 'Lead' }), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for an empty body with no changes', async () => {
    mockGetSession.mockResolvedValue(adminSession);
    setDb(makeFakeRepo());

    const response = await PUT(jsonPut('42', {}), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });
});

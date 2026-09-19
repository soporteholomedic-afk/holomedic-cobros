import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mock auth session (auth/me route.test.ts precedent) ----

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
}));

// ---- Import under test (after mocks) ----

import { POST } from '../route';
import { __setCrmDbForTests, type CrmDb } from '@/features/crm/infrastructure/getCrmDb';
import type { CrmEmpresaRepositoryPort, CrmHandoffsRepositoryPort } from '@/features/crm/domain/ports';

// ---- Fixtures ----

function makeFakeHandoffs(overrides: Partial<CrmHandoffsRepositoryPort> = {}): CrmHandoffsRepositoryPort {
  return { registrar: vi.fn().mockResolvedValue(55), ...overrides };
}

function makeFakeEmpresas(overrides: Partial<CrmEmpresaRepositoryPort> = {}): CrmEmpresaRepositoryPort {
  return {
    crear: vi.fn(),
    listar: vi.fn(),
    obtenerPorId: vi.fn().mockResolvedValue({ id: 42 }),
    actualizar: vi.fn(),
    ...overrides,
  };
}

function setDb(empresas: CrmEmpresaRepositoryPort, handoffs: CrmHandoffsRepositoryPort): void {
  __setCrmDbForTests({
    pool: {} as never,
    empresas,
    importador: {} as never,
    pipeline: {} as never,
    transiciones: {} as never,
    resultados: {} as never,
    handoffs,
    actividades: {} as never,
    } satisfies CrmDb);
}

const sessionBase = { sub: 'u-1', nombre: 'Juana Perez', area: 'ventas' };
const crmSession = { ...sessionBase, permisos: ['crm'] };

function routeContext(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function jsonPost(id: string, body: unknown): Parameters<typeof POST>[0] {
  return new Request(`http://localhost/api/crm/empresas/${id}/handoffs`, {
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

describe('POST /api/crm/empresas/[id]/handoffs', () => {
  it('returns 401 UNAUTHORIZED without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    setDb(makeFakeEmpresas(), makeFakeHandoffs());

    const response = await POST(jsonPost('42', { area: 'Operaciones' }), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 FORBIDDEN without the crm permiso', async () => {
    mockGetSession.mockResolvedValue({ ...sessionBase, permisos: ['cobranza'] });
    setDb(makeFakeEmpresas(), makeFakeHandoffs());

    const response = await POST(jsonPost('42', { area: 'Operaciones' }), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe('FORBIDDEN');
  });

  it('returns 201 with the record id and writes the handoff with the session user', async () => {
    mockGetSession.mockResolvedValue(crmSession);
    const handoffs = makeFakeHandoffs();
    setDb(makeFakeEmpresas(), handoffs);

    const response = await POST(
      jsonPost('42', { area: 'Operaciones', nota: 'Coordinar entrega' }),
      routeContext('42'),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({ success: true, id: 55 });
    expect(handoffs.registrar).toHaveBeenCalledWith({
      empresaId: 42,
      area: 'Operaciones',
      nota: 'Coordinar entrega',
      usuario: 'u-1',
    });
  });

  it('returns 404 NOT_FOUND_ERROR when the empresa does not exist', async () => {
    mockGetSession.mockResolvedValue(crmSession);
    const handoffs = makeFakeHandoffs();
    setDb(makeFakeEmpresas({ obtenerPorId: vi.fn().mockResolvedValue(null) }), handoffs);

    const response = await POST(jsonPost('99', { area: 'Operaciones' }), routeContext('99'));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.code).toBe('NOT_FOUND_ERROR');
    expect(handoffs.registrar).not.toHaveBeenCalled();
  });

  it('returns 400 when the área key is missing (shape guard)', async () => {
    mockGetSession.mockResolvedValue(crmSession);
    const handoffs = makeFakeHandoffs();
    setDb(makeFakeEmpresas(), handoffs);

    const response = await POST(jsonPost('42', { nota: 'sin área' }), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(handoffs.registrar).not.toHaveBeenCalled();
  });

  it('returns 400 when the área is blank after trim (use case guard)', async () => {
    mockGetSession.mockResolvedValue(crmSession);
    const handoffs = makeFakeHandoffs();
    setDb(makeFakeEmpresas(), handoffs);

    const response = await POST(jsonPost('42', { area: '   ' }), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(handoffs.registrar).not.toHaveBeenCalled();
  });

  it('returns 400 for a malformed JSON body', async () => {
    mockGetSession.mockResolvedValue(crmSession);
    setDb(makeFakeEmpresas(), makeFakeHandoffs());

    const response = await POST(jsonPost('42', '{no-json'), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 500 INTERNAL_ERROR on an unexpected failure', async () => {
    mockGetSession.mockResolvedValue(crmSession);
    setDb(
      makeFakeEmpresas(),
      makeFakeHandoffs({ registrar: vi.fn().mockRejectedValue(new Error('db down')) }),
    );

    const response = await POST(jsonPost('42', { area: 'Operaciones' }), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});

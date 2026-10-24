import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __setAreaDbForTests } from '@/features/areas/infrastructure/getAreaDb';
import type { IAreaRepository } from '@/features/areas/domain/ports';
import type { Area } from '@/features/areas/domain/entities';
import { AreaDuplicadaError, AreaNotFoundError } from '@/features/areas/domain/errors';

// ---- Mock auth session (usuarios [id] route.test.ts precedent) ----

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
}));

// ---- Import under test (after mocks) ----

import { PUT, DELETE } from '../route';

// ---- Helpers ----

function createJsonRequest(body: unknown): Request {
  return { json: () => Promise.resolve(body) } as Request;
}

function routeContext(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

const adminSession = {
  sub: 'admin-001',
  nombre: 'Soporte Admin',
  area: 'admin',
  permisos: ['admin' as const],
};

function makeMockRepo(
  overrides: Partial<IAreaRepository> = {},
): IAreaRepository {
  return {
    getById: vi.fn(),
    findByNombre: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    ...overrides,
  };
}

const row: Area = {
  idArea: 'a-1',
  nombre: 'Ventas',
  descripcion: null,
  activo: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('/api/areas/[id] PUT', () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue(adminSession);
  });

  afterEach(() => {
    __setAreaDbForTests(null);
    vi.restoreAllMocks();
  });

  it('updates the area and returns it', async () => {
    const update = vi.fn().mockResolvedValue({ ...row, descripcion: 'nueva' });
    const repo = makeMockRepo({ update });
    __setAreaDbForTests(repo);
    const res = await PUT(
      createJsonRequest({ descripcion: 'nueva' }),
      routeContext('a-1'),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.area.descripcion).toBe('nueva');
    expect(update).toHaveBeenCalledWith('a-1', { descripcion: 'nueva' });
  });

  it('returns 400 when nombre is blank', async () => {
    const repo = makeMockRepo();
    __setAreaDbForTests(repo);
    const res = await PUT(createJsonRequest({ nombre: ' ' }), routeContext('a-1'));

    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid JSON body', async () => {
    const repo = makeMockRepo();
    __setAreaDbForTests(repo);
    const badRequest = { json: () => Promise.reject(new Error('bad')) } as unknown as Request;
    const res = await PUT(badRequest, routeContext('a-1'));

    expect(res.status).toBe(400);
  });

  it('maps AreaDuplicadaError to 409', async () => {
    const repo = makeMockRepo({
      update: vi.fn().mockRejectedValue(new AreaDuplicadaError('Retail')),
    });
    __setAreaDbForTests(repo);
    const res = await PUT(createJsonRequest({ nombre: 'Retail' }), routeContext('a-1'));

    expect(res.status).toBe(409);
  });

  it('maps AreaNotFoundError to 404', async () => {
    const repo = makeMockRepo({
      update: vi.fn().mockRejectedValue(new AreaNotFoundError('a-x')),
    });
    __setAreaDbForTests(repo);
    const res = await PUT(createJsonRequest({ nombre: 'Retail' }), routeContext('a-x'));

    expect(res.status).toBe(404);
  });
});

describe('/api/areas/[id] DELETE', () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue(adminSession);
  });

  afterEach(() => {
    __setAreaDbForTests(null);
    vi.restoreAllMocks();
  });

  it('soft-deletes the area', async () => {
    const softDelete = vi.fn().mockResolvedValue(undefined);
    const repo = makeMockRepo({ softDelete });
    __setAreaDbForTests(repo);
    const res = await DELETE(new Request('http://x'), routeContext('a-1'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(softDelete).toHaveBeenCalledWith('a-1');
  });

  it('maps AreaNotFoundError to 404', async () => {
    const repo = makeMockRepo({
      softDelete: vi.fn().mockRejectedValue(new AreaNotFoundError('a-x')),
    });
    __setAreaDbForTests(repo);
    const res = await DELETE(new Request('http://x'), routeContext('a-x'));

    expect(res.status).toBe(404);
  });
});

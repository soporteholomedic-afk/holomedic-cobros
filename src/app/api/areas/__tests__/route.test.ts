import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __setAreaDbForTests } from '@/features/areas/infrastructure/getAreaDb';
import type { IAreaRepository } from '@/features/areas/domain/ports';
import type { Area } from '@/features/areas/domain/entities';
import { AreaDuplicadaError } from '@/features/areas/domain/errors';

// ---- Mock auth session (usuarios route.test.ts precedent) ----

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
}));

// ---- Import under test (after mocks) ----

import { GET, POST } from '../route';

// ---- Helpers ----

function createJsonRequest(body: unknown): Request {
  return { json: () => Promise.resolve(body) } as Request;
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

describe('/api/areas GET', () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue(adminSession);
  });

  afterEach(() => {
    __setAreaDbForTests(null);
    vi.restoreAllMocks();
  });

  it('returns 401 without an admin session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET();

    expect(res.status).toBe(401);
  });

  it('returns 401 when the session lacks the admin permiso', async () => {
    mockGetSession.mockResolvedValue({ ...adminSession, permisos: ['consolidados'] });
    const res = await GET();

    expect(res.status).toBe(401);
  });

  it('returns the area list', async () => {
    const repo = makeMockRepo({ list: vi.fn().mockResolvedValue([row]) });
    __setAreaDbForTests(repo);
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.areas).toEqual([row]);
  });
});

describe('/api/areas POST', () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue(adminSession);
  });

  afterEach(() => {
    __setAreaDbForTests(null);
    vi.restoreAllMocks();
  });

  it('creates an area and returns it', async () => {
    const create = vi.fn().mockResolvedValue(row);
    const repo = makeMockRepo({ create, findByNombre: vi.fn().mockResolvedValue(null) });
    __setAreaDbForTests(repo);
    const res = await POST(createJsonRequest({ nombre: 'Ventas' }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.area).toEqual(row);
    expect(create).toHaveBeenCalledWith({ nombre: 'Ventas', descripcion: null });
  });

  it('trims the nombre', async () => {
    const create = vi.fn().mockResolvedValue(row);
    const repo = makeMockRepo({ create, findByNombre: vi.fn().mockResolvedValue(null) });
    __setAreaDbForTests(repo);
    await POST(createJsonRequest({ nombre: '  Ventas  ' }));

    expect(create).toHaveBeenCalledWith({ nombre: 'Ventas', descripcion: null });
  });

  it('returns 400 when nombre is missing or blank', async () => {
    const repo = makeMockRepo();
    __setAreaDbForTests(repo);
    const res = await POST(createJsonRequest({ nombre: '   ' }));

    expect(res.status).toBe(400);
  });

  it('returns 400 when descripcion is not a string or null', async () => {
    const repo = makeMockRepo();
    __setAreaDbForTests(repo);
    const res = await POST(createJsonRequest({ nombre: 'X', descripcion: 42 }));

    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid JSON body', async () => {
    const repo = makeMockRepo();
    __setAreaDbForTests(repo);
    const badRequest = { json: () => Promise.reject(new Error('bad')) } as unknown as Request;
    const res = await POST(badRequest);

    expect(res.status).toBe(400);
  });

  it('returns 409 when the active nombre already exists', async () => {
    const repo = makeMockRepo({
      findByNombre: vi.fn().mockResolvedValue(row),
    });
    __setAreaDbForTests(repo);
    const res = await POST(createJsonRequest({ nombre: 'Ventas' }));

    expect(res.status).toBe(409);
  });

  it('returns 500 when the repository fails', async () => {
    const repo = makeMockRepo({
      findByNombre: vi.fn().mockRejectedValue(new Error('db down')),
    });
    __setAreaDbForTests(repo);
    const res = await POST(createJsonRequest({ nombre: 'Ventas' }));

    expect(res.status).toBe(500);
  });
});

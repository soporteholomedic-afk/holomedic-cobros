import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mock auth session (auth/me route.test.ts precedent) ----

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
}));

// ---- Import under test (after mocks) ----

import { GET, POST } from '../route';
import { __setCrmDbForTests, type CrmDb } from '@/features/crm/infrastructure/getCrmDb';
import type { CrmEmpresaRepositoryPort } from '@/features/crm/domain/ports';
import { ConflictError, ValidationError } from '@/features/crm/domain/errors';
import type { Empresa } from '@/features/crm/domain/entities';

// ---- Fixtures ----

const empresa: Empresa = {
  id: 1,
  ruc: '900123456',
  rucNormalizado: '900123456',
  razonSocial: 'Constructora X',
  tipo: 'Cliente',
  origen: 'Inbound',
  proyectoObra: 'Obra San Isidro',
  destinoComun: null,
  notas: null,
  responsable: 'jperez',
  contactos: [
    {
      id: 11,
      empresaId: 1,
      nombre: 'Ana',
      telefono: '987654321',
      esPrincipal: true,
      correos: [{ id: 111, contactoId: 11, correo: 'ana@x.com' }],
    },
  ],
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
    actividades: {} as never,
    asignaciones: {} as never,
  } satisfies CrmDb);
}

const sessionBase = { sub: 'u-1', nombre: 'Juana Perez', area: 'ventas' };

function jsonPost(body: unknown): Request {
  return new Request('http://localhost/api/crm/empresas', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockReset();
});

afterEach(() => {
  __setCrmDbForTests(null);
});

// ---- GET /api/crm/empresas ----

describe('GET /api/crm/empresas', () => {
  it('returns 401 UNAUTHORIZED without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    setDb(makeFakeRepo());

    const response = await GET(new Request('http://localhost/api/crm/empresas'));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 FORBIDDEN without the crm permiso', async () => {
    mockGetSession.mockResolvedValue({ ...sessionBase, permisos: ['cobranza'] });
    setDb(makeFakeRepo());

    const response = await GET(new Request('http://localhost/api/crm/empresas'));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe('FORBIDDEN');
  });

  it('returns 200 with empresas and forwards q/tipo filters to the use case', async () => {
    mockGetSession.mockResolvedValue({ ...sessionBase, permisos: ['crm'] });
    const listar = vi.fn().mockResolvedValue([empresa]);
    setDb(makeFakeRepo({ listar }));

    const response = await GET(
      new Request('http://localhost/api/crm/empresas?q=constructora&tipo=Cliente'),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(listar).toHaveBeenCalledWith({ q: 'constructora', tipo: 'Cliente' });
    expect(body.success).toBe(true);
    expect(body.empresas).toEqual([empresa]);
  });

  it('sends no filters when the query string is absent', async () => {
    mockGetSession.mockResolvedValue({ ...sessionBase, permisos: ['crm'] });
    const listar = vi.fn().mockResolvedValue([]);
    setDb(makeFakeRepo({ listar }));

    const response = await GET(new Request('http://localhost/api/crm/empresas'));

    expect(response.status).toBe(200);
    expect(listar).toHaveBeenCalledWith({});
  });

  it('returns 400 VALIDATION_ERROR for an unknown tipo value', async () => {
    mockGetSession.mockResolvedValue({ ...sessionBase, permisos: ['crm'] });
    setDb(makeFakeRepo());

    const response = await GET(new Request('http://localhost/api/crm/empresas?tipo=Lead'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 500 INTERNAL_ERROR on an unexpected repository failure', async () => {
    mockGetSession.mockResolvedValue({ ...sessionBase, permisos: ['crm'] });
    setDb(makeFakeRepo({ listar: vi.fn().mockRejectedValue(new Error('db down')) }));

    const response = await GET(new Request('http://localhost/api/crm/empresas'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});

// ---- POST /api/crm/empresas ----

describe('POST /api/crm/empresas', () => {
  // Deliberately untrimmed / unmarked: trimming and the default principal
  // are application-layer rules proven by the pr3 use-case suite — here we
  // assert the route hands the parsed body to the use case untouched.
  const payload = {
    ruc: ' 900-123456 ',
    razonSocial: 'Constructora X',
    tipo: 'Prospecto',
    contactos: [{ nombre: 'Ana', correos: ['ana@x.com'] }],
  };

  it('returns 401 UNAUTHORIZED without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    setDb(makeFakeRepo());

    const response = await POST(jsonPost(payload));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 when only crm is held — writes require crm_admin in-route', async () => {
    mockGetSession.mockResolvedValue({ ...sessionBase, permisos: ['crm'] });
    setDb(makeFakeRepo());

    const response = await POST(jsonPost(payload));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe('FORBIDDEN');
  });

  it('creates an empresa (201) and returns it', async () => {
    mockGetSession.mockResolvedValue({ ...sessionBase, permisos: ['crm', 'crm_admin'] });
    const crear = vi.fn().mockResolvedValue(empresa);
    setDb(makeFakeRepo({ crear }));

    const response = await POST(jsonPost(payload));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(crear).toHaveBeenCalledWith(
      expect.objectContaining({
        ruc: ' 900-123456 ',
        razonSocial: 'Constructora X',
        contactos: [expect.objectContaining({ nombre: 'Ana', esPrincipal: true })],
      }),
    );
    expect(body.success).toBe(true);
    expect(body.empresa).toEqual(empresa);
  });

  it('maps ConflictError (duplicate normalized RUC) to 409 CONFLICT_ERROR', async () => {
    mockGetSession.mockResolvedValue({ ...sessionBase, permisos: ['crm', 'crm_admin'] });
    setDb(
      makeFakeRepo({
        crear: vi.fn().mockRejectedValue(new ConflictError('Ya existe una empresa con ese RUC')),
      }),
    );

    const response = await POST(jsonPost(payload));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe('CONFLICT_ERROR');
    expect(body.error).toBe('Ya existe una empresa con ese RUC');
  });

  it('maps ValidationError from the use case to 400 VALIDATION_ERROR', async () => {
    mockGetSession.mockResolvedValue({ ...sessionBase, permisos: ['crm', 'crm_admin'] });
    const crear = vi.fn().mockRejectedValue(new ValidationError('Cada contacto requiere al menos un correo'));
    setDb(makeFakeRepo({ crear }));

    // Shape-valid (correos is a string array) but business-invalid (empty).
    // The use case rejects BEFORE any repo call — no write must happen.
    const response = await POST(jsonPost({ ...payload, contactos: [{ nombre: 'Ana', correos: [] }] }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(crear).not.toHaveBeenCalled();
  });

  it('returns 400 for a malformed JSON body', async () => {
    mockGetSession.mockResolvedValue({ ...sessionBase, permisos: ['crm', 'crm_admin'] });
    setDb(makeFakeRepo());

    const response = await POST(jsonPost('{not-json'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for a body missing required fields', async () => {
    mockGetSession.mockResolvedValue({ ...sessionBase, permisos: ['crm', 'crm_admin'] });
    setDb(makeFakeRepo());

    const response = await POST(jsonPost({ ruc: '123', razonSocial: 'Sin tipo ni contactos' }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 500 INTERNAL_ERROR on an unexpected failure', async () => {
    mockGetSession.mockResolvedValue({ ...sessionBase, permisos: ['crm', 'crm_admin'] });
    setDb(makeFakeRepo({ crear: vi.fn().mockRejectedValue(new Error('db down')) }));

    const response = await POST(jsonPost(payload));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __setCrmDbForTests } from '@/features/crm/infrastructure/getCrmDb';
import type { ICrmEmpresaRepository } from '@/features/crm/domain/ports';
import type { Empresa } from '@/features/crm/domain/entities';

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
}));

import { GET, POST } from '../route';

function createJsonRequest(body: unknown): Request {
  return { json: () => Promise.resolve(body) } as Request;
}

const crmSession = {
  sub: 'u-1',
  nombre: 'Scott Palomino',
  area: 'Comercial',
  permisos: ['crm' as const],
};

const sinCrmSession = { ...crmSession, permisos: ['cobranza' as const] };

const FILA: Empresa = {
  idEmpresa: 'e-1',
  razonSocial: 'Constructora Andina S.A.C.',
  ruc: '20512345678',
  sector: 'Construcción',
  contactoNombre: 'Marcela Quispe',
  contactoTelefono: '987 654 321',
  contactoCorreo: null,
  notas: null,
  etapa: 'por_contactar',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function makeMockRepo(overrides: Partial<ICrmEmpresaRepository> = {}): ICrmEmpresaRepository {
  return {
    getById: vi.fn(),
    findByRuc: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockImplementation(async (input) => ({ ...FILA, ...input })),
    updateEtapa: vi.fn(),
    ...overrides,
  };
}

const VALIDO = {
  razonSocial: 'Minera Los Tres Picos S.A.',
  ruc: '20601234567',
  sector: 'Minería y Energía',
  contactoNombre: 'Jorge Salazar',
  contactoTelefono: '954 112 308',
};

describe('/api/crm/empresas GET', () => {
  beforeEach(() => mockGetSession.mockResolvedValue(crmSession));
  afterEach(() => {
    __setCrmDbForTests(null);
    vi.restoreAllMocks();
  });

  it('returns the empresas for a session with the crm permiso', async () => {
    const list = vi.fn().mockResolvedValue([FILA]);
    __setCrmDbForTests(makeMockRepo({ list }));
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, empresas: [FILA] });
  });

  it('returns 401 without a session and never touches the database', async () => {
    mockGetSession.mockResolvedValue(null);
    const list = vi.fn();
    __setCrmDbForTests(makeMockRepo({ list }));
    const res = await GET();
    expect(res.status).toBe(401);
    expect((await res.json()).success).toBe(false);
    expect(list).not.toHaveBeenCalled();
  });

  it('returns 401 for a session without the crm permiso', async () => {
    mockGetSession.mockResolvedValue(sinCrmSession);
    const list = vi.fn();
    __setCrmDbForTests(makeMockRepo({ list }));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(list).not.toHaveBeenCalled();
  });

  it('returns a generic 500 without leaking the internal error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    __setCrmDbForTests(
      makeMockRepo({ list: vi.fn().mockRejectedValue(new Error('Login failed for user sa')) }),
    );
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('Login failed');
  });
});

describe('/api/crm/empresas POST', () => {
  beforeEach(() => mockGetSession.mockResolvedValue(crmSession));
  afterEach(() => {
    __setCrmDbForTests(null);
    vi.restoreAllMocks();
  });

  it('creates the empresa in "por_contactar" and answers 201 with it', async () => {
    const create = vi.fn().mockImplementation(async (input) => ({ ...FILA, ...input }));
    __setCrmDbForTests(makeMockRepo({ create }));
    const res = await POST(createJsonRequest(VALIDO));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.empresa.razonSocial).toBe('Minera Los Tres Picos S.A.');
    expect(body.empresa.etapa).toBe('por_contactar');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('returns 401 without a session or without crm, and stores nothing', async () => {
    const create = vi.fn();
    __setCrmDbForTests(makeMockRepo({ create }));
    for (const s of [null, sinCrmSession]) {
      mockGetSession.mockResolvedValue(s);
      const res = await POST(createJsonRequest(VALIDO));
      expect(res.status).toBe(401);
    }
    expect(create).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid JSON and stores nothing', async () => {
    const create = vi.fn();
    __setCrmDbForTests(makeMockRepo({ create }));
    const bad = { json: () => Promise.reject(new Error('bad')) } as unknown as Request;
    const res = await POST(bad);
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    ['a non-object body', 'texto'],
    ['a null body', null],
    ['a missing required field', { ...VALIDO, razonSocial: undefined }],
    ['a numeric RUC', { ...VALIDO, ruc: 20601234567 }],
    ['a non-string optional field', { ...VALIDO, notas: 5 }],
  ])('returns 400 for %s and stores nothing', async (_t, body) => {
    const create = vi.fn();
    __setCrmDbForTests(makeMockRepo({ create }));
    const res = await POST(createJsonRequest(body));
    expect(res.status).toBe(400);
    expect((await res.json()).success).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it('returns 400 with the validation message for a malformed RUC and stores nothing', async () => {
    const create = vi.fn();
    __setCrmDbForTests(makeMockRepo({ create }));
    const res = await POST(createJsonRequest({ ...VALIDO, ruc: '1234' }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe('El RUC debe tener 11 dígitos');
    expect(create).not.toHaveBeenCalled();
  });

  it('returns 409 for a duplicate RUC and stores nothing', async () => {
    const create = vi.fn();
    __setCrmDbForTests(makeMockRepo({ create, findByRuc: vi.fn().mockResolvedValue(FILA) }));
    const res = await POST(createJsonRequest({ ...VALIDO, ruc: FILA.ruc }));
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.error).toContain(FILA.ruc);
    expect(create).not.toHaveBeenCalled();
  });

  it('returns 409 when the database rejects a concurrent duplicate on create', async () => {
    const { RucDuplicadoError } = await import('@/features/crm/domain/errors');
    __setCrmDbForTests(
      makeMockRepo({ create: vi.fn().mockRejectedValue(new RucDuplicadoError(VALIDO.ruc)) }),
    );
    const res = await POST(createJsonRequest(VALIDO));
    expect(res.status).toBe(409);
  });

  it('returns a generic 500 without leaking the internal error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    __setCrmDbForTests(
      makeMockRepo({ create: vi.fn().mockRejectedValue(new Error('Login failed for user sa')) }),
    );
    const res = await POST(createJsonRequest(VALIDO));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('Login failed');
  });
});

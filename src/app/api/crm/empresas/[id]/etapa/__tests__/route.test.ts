import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __setCrmDbForTests } from '@/features/crm/infrastructure/getCrmDb';
import type { ICrmEmpresaRepository } from '@/features/crm/domain/ports';
import type { Empresa } from '@/features/crm/domain/entities';
import { EmpresaNotFoundError } from '@/features/crm/domain/errors';

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
}));

import { PATCH } from '../route';

function createJsonRequest(body: unknown): Request {
  return { json: () => Promise.resolve(body) } as Request;
}

function routeContext(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

const crmSession = {
  sub: 'u-1',
  nombre: 'Scott Palomino',
  area: 'Comercial',
  permisos: ['crm' as const],
};

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
    findByRuc: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    updateEtapa: vi.fn().mockImplementation(async (_id, etapa) => ({ ...FILA, etapa })),
    ...overrides,
  };
}

describe('/api/crm/empresas/[id]/etapa PATCH', () => {
  beforeEach(() => mockGetSession.mockResolvedValue(crmSession));
  afterEach(() => {
    __setCrmDbForTests(null);
    vi.restoreAllMocks();
  });

  it('moves the empresa and returns it', async () => {
    const updateEtapa = vi.fn().mockResolvedValue({ ...FILA, etapa: 'contactado' });
    __setCrmDbForTests(makeMockRepo({ updateEtapa }));
    const res = await PATCH(createJsonRequest({ etapa: 'contactado' }), routeContext('e-1'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.empresa.etapa).toBe('contactado');
    expect(updateEtapa).toHaveBeenCalledWith('e-1', 'contactado');
  });

  it('returns 401 without a session or without the crm permiso, and moves nothing', async () => {
    const updateEtapa = vi.fn();
    __setCrmDbForTests(makeMockRepo({ updateEtapa }));
    for (const s of [null, { ...crmSession, permisos: ['cobranza' as const] }]) {
      mockGetSession.mockResolvedValue(s);
      const res = await PATCH(createJsonRequest({ etapa: 'cliente' }), routeContext('e-1'));
      expect(res.status).toBe(401);
    }
    expect(updateEtapa).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid JSON and moves nothing', async () => {
    const updateEtapa = vi.fn();
    __setCrmDbForTests(makeMockRepo({ updateEtapa }));
    const bad = { json: () => Promise.reject(new Error('bad')) } as unknown as Request;
    const res = await PATCH(bad, routeContext('e-1'));
    expect(res.status).toBe(400);
    expect(updateEtapa).not.toHaveBeenCalled();
  });

  it.each([
    ['a body without etapa', {}],
    ['a non-string etapa', { etapa: 3 }],
    ['an unknown column', { etapa: 'archivada' }],
    ['a null body', null],
  ])('returns 400 for %s and moves nothing', async (_t, body) => {
    const updateEtapa = vi.fn();
    __setCrmDbForTests(makeMockRepo({ updateEtapa }));
    const res = await PATCH(createJsonRequest(body), routeContext('e-1'));
    expect(res.status).toBe(400);
    expect((await res.json()).success).toBe(false);
    expect(updateEtapa).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown empresa id', async () => {
    __setCrmDbForTests(
      makeMockRepo({ updateEtapa: vi.fn().mockRejectedValue(new EmpresaNotFoundError('nope')) }),
    );
    const res = await PATCH(createJsonRequest({ etapa: 'cliente' }), routeContext('nope'));
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });

  it('returns a generic 500 without leaking the internal error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    __setCrmDbForTests(
      makeMockRepo({ updateEtapa: vi.fn().mockRejectedValue(new Error('Login failed for user sa')) }),
    );
    const res = await PATCH(createJsonRequest({ etapa: 'cliente' }), routeContext('e-1'));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('Login failed');
  });
});

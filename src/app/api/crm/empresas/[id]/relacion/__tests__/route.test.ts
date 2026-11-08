import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __setCrmDbForTests } from '@/features/crm/infrastructure/getCrmDb';
import {
  FILA,
  createJsonRequest,
  crmSession,
  invalidJsonRequest,
  makeMockRepo,
  routeContext,
  sinCrmSession,
} from '../../../../_lib/__tests__/fixtures';

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({ getSession: mockGetSession }));

import { PATCH } from '../route';

describe('/api/crm/empresas/[id]/relacion PATCH', () => {
  beforeEach(() => mockGetSession.mockResolvedValue(crmSession));
  afterEach(() => {
    __setCrmDbForTests(null);
    vi.restoreAllMocks();
  });

  it('writes the relationship and answers 200 { empresa }', async () => {
    const updateRelacion = vi.fn().mockImplementation(async (_id, relacion) => ({ ...FILA, relacion }));
    __setCrmDbForTests(makeMockRepo({ updateRelacion }));
    const res = await PATCH(createJsonRequest({ relacion: 'cliente' }), routeContext('e-1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, empresa: { idEmpresa: 'e-1', relacion: 'cliente' } });
    expect(updateRelacion).toHaveBeenCalledWith('e-1', 'cliente');
  });

  it('accepts prospecto too', async () => {
    const updateRelacion = vi.fn().mockImplementation(async (_id, relacion) => ({ ...FILA, relacion }));
    __setCrmDbForTests(makeMockRepo({ updateRelacion }));
    const res = await PATCH(createJsonRequest({ relacion: 'prospecto' }), routeContext('e-1'));
    expect(res.status).toBe(200);
    expect(updateRelacion).toHaveBeenCalledWith('e-1', 'prospecto');
  });

  it.each([
    ['an unknown value', { relacion: 'perdido' }],
    ['a numeric value', { relacion: 3 }],
    ['a missing value', {}],
  ])('answers 400 for %s and writes nothing', async (_n, body) => {
    const updateRelacion = vi.fn();
    __setCrmDbForTests(makeMockRepo({ updateRelacion }));
    const res = await PATCH(createJsonRequest(body), routeContext('e-1'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Cuerpo inválido/);
    expect(updateRelacion).not.toHaveBeenCalled();
  });

  it('answers 400 for a body that is not JSON', async () => {
    __setCrmDbForTests(makeMockRepo());
    expect((await PATCH(invalidJsonRequest(), routeContext('e-1'))).status).toBe(400);
  });

  it('answers 404 for an unknown empresa (EmpresaNotFoundError from the repository)', async () => {
    const { EmpresaNotFoundError } = await import('@/features/crm/domain/errors');
    const updateRelacion = vi.fn().mockRejectedValue(new EmpresaNotFoundError('nope'));
    __setCrmDbForTests(makeMockRepo({ updateRelacion }));
    const res = await PATCH(createJsonRequest({ relacion: 'cliente' }), routeContext('nope'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ success: false, error: 'Empresa no encontrada' });
  });

  it('answers 401 without a session and without the crm permiso', async () => {
    __setCrmDbForTests(makeMockRepo());
    mockGetSession.mockResolvedValue(null);
    expect((await PATCH(createJsonRequest({ relacion: 'cliente' }), routeContext('e-1'))).status).toBe(401);
    mockGetSession.mockResolvedValue(sinCrmSession);
    expect((await PATCH(createJsonRequest({ relacion: 'cliente' }), routeContext('e-1'))).status).toBe(401);
  });

  it('answers 500 without leaking the cause when storage fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    __setCrmDbForTests(makeMockRepo({ updateRelacion: vi.fn().mockRejectedValue(new Error('secret')) }));
    const res = await PATCH(createJsonRequest({ relacion: 'cliente' }), routeContext('e-1'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'Error al guardar la relación' });
  });
});

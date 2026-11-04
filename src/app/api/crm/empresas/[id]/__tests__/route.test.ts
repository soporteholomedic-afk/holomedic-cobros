import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __setCrmDbForTests } from '@/features/crm/infrastructure/getCrmDb';
import { RucDuplicadoError } from '@/features/crm/domain/errors';
import {
  FILA,
  VALIDO,
  createJsonRequest,
  crmSession,
  invalidJsonRequest,
  makeMockRepo,
  routeContext,
  sinCrmSession,
} from '../../../_lib/__tests__/fixtures';

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({ getSession: mockGetSession }));

import { PATCH } from '../route';

const existente = () => makeMockRepo({ getById: vi.fn().mockResolvedValue(FILA) });

describe('/api/crm/empresas/[id] PATCH', () => {
  beforeEach(() => mockGetSession.mockResolvedValue(crmSession));
  afterEach(() => {
    __setCrmDbForTests(null);
    vi.restoreAllMocks();
  });

  it('replaces the empresa data and its contacts', async () => {
    const update = vi.fn().mockImplementation(async (_id, datos) => ({ ...FILA, ...datos }));
    __setCrmDbForTests(makeMockRepo({ getById: vi.fn().mockResolvedValue(FILA), update }));
    const res = await PATCH(createJsonRequest(VALIDO), routeContext('e-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.empresa.razonSocial).toBe('Minera Los Tres Picos S.A.');
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]?.[0]).toBe('e-1');
    expect(update.mock.calls[0]?.[1].contactos).toHaveLength(2);
  });

  it('returns 401 without the permiso and writes nothing', async () => {
    mockGetSession.mockResolvedValue(sinCrmSession);
    const update = vi.fn();
    __setCrmDbForTests(makeMockRepo({ update }));
    const res = await PATCH(createJsonRequest(VALIDO), routeContext('e-1'));
    expect(res.status).toBe(401);
    expect(update).not.toHaveBeenCalled();
  });

  it('returns 400 for non-JSON and for a body with the wrong shape', async () => {
    __setCrmDbForTests(existente());
    expect((await PATCH(invalidJsonRequest(), routeContext('e-1'))).status).toBe(400);
    expect((await PATCH(createJsonRequest({ razonSocial: 'A' }), routeContext('e-1'))).status).toBe(400);
  });

  it('returns 400 for invalid data and leaves the empresa untouched', async () => {
    const update = vi.fn();
    __setCrmDbForTests(makeMockRepo({ getById: vi.fn().mockResolvedValue(FILA), update }));
    const res = await PATCH(createJsonRequest({ ...VALIDO, ruc: '123' }), routeContext('e-1'));
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown id', async () => {
    const update = vi.fn();
    __setCrmDbForTests(makeMockRepo({ update }));
    const res = await PATCH(createJsonRequest(VALIDO), routeContext('nope'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ success: false, error: 'Empresa no encontrada' });
    expect(update).not.toHaveBeenCalled();
  });

  it('returns 409 when the RUC belongs to another empresa', async () => {
    const otra = { ...FILA, idEmpresa: 'e-2' };
    const update = vi.fn();
    __setCrmDbForTests(
      makeMockRepo({ getById: vi.fn().mockResolvedValue(FILA), findByRuc: vi.fn().mockResolvedValue(otra), update }),
    );
    const res = await PATCH(createJsonRequest(VALIDO), routeContext('e-1'));
    expect(res.status).toBe(409);
    expect(update).not.toHaveBeenCalled();

    __setCrmDbForTests(
      makeMockRepo({
        getById: vi.fn().mockResolvedValue(FILA),
        update: vi.fn().mockRejectedValue(new RucDuplicadoError(VALIDO.ruc)),
      }),
    );
    expect((await PATCH(createJsonRequest(VALIDO), routeContext('e-1'))).status).toBe(409);
  });

  it('returns 500 without leaking the cause when storage fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    __setCrmDbForTests(
      makeMockRepo({ getById: vi.fn().mockResolvedValue(FILA), update: vi.fn().mockRejectedValue(new Error('secret')) }),
    );
    const res = await PATCH(createJsonRequest(VALIDO), routeContext('e-1'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'Error al guardar la empresa' });
  });
});

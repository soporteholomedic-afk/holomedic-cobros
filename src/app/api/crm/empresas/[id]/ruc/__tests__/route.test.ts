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

const SIN_RUC = { ...FILA, idEmpresa: 'e-sin', razonSocial: 'Gráfica Sur', ruc: null, etapa: 'contactado' as const, medio: 'correo' as const };
const OTRA = { ...FILA, idEmpresa: 'e-otra', razonSocial: 'Gráfica Sur S.A.C.', ruc: '20601234567', etapa: 'en_seguimiento' as const, medio: 'llamada' as const };

describe('PATCH /api/crm/empresas/[id]/ruc', () => {
  beforeEach(() => mockGetSession.mockResolvedValue(crmSession));
  afterEach(() => {
    __setCrmDbForTests(null);
    vi.restoreAllMocks();
  });

  it('saves a free RUC and answers 200 { empresa }', async () => {
    const update = vi.fn().mockImplementation(async (_id, datos) => ({ ...SIN_RUC, ...datos }));
    __setCrmDbForTests(makeMockRepo({ getById: vi.fn().mockResolvedValue(SIN_RUC), update }));
    const res = await PATCH(createJsonRequest({ ruc: '20601234567' }), routeContext('e-sin'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, empresa: { idEmpresa: 'e-sin', ruc: '20601234567' } });
    expect(update).toHaveBeenCalledWith('e-sin', expect.objectContaining({ ruc: '20601234567', razonSocial: 'Gráfica Sur' }));
  });

  it('answers 409 with { error, otra } when another empresa holds the RUC, and merges nothing', async () => {
    const repo = makeMockRepo({
      getById: vi.fn().mockResolvedValue(SIN_RUC),
      findByRuc: vi.fn().mockResolvedValue(OTRA),
    });
    __setCrmDbForTests(repo);
    const res = await PATCH(createJsonRequest({ ruc: '20601234567' }), routeContext('e-sin'));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      success: false,
      error: 'Este RUC ya es de Gráfica Sur S.A.C. («En seguimiento»). ¿Unir las dos tarjetas?',
      otra: { idEmpresa: 'e-otra', razonSocial: 'Gráfica Sur S.A.C.', etapa: 'en_seguimiento' },
    });
    expect(repo.fusionar).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('merges when unir is true and answers 200 with the destination', async () => {
    const fusionar = vi.fn().mockResolvedValue(OTRA);
    __setCrmDbForTests(
      makeMockRepo({
        getById: vi.fn().mockResolvedValue(SIN_RUC),
        findByRuc: vi.fn().mockResolvedValue(OTRA),
        fusionar,
      }),
    );
    const res = await PATCH(createJsonRequest({ ruc: '20601234567', unir: true }), routeContext('e-sin'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, empresa: { idEmpresa: 'e-otra' } });
    expect(fusionar).toHaveBeenCalledWith('e-sin', 'e-otra');
  });

  it('answers 400 "El RUC debe tener 11 dígitos." and stores nothing', async () => {
    const repo = makeMockRepo({ getById: vi.fn().mockResolvedValue(SIN_RUC) });
    __setCrmDbForTests(repo);
    const res = await PATCH(createJsonRequest({ ruc: '123' }), routeContext('e-sin'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: 'El RUC debe tener 11 dígitos.' });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('answers 400 for a body of the wrong shape and for non-JSON, 404 for an unknown empresa', async () => {
    __setCrmDbForTests(makeMockRepo());
    expect((await PATCH(createJsonRequest({ ruc: 20601234567 }), routeContext('e-sin'))).status).toBe(400);
    expect((await PATCH(createJsonRequest({ ruc: '20601234567', unir: 'si' }), routeContext('e-sin'))).status).toBe(400);
    expect((await PATCH(invalidJsonRequest(), routeContext('e-sin'))).status).toBe(400);
    expect((await PATCH(createJsonRequest({ ruc: '20601234567' }), routeContext('nope'))).status).toBe(404);
  });

  it('answers 401 without a session and without the crm permiso', async () => {
    __setCrmDbForTests(makeMockRepo());
    mockGetSession.mockResolvedValue(null);
    expect((await PATCH(createJsonRequest({ ruc: '20601234567' }), routeContext('e-sin'))).status).toBe(401);
    mockGetSession.mockResolvedValue(sinCrmSession);
    expect((await PATCH(createJsonRequest({ ruc: '20601234567' }), routeContext('e-sin'))).status).toBe(401);
  });

  it('answers 500 without leaking the cause when storage fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    __setCrmDbForTests(makeMockRepo({ getById: vi.fn().mockRejectedValue(new Error('secret')) }));
    const res = await PATCH(createJsonRequest({ ruc: '20601234567' }), routeContext('e-sin'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'Error al guardar el RUC' });
  });
});

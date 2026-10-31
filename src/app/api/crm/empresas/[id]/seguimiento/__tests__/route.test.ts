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

const CONTACTADO = { ...FILA, etapa: 'contactado' as const, medio: 'llamada' as const };
const PERDIDA = {
  ...FILA,
  etapa: 'perdido' as const,
  medio: 'llamada' as const,
  motivo: { categoria: 'proveedor' as const, detalle1: 'Norte', detalle2: null, notas: null },
};

describe('/api/crm/empresas/[id]/seguimiento PATCH', () => {
  beforeEach(() => mockGetSession.mockResolvedValue(crmSession));
  afterEach(() => {
    __setCrmDbForTests(null);
    vi.restoreAllMocks();
  });

  it('changes only the medium and keeps the stage', async () => {
    const updateEstado = vi.fn().mockImplementation(async (_id, estado) => ({ ...CONTACTADO, ...estado }));
    __setCrmDbForTests(makeMockRepo({ getById: vi.fn().mockResolvedValue(CONTACTADO), updateEstado }));
    const res = await PATCH(createJsonRequest({ medio: 'correo' }), routeContext('e-1'));
    expect(res.status).toBe(200);
    expect(updateEstado).toHaveBeenCalledWith('e-1', { etapa: 'contactado', medio: 'correo', motivo: null });
  });

  it('changes only the reason of a lost empresa and keeps its medium', async () => {
    const updateEstado = vi.fn().mockImplementation(async (_id, estado) => ({ ...PERDIDA, ...estado }));
    __setCrmDbForTests(makeMockRepo({ getById: vi.fn().mockResolvedValue(PERDIDA), updateEstado }));
    const res = await PATCH(
      createJsonRequest({ motivo: { categoria: 'precio', detalle1: 'S/ 7,000' } }),
      routeContext('e-1'),
    );
    expect(res.status).toBe(200);
    expect(updateEstado).toHaveBeenCalledWith('e-1', {
      etapa: 'perdido',
      medio: 'llamada',
      motivo: { categoria: 'precio', detalle1: 'S/ 7,000', detalle2: null, notas: null },
    });
  });

  it.each([
    ['an empty body', {}],
    ['a medio that is not text or null', { medio: 7 }],
    ['a motivo that is not an object', { motivo: 'caro' }],
    ['a motivo set to null', { motivo: null }],
  ])('returns 400 for %s', async (_n, body) => {
    const updateEstado = vi.fn();
    __setCrmDbForTests(makeMockRepo({ getById: vi.fn().mockResolvedValue(CONTACTADO), updateEstado }));
    const res = await PATCH(createJsonRequest(body), routeContext('e-1'));
    expect(res.status).toBe(400);
    expect(updateEstado).not.toHaveBeenCalled();
  });

  it('rejects a medium outside the three, a medium on Por contactar and a reason outside Perdido', async () => {
    const updateEstado = vi.fn();
    __setCrmDbForTests(makeMockRepo({ getById: vi.fn().mockResolvedValue(CONTACTADO), updateEstado }));
    expect((await PATCH(createJsonRequest({ medio: 'paloma' }), routeContext('e-1'))).status).toBe(400);
    expect((await PATCH(createJsonRequest({ medio: null }), routeContext('e-1'))).status).toBe(400);
    expect(
      (await PATCH(createJsonRequest({ motivo: { categoria: 'precio', detalle1: 'x' } }), routeContext('e-1'))).status,
    ).toBe(400);
    __setCrmDbForTests(makeMockRepo({ getById: vi.fn().mockResolvedValue(FILA), updateEstado }));
    expect((await PATCH(createJsonRequest({ medio: 'llamada' }), routeContext('e-1'))).status).toBe(400);
    expect(updateEstado).not.toHaveBeenCalled();
  });

  it('returns 400 for non-JSON, 404 for an unknown id and 401 without the permiso', async () => {
    __setCrmDbForTests(makeMockRepo());
    expect((await PATCH(invalidJsonRequest(), routeContext('e-1'))).status).toBe(400);
    expect((await PATCH(createJsonRequest({ medio: 'correo' }), routeContext('nope'))).status).toBe(404);
    mockGetSession.mockResolvedValue(sinCrmSession);
    expect((await PATCH(createJsonRequest({ medio: 'correo' }), routeContext('e-1'))).status).toBe(401);
  });

  it('returns 500 without leaking the cause when storage fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    __setCrmDbForTests(
      makeMockRepo({ getById: vi.fn().mockResolvedValue(CONTACTADO), updateEstado: vi.fn().mockRejectedValue(new Error('x')) }),
    );
    const res = await PATCH(createJsonRequest({ medio: 'correo' }), routeContext('e-1'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'Error al guardar el seguimiento' });
  });
});

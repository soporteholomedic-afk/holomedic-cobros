import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __setCrmOportunidadesDbForTests } from '@/features/crm/infrastructure/getCrmDb';
import {
  OPORTUNIDAD,
  createJsonRequest,
  crmSession,
  invalidJsonRequest,
  makeMockOportunidadesRepo,
  routeContext,
  sinCrmSession,
} from '../../../../_lib/__tests__/fixtures';

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({ getSession: mockGetSession }));

import { PATCH } from '../route';

const EN_SEGUIMIENTO = { ...OPORTUNIDAD, etapa: 'en_seguimiento' as const, medio: 'llamada' as const };
const POR_CONTACTAR = { ...OPORTUNIDAD, etapa: 'por_contactar' as const, medio: null, medioOtro: null };
const PERDIDA = {
  ...OPORTUNIDAD,
  etapa: 'perdida' as const,
  medio: 'correo' as const,
  motivo: { categoria: 'precio', detalle1: 'S/ 7,000', detalle2: null, notas: null },
};

describe('/api/crm/oportunidades/[id]/seguimiento PATCH', () => {
  beforeEach(() => mockGetSession.mockResolvedValue(crmSession));
  afterEach(() => {
    __setCrmOportunidadesDbForTests(null);
    vi.restoreAllMocks();
  });

  it('edits the medium without moving the deal and answers 200 { oportunidad }', async () => {
    const updateSeguimiento = vi.fn().mockImplementation(async (_id, seguimiento) => ({ ...EN_SEGUIMIENTO, ...seguimiento }));
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo({ getById: vi.fn().mockResolvedValue(EN_SEGUIMIENTO), updateSeguimiento }));
    const res = await PATCH(createJsonRequest({ medio: 'whatsapp' }), routeContext('o-1'));
    expect(res.status).toBe(200);
    expect((await res.json()).oportunidad).toMatchObject({ etapa: 'en_seguimiento', medio: 'whatsapp' });
    expect(updateSeguimiento).toHaveBeenCalledWith(
      'o-1',
      expect.objectContaining({ etapa: 'en_seguimiento', medio: 'whatsapp', motivo: null }),
      null,
    );
  });

  it('edits the loss reason of a Perdida deal', async () => {
    const updateSeguimiento = vi.fn().mockImplementation(async (_id, seguimiento) => ({ ...PERDIDA, ...seguimiento }));
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo({ getById: vi.fn().mockResolvedValue(PERDIDA), updateSeguimiento }));
    const res = await PATCH(
      createJsonRequest({ motivo: { categoria: 'otro', detalle1: 'Postergado' } }),
      routeContext('o-1'),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).oportunidad).toMatchObject({ etapa: 'perdida' });
    expect(updateSeguimiento).toHaveBeenCalledWith(
      'o-1',
      expect.objectContaining({
        etapa: 'perdida',
        motivo: { categoria: 'otro', detalle1: 'Postergado', detalle2: null, notas: null },
      }),
      null,
    );
  });

  it.each([
    ['a medio on Por contactar', { medio: 'llamada' }, POR_CONTACTAR, 'Primero pasa la oportunidad a Contactado'],
    ['a motivo outside Perdida', { motivo: { categoria: 'precio', detalle1: 'S/ 7,000' } }, EN_SEGUIMIENTO, 'Solo una oportunidad en Perdida tiene motivo'],
    ['a motivo without the required detail', { motivo: { categoria: 'precio' } }, PERDIDA, 'Falta: Precio que les ofrecimos'],
  ])('answers 400 with the exact message for %s and stores nothing', async (_n, body, actual, mensaje) => {
    const updateSeguimiento = vi.fn();
    __setCrmOportunidadesDbForTests(
      makeMockOportunidadesRepo({ getById: vi.fn().mockResolvedValue(actual), updateSeguimiento }),
    );
    const res = await PATCH(createJsonRequest(body), routeContext('o-1'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: mensaje });
    expect(updateSeguimiento).not.toHaveBeenCalled();
  });

  it('answers 400 Cuerpo inválido for an empty body (the shape guard needs medio and/or motivo)', async () => {
    const updateSeguimiento = vi.fn();
    __setCrmOportunidadesDbForTests(
      makeMockOportunidadesRepo({ getById: vi.fn().mockResolvedValue(EN_SEGUIMIENTO), updateSeguimiento }),
    );
    const res = await PATCH(createJsonRequest({}), routeContext('o-1'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Cuerpo inválido/);
    expect(updateSeguimiento).not.toHaveBeenCalled();
  });

  it('answers 400 for a body of the wrong shape and for non-JSON', async () => {
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo());
    expect((await PATCH(createJsonRequest({ medio: 5 }), routeContext('o-1'))).status).toBe(400);
    expect((await PATCH(createJsonRequest({ motivo: 'caro' }), routeContext('o-1'))).status).toBe(400);
    expect((await PATCH(invalidJsonRequest(), routeContext('o-1'))).status).toBe(400);
  });

  it('answers 404 for an unknown oportunidad', async () => {
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo());
    const res = await PATCH(createJsonRequest({ medio: 'correo' }), routeContext('nope'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ success: false, error: 'Oportunidad no encontrada' });
  });

  it('answers 401 without a session and without the crm permiso', async () => {
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo());
    mockGetSession.mockResolvedValue(null);
    expect((await PATCH(createJsonRequest({ medio: 'correo' }), routeContext('o-1'))).status).toBe(401);
    mockGetSession.mockResolvedValue(sinCrmSession);
    expect((await PATCH(createJsonRequest({ medio: 'correo' }), routeContext('o-1'))).status).toBe(401);
  });

  it('answers 500 without leaking the cause when storage fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    __setCrmOportunidadesDbForTests(
      makeMockOportunidadesRepo({
        getById: vi.fn().mockResolvedValue(EN_SEGUIMIENTO),
        updateSeguimiento: vi.fn().mockRejectedValue(new Error('secret')),
      }),
    );
    const res = await PATCH(createJsonRequest({ medio: 'correo' }), routeContext('o-1'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'Error al guardar el seguimiento' });
  });
});

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

describe('/api/crm/oportunidades/[id]/etapa PATCH', () => {
  beforeEach(() => mockGetSession.mockResolvedValue(crmSession));
  afterEach(() => {
    __setCrmOportunidadesDbForTests(null);
    vi.restoreAllMocks();
  });

  it('moves the deal keeping its stored medium with just {etapa}', async () => {
    const updateSeguimiento = vi.fn().mockImplementation(async (_id, seguimiento) => ({ ...EN_SEGUIMIENTO, ...seguimiento }));
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo({ getById: vi.fn().mockResolvedValue(EN_SEGUIMIENTO), updateSeguimiento }));
    const res = await PATCH(createJsonRequest({ etapa: 'cotizado' }), routeContext('o-1'));
    expect(res.status).toBe(200);
    expect((await res.json()).oportunidad).toMatchObject({ etapa: 'cotizado', medio: 'llamada' });
    expect(updateSeguimiento).toHaveBeenCalledWith(
      'o-1',
      expect.objectContaining({ etapa: 'cotizado', medio: 'llamada', motivo: null, proximaAccion: EN_SEGUIMIENTO.proximaAccion }),
      null,
    );
  });

  it('moving to Ganada or Perdida clears the próxima acción; the empresa is never read or written', async () => {
    const updateSeguimiento = vi.fn().mockImplementation(async (_id, seguimiento) => ({ ...EN_SEGUIMIENTO, ...seguimiento }));
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo({ getById: vi.fn().mockResolvedValue(EN_SEGUIMIENTO), updateSeguimiento }));
    const res = await PATCH(createJsonRequest({ etapa: 'ganada' }), routeContext('o-1'));
    expect(res.status).toBe(200);
    expect((await res.json()).oportunidad).toMatchObject({ etapa: 'ganada', proximaAccion: null });
  });

  it('Contactado stores the medium sent with the move', async () => {
    const updateSeguimiento = vi.fn().mockImplementation(async (_id, seguimiento) => ({ ...OPORTUNIDAD, ...seguimiento }));
    __setCrmOportunidadesDbForTests(
      makeMockOportunidadesRepo({
        getById: vi.fn().mockResolvedValue({ ...OPORTUNIDAD, etapa: 'por_contactar', medio: null }),
        updateSeguimiento,
      }),
    );
    const res = await PATCH(createJsonRequest({ etapa: 'contactado', medio: 'whatsapp' }), routeContext('o-1'));
    expect(res.status).toBe(200);
    expect(updateSeguimiento).toHaveBeenCalledWith(
      'o-1',
      expect.objectContaining({ etapa: 'contactado', medio: 'whatsapp', motivo: null }),
      null,
    );
  });

  it('Contactado without any medium (sent or stored) is a 400 and nothing is stored', async () => {
    const updateSeguimiento = vi.fn();
    __setCrmOportunidadesDbForTests(
      makeMockOportunidadesRepo({
        getById: vi.fn().mockResolvedValue({ ...OPORTUNIDAD, etapa: 'por_contactar', medio: null }),
        updateSeguimiento,
      }),
    );
    const res = await PATCH(createJsonRequest({ etapa: 'contactado' }), routeContext('o-1'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/cómo se contactó/i);
    expect(updateSeguimiento).not.toHaveBeenCalled();
  });

  it('Perdida stores the structured reason required by MotivoDialog', async () => {
    const updateSeguimiento = vi.fn().mockImplementation(async (_id, seguimiento) => ({ ...EN_SEGUIMIENTO, ...seguimiento }));
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo({ getById: vi.fn().mockResolvedValue(EN_SEGUIMIENTO), updateSeguimiento }));
    const res = await PATCH(
      createJsonRequest({ etapa: 'perdida', motivo: { categoria: 'precio', detalle1: 'S/ 7,000', notas: 'Muy caro' } }),
      routeContext('o-1'),
    );
    expect(res.status).toBe(200);
    expect(updateSeguimiento).toHaveBeenCalledWith(
      'o-1',
      expect.objectContaining({
        etapa: 'perdida',
        motivo: { categoria: 'precio', detalle1: 'S/ 7,000', detalle2: null, notas: 'Muy caro' },
        proximaAccion: null,
      }),
      null,
    );
  });

  it.each([
    ['without a reason', { etapa: 'perdida' }, /motivo/i],
    ['with an unknown category', { etapa: 'perdida', motivo: { categoria: 'zzz' } }, /motivo/i],
    ['Precio without the offered price', { etapa: 'perdida', motivo: { categoria: 'precio' } }, /Precio que les ofrecimos/],
  ])('rejects Perdida %s with 400 and stores nothing', async (_n, body, mensaje) => {
    const updateSeguimiento = vi.fn();
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo({ getById: vi.fn().mockResolvedValue(EN_SEGUIMIENTO), updateSeguimiento }));
    const res = await PATCH(createJsonRequest(body), routeContext('o-1'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(mensaje);
    expect(updateSeguimiento).not.toHaveBeenCalled();
  });

  it('answers 400 EtapaInvalidaError for an unknown stage and stores nothing', async () => {
    const updateSeguimiento = vi.fn();
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo({ getById: vi.fn().mockResolvedValue(EN_SEGUIMIENTO), updateSeguimiento }));
    const res = await PATCH(createJsonRequest({ etapa: 'archivado' }), routeContext('o-1'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: 'Etapa inválida: archivado' });
    expect(updateSeguimiento).not.toHaveBeenCalled();
  });

  it.each([
    ['no etapa', {}],
    ['a numeric etapa', { etapa: 3 }],
    ['a medio that is not text', { etapa: 'cotizado', medio: 5 }],
    ['a motivo that is not an object', { etapa: 'perdida', motivo: 'caro' }],
  ])('returns 400 for a malformed body (%s)', async (_n, body) => {
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo({ getById: vi.fn().mockResolvedValue(EN_SEGUIMIENTO) }));
    const res = await PATCH(createJsonRequest(body), routeContext('o-1'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Cuerpo inválido/);
  });

  it('returns 400 for a body that is not JSON', async () => {
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo({ getById: vi.fn().mockResolvedValue(EN_SEGUIMIENTO) }));
    expect((await PATCH(invalidJsonRequest(), routeContext('o-1'))).status).toBe(400);
  });

  it('returns 404 for an unknown oportunidad', async () => {
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo());
    const res = await PATCH(createJsonRequest({ etapa: 'cotizado' }), routeContext('nope'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ success: false, error: 'Oportunidad no encontrada' });
  });

  it('answers 401 without a session or without the permiso, and never touches the database', async () => {
    for (const session of [null, sinCrmSession]) {
      mockGetSession.mockResolvedValue(session);
      const getById = vi.fn();
      __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo({ getById }));
      const res = await PATCH(createJsonRequest({ etapa: 'cotizado' }), routeContext('o-1'));
      expect(res.status).toBe(401);
      expect(getById).not.toHaveBeenCalled();
    }
  });

  it('answers 500 without leaking the cause when storage fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    __setCrmOportunidadesDbForTests(
      makeMockOportunidadesRepo({
        getById: vi.fn().mockResolvedValue(EN_SEGUIMIENTO),
        updateSeguimiento: vi.fn().mockRejectedValue(new Error('x')),
      }),
    );
    const res = await PATCH(createJsonRequest({ etapa: 'cotizado' }), routeContext('o-1'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'Error al mover la oportunidad' });
  });
});

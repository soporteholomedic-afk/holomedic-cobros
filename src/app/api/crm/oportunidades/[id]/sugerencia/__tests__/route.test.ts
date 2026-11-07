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

import { POST } from '../route';

/** A deal with the "3 intentos sin respuesta" suggestion showing. */
const SUGERIDA = { ...OPORTUNIDAD, etapa: 'en_seguimiento' as const, intentosSinRespuesta: 3 };

describe('/api/crm/oportunidades/[id]/sugerencia POST', () => {
  beforeEach(() => mockGetSession.mockResolvedValue(crmSession));
  afterEach(() => {
    __setCrmOportunidadesDbForTests(null);
    vi.restoreAllMocks();
  });

  it('"perder" closes THIS deal as Perdida (no_contestan) and touches nothing else', async () => {
    const updateSeguimiento = vi.fn().mockImplementation(async (_id, seguimiento) => ({ ...SUGERIDA, ...seguimiento }));
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo({ getById: vi.fn().mockResolvedValue(SUGERIDA), updateSeguimiento }));
    const res = await POST(createJsonRequest({ accion: 'perder' }), routeContext('o-1'));
    expect(res.status).toBe(200);
    expect((await res.json()).oportunidad).toMatchObject({ etapa: 'perdida' });
    expect(updateSeguimiento).toHaveBeenCalledWith(
      'o-1',
      expect.objectContaining({
        etapa: 'perdida',
        motivo: { categoria: 'no_contestan', detalle1: null, detalle2: null, notas: null },
        proximaAccion: null,
        faltaResponderDesde: null,
      }),
      null,
    );
  });

  it('"seguir" stores the attempt count so the suggestion returns after one more failure', async () => {
    const updateSeguimiento = vi.fn().mockImplementation(async (_id, seguimiento) => ({ ...SUGERIDA, ...seguimiento }));
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo({ getById: vi.fn().mockResolvedValue(SUGERIDA), updateSeguimiento }));
    const res = await POST(createJsonRequest({ accion: 'seguir' }), routeContext('o-1'));
    expect(res.status).toBe(200);
    expect((await res.json()).oportunidad).toMatchObject({ etapa: 'en_seguimiento', sugerenciaDescartadaEn: 3 });
    expect(updateSeguimiento).toHaveBeenCalledWith(
      'o-1',
      expect.objectContaining({ etapa: 'en_seguimiento', sugerenciaDescartadaEn: 3 }),
      null,
    );
  });

  it.each([
    ['an unknown accion', { accion: 'ganar' }, 'Elige qué hacer con la sugerencia.'],
    ['a numeric accion', { accion: 1 }, "Cuerpo inválido. Requiere: {accion: 'perder' | 'seguir'}"],
    ['no accion', {}, "Cuerpo inválido. Requiere: {accion: 'perder' | 'seguir'}"],
  ])('answers 400 for %s and stores nothing', async (_n, body, mensaje) => {
    const updateSeguimiento = vi.fn();
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo({ getById: vi.fn().mockResolvedValue(SUGERIDA), updateSeguimiento }));
    const res = await POST(createJsonRequest(body), routeContext('o-1'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: mensaje });
    expect(updateSeguimiento).not.toHaveBeenCalled();
  });

  it('answers 400 when the suggestion is no longer showing, and stores nothing', async () => {
    const updateSeguimiento = vi.fn();
    __setCrmOportunidadesDbForTests(
      makeMockOportunidadesRepo({
        getById: vi.fn().mockResolvedValue({ ...SUGERIDA, intentosSinRespuesta: 1 }),
        updateSeguimiento,
      }),
    );
    const res = await POST(createJsonRequest({ accion: 'perder' }), routeContext('o-1'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('La sugerencia ya no corresponde a esta tarjeta.');
    expect(updateSeguimiento).not.toHaveBeenCalled();
  });

  it('answers 400 for a body that is not JSON', async () => {
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo());
    expect((await POST(invalidJsonRequest(), routeContext('o-1'))).status).toBe(400);
  });

  it('answers 404 for an unknown oportunidad', async () => {
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo());
    const res = await POST(createJsonRequest({ accion: 'perder' }), routeContext('nope'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ success: false, error: 'Oportunidad no encontrada' });
  });

  it('answers 401 without a session and without the crm permiso', async () => {
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo());
    mockGetSession.mockResolvedValue(null);
    expect((await POST(createJsonRequest({ accion: 'perder' }), routeContext('o-1'))).status).toBe(401);
    mockGetSession.mockResolvedValue(sinCrmSession);
    expect((await POST(createJsonRequest({ accion: 'perder' }), routeContext('o-1'))).status).toBe(401);
  });

  it('answers 500 without leaking the cause when storage fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    __setCrmOportunidadesDbForTests(
      makeMockOportunidadesRepo({
        getById: vi.fn().mockResolvedValue(SUGERIDA),
        updateSeguimiento: vi.fn().mockRejectedValue(new Error('secret')),
      }),
    );
    const res = await POST(createJsonRequest({ accion: 'seguir' }), routeContext('o-1'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'Error al resolver la sugerencia' });
  });
});

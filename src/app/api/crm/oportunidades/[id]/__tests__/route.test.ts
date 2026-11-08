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
} from '../../../_lib/__tests__/fixtures';

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({ getSession: mockGetSession }));

import { PATCH } from '../route';

const VALIDO = {
  nombre: 'Exámenes ocupacionales 2026',
  servicio: 'Exámenes de ingreso',
  responsableId: 'u-2',
  responsableNombre: 'Luis Comercial',
  origen: 'referido',
  montoEstimado: 7000,
};

describe('/api/crm/oportunidades/[id] PATCH', () => {
  beforeEach(() => mockGetSession.mockResolvedValue(crmSession));
  afterEach(() => {
    __setCrmOportunidadesDbForTests(null);
    vi.restoreAllMocks();
  });

  it('replaces the editable data and never touches the stage or follow-up state', async () => {
    const updateDatos = vi.fn().mockImplementation(async (_id, datos) => ({ ...OPORTUNIDAD, ...datos }));
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo({ updateDatos }));
    const res = await PATCH(createJsonRequest(VALIDO), routeContext('o-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.oportunidad).toMatchObject({ idOportunidad: 'o-1', nombre: VALIDO.nombre, montoEstimado: 7000 });
    expect(updateDatos).toHaveBeenCalledTimes(1);
    expect(updateDatos.mock.calls[0]?.[0]).toBe('o-1');
    expect(updateDatos.mock.calls[0]?.[1]).toEqual({
      nombre: VALIDO.nombre,
      responsableId: 'u-2',
      responsableNombre: 'Luis Comercial',
      origen: 'referido',
      servicio: 'Exámenes de ingreso',
      montoEstimado: 7000,
    });
  });

  it.each([
    ['without a session', null],
    ['without the crm permiso', sinCrmSession],
  ])('answers 401 %s and writes nothing', async (_n, session) => {
    mockGetSession.mockResolvedValue(session);
    const updateDatos = vi.fn();
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo({ updateDatos }));
    const res = await PATCH(createJsonRequest(VALIDO), routeContext('o-1'));
    expect(res.status).toBe(401);
    expect(updateDatos).not.toHaveBeenCalled();
  });

  it('answers 400 for non-JSON and for a body with the wrong shape', async () => {
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo());
    expect((await PATCH(invalidJsonRequest(), routeContext('o-1'))).status).toBe(400);
    expect((await PATCH(createJsonRequest({ servicio: 'X' }), routeContext('o-1'))).status).toBe(400);
    expect((await PATCH(createJsonRequest(null), routeContext('o-1'))).status).toBe(400);
  });

  it('answers 400 for invalid data and leaves the deal untouched', async () => {
    const updateDatos = vi.fn();
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo({ updateDatos }));
    const res = await PATCH(createJsonRequest({ ...VALIDO, nombre: '  ' }), routeContext('o-1'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/nombre de la oportunidad es obligatorio/);
    expect(updateDatos).not.toHaveBeenCalled();
  });

  it('answers 400 for a text amount (use-case rule) and leaves the deal untouched', async () => {
    const updateDatos = vi.fn();
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo({ updateDatos }));
    const res = await PATCH(createJsonRequest({ ...VALIDO, montoEstimado: '7000' }), routeContext('o-1'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/mayor a 0/);
    expect(updateDatos).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown oportunidad (OportunidadNotFoundError from the repository)', async () => {
    const { OportunidadNotFoundError } = await import('@/features/crm/domain/errors');
    const updateDatos = vi.fn().mockRejectedValue(new OportunidadNotFoundError('nope'));
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo({ updateDatos }));
    const res = await PATCH(createJsonRequest(VALIDO), routeContext('nope'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ success: false, error: 'Oportunidad no encontrada' });
  });

  it('answers 500 without leaking the cause when storage fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    __setCrmOportunidadesDbForTests(
      makeMockOportunidadesRepo({ updateDatos: vi.fn().mockRejectedValue(new Error('secret')) }),
    );
    const res = await PATCH(createJsonRequest(VALIDO), routeContext('o-1'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'Error al guardar la oportunidad' });
  });
});

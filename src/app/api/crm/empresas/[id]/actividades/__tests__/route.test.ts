import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __setCrmDbForTests, __setCrmOportunidadesDbForTests } from '@/features/crm/infrastructure/getCrmDb';
import {
  FILA,
  OPORTUNIDAD,
  createJsonRequest,
  crmSession,
  invalidJsonRequest,
  makeMockOportunidadesRepo,
  makeMockRepo,
  routeContext,
  sinCrmSession,
} from '../../../../_lib/__tests__/fixtures';

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({ getSession: mockGetSession }));

import { POST } from '../route';

const pasado = '2020-01-01';
const futuro = (): string => new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
const BODY = () => ({
  idOportunidad: 'o-1',
  direccion: 'saliente',
  medio: 'llamada',
  resultado: 'conversamos',
  resumen: 'Pidió cotización.',
  proximaAccion: { tipo: 'cotizar', fecha: futuro() },
});
const INTERACCION = {
  idInteraccion: 7,
  idEmpresa: 'e-1',
  idOportunidad: 'o-1',
  fecha: '2026-10-31T15:00:00.000Z',
  idUsuario: 'u-1',
  nombreUsuario: 'Scott Palomino',
  direccion: 'saliente',
  medio: 'llamada',
  medioOtro: null,
  resultado: 'conversamos',
  resumen: 'Pidió cotización.',
};

function repos({ oportunidad = OPORTUNIDAD, empresa = FILA } = {}) {
  const empresas = makeMockRepo({
    getById: vi.fn().mockResolvedValue(empresa),
    listInteracciones: vi.fn().mockResolvedValue([INTERACCION]),
  });
  const oportunidades = makeMockOportunidadesRepo({
    getById: vi.fn().mockImplementation(async (id: string) => (id === 'o-1' ? oportunidad : null)),
    updateSeguimiento: vi.fn().mockImplementation(async (_id, seguimiento) => ({ ...OPORTUNIDAD, ...seguimiento })),
  });
  __setCrmDbForTests(empresas);
  __setCrmOportunidadesDbForTests(oportunidades);
  return { empresas, oportunidades };
}

describe('POST /api/crm/empresas/[id]/actividades — linked', () => {
  beforeEach(() => mockGetSession.mockResolvedValue(crmSession));
  afterEach(() => {
    __setCrmDbForTests(null);
    __setCrmOportunidadesDbForTests(null);
    vi.restoreAllMocks();
  });

  it('answers 201 { empresa, oportunidad, interaccion } and writes state + history in ONE updateSeguimiento with the session user', async () => {
    const { empresas, oportunidades } = repos();
    const res = await POST(createJsonRequest(BODY()), routeContext('e-1'));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.empresa).toMatchObject({ idEmpresa: 'e-1', relacion: 'prospecto' });
    expect(json.oportunidad).toMatchObject({ idOportunidad: 'o-1', etapa: 'contactado', medio: 'llamada' });
    expect(json.interaccion).toEqual(INTERACCION);
    expect(oportunidades.updateSeguimiento).toHaveBeenCalledTimes(1);
    expect(oportunidades.updateSeguimiento).toHaveBeenCalledWith(
      'o-1',
      expect.objectContaining({ etapa: 'contactado', intentosSinRespuesta: 0 }),
      expect.objectContaining({
        idOportunidad: 'o-1',
        idUsuario: 'u-1',
        nombreUsuario: 'Scott Palomino',
        resultado: 'conversamos',
      }),
    );
    expect(empresas.addInteraccion).not.toHaveBeenCalled();
  });

  it.each([
    ['no summary for Conversamos', { ...BODY(), resumen: '' }, 'Escribe un resumen de la conversación.'],
    ['medium Otro without text', { ...BODY(), medio: 'otro' }, 'Escribe cuál fue el medio.'],
    ['a past next action', { ...BODY(), proximaAccion: { tipo: 'llamar', fecha: pasado } }, 'La fecha de la próxima acción no puede ser pasada.'],
    ['Otro action without detail', { ...BODY(), proximaAccion: { tipo: 'otro', fecha: futuro() } }, 'Escribe cuál es la próxima acción.'],
    ['a result of the other direction', { ...BODY(), resultado: 'pendiente' }, 'El resultado no corresponde a la dirección del contacto.'],
  ])('answers 400 with the exact message for %s and stores nothing', async (_n, body, mensaje) => {
    const { empresas, oportunidades } = repos();
    const res = await POST(createJsonRequest(body), routeContext('e-1'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: mensaje });
    expect(oportunidades.updateSeguimiento).not.toHaveBeenCalled();
    expect(empresas.addInteraccion).not.toHaveBeenCalled();
  });

  it('answers 400 for a Perdida deal (a new negotiation is a NEW oportunidad, S6.8)', async () => {
    const { oportunidades } = repos({ oportunidad: { ...OPORTUNIDAD, etapa: 'perdida' as const } });
    const res = await POST(createJsonRequest(BODY()), routeContext('e-1'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('No se puede registrar una actividad en una oportunidad en Perdida.');
    expect(oportunidades.updateSeguimiento).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown oportunidad and 409 for one of another empresa', async () => {
    repos();
    const missing = await POST(createJsonRequest({ ...BODY(), idOportunidad: 'nope' }), routeContext('e-1'));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ success: false, error: 'Oportunidad no encontrada' });

    const { oportunidades } = repos({ oportunidad: { ...OPORTUNIDAD, idEmpresa: 'e-otra' } });
    const ajena = await POST(createJsonRequest(BODY()), routeContext('e-1'));
    expect(ajena.status).toBe(409);
    expect(await ajena.json()).toEqual({ success: false, error: 'La oportunidad no pertenece a esta empresa' });
    expect(oportunidades.updateSeguimiento).not.toHaveBeenCalled();
  });
});

describe('POST /api/crm/empresas/[id]/actividades — general (S6.4)', () => {
  beforeEach(() => mockGetSession.mockResolvedValue(crmSession));
  afterEach(() => {
    __setCrmDbForTests(null);
    __setCrmOportunidadesDbForTests(null);
    vi.restoreAllMocks();
  });

  it('with idOportunidad null writes ONLY the empresa history, no deal required or advanced', async () => {
    const { empresas, oportunidades } = repos();
    const res = await POST(createJsonRequest({ ...BODY(), idOportunidad: null, proximaAccion: undefined }), routeContext('e-1'));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.oportunidad).toBeNull();
    expect(json.interaccion).toMatchObject({ idEmpresa: 'e-1', idOportunidad: null, resultado: 'conversamos' });
    expect(empresas.addInteraccion).toHaveBeenCalledTimes(1);
    expect(empresas.addInteraccion).toHaveBeenCalledWith(
      'e-1',
      expect.objectContaining({ idOportunidad: null, idUsuario: 'u-1', nombreUsuario: 'Scott Palomino' }),
    );
    expect(oportunidades.getById).not.toHaveBeenCalled();
    expect(oportunidades.updateSeguimiento).not.toHaveBeenCalled();
  });

  it('a general activity needs no próxima acción but still validates medio/resultado', async () => {
    const { empresas, oportunidades } = repos();
    expect((await POST(createJsonRequest({ ...BODY(), idOportunidad: null, proximaAccion: undefined, resultado: 'pendiente' }), routeContext('e-1'))).status).toBe(400);
    expect(empresas.addInteraccion).not.toHaveBeenCalled();
    expect(oportunidades.updateSeguimiento).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown empresa', async () => {
    repos({ empresa: null as unknown as typeof FILA });
    const res = await POST(createJsonRequest({ ...BODY(), idOportunidad: null }), routeContext('nope'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ success: false, error: 'Empresa no encontrada' });
  });
});

describe('POST /api/crm/empresas/[id]/actividades — common', () => {
  beforeEach(() => mockGetSession.mockResolvedValue(crmSession));
  afterEach(() => {
    __setCrmDbForTests(null);
    __setCrmOportunidadesDbForTests(null);
    vi.restoreAllMocks();
  });

  it('answers 400 for a body of the wrong shape and non-JSON', async () => {
    repos();
    expect((await POST(createJsonRequest({ medio: 'llamada' }), routeContext('e-1'))).status).toBe(400);
    expect((await POST(createJsonRequest({ ...BODY(), idOportunidad: 3 }), routeContext('e-1'))).status).toBe(400);
    expect((await POST(createJsonRequest({ ...BODY(), direccion: 5 }), routeContext('e-1'))).status).toBe(400);
    expect((await POST(invalidJsonRequest(), routeContext('e-1'))).status).toBe(400);
  });

  it('answers 401 without a session and without the crm permiso', async () => {
    repos();
    mockGetSession.mockResolvedValue(null);
    expect((await POST(createJsonRequest(BODY()), routeContext('e-1'))).status).toBe(401);
    mockGetSession.mockResolvedValue(sinCrmSession);
    expect((await POST(createJsonRequest(BODY()), routeContext('e-1'))).status).toBe(401);
  });

  it('answers 500 without leaking the cause when storage fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const empresas = makeMockRepo({ getById: vi.fn().mockResolvedValue(FILA) });
    const oportunidades = makeMockOportunidadesRepo({
      getById: vi.fn().mockResolvedValue(OPORTUNIDAD),
      updateSeguimiento: vi.fn().mockRejectedValue(new Error('secret')),
    });
    __setCrmDbForTests(empresas);
    __setCrmOportunidadesDbForTests(oportunidades);
    const res = await POST(createJsonRequest(BODY()), routeContext('e-1'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'Error al registrar la actividad' });
  });
});

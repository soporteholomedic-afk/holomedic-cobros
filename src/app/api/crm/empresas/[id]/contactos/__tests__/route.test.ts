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

import { POST } from '../route';

const pasado = '2020-01-01';
const futuro = (): string => new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
const BODY = () => ({
  direccion: 'saliente',
  medio: 'llamada',
  resultado: 'conversamos',
  resumen: 'Pidió cotización.',
  proximaAccion: { tipo: 'cotizar', fecha: futuro() },
});
const INTERACCION = {
  idInteraccion: 7,
  idEmpresa: 'e-1',
  fecha: '2026-10-31T15:00:00.000Z',
  idUsuario: 'u-1',
  nombreUsuario: 'Scott Palomino',
  direccion: 'saliente',
  medio: 'llamada',
  medioOtro: null,
  resultado: 'conversamos',
  resumen: 'Pidió cotización.',
};

function repoConEmpresa(parcial = {}) {
  return makeMockRepo({
    getById: vi.fn().mockResolvedValue({ ...FILA, ...parcial }),
    listInteracciones: vi.fn().mockResolvedValue([INTERACCION]),
  });
}

describe('POST /api/crm/empresas/[id]/contactos', () => {
  beforeEach(() => mockGetSession.mockResolvedValue(crmSession));
  afterEach(() => {
    __setCrmDbForTests(null);
    vi.restoreAllMocks();
  });

  it('answers 201 { empresa, interaccion } and writes state + history in ONE updateSeguimiento with the session user', async () => {
    const repo = repoConEmpresa();
    __setCrmDbForTests(repo);
    const res = await POST(createJsonRequest(BODY()), routeContext('e-1'));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.empresa).toMatchObject({ idEmpresa: 'e-1', etapa: 'contactado', medio: 'llamada' });
    expect(json.interaccion).toEqual(INTERACCION);
    expect(repo.updateSeguimiento).toHaveBeenCalledTimes(1);
    expect(repo.updateSeguimiento).toHaveBeenCalledWith(
      'e-1',
      expect.objectContaining({ etapa: 'contactado', intentosSinRespuesta: 0 }),
      expect.objectContaining({ idUsuario: 'u-1', nombreUsuario: 'Scott Palomino', resultado: 'conversamos' }),
    );
    expect(repo.addInteraccion).not.toHaveBeenCalled();
  });

  it.each([
    ['no summary for Conversamos', { ...BODY(), resumen: '' }, 'Escribe un resumen de la conversación.'],
    ['medium Otro without text', { ...BODY(), medio: 'otro' }, 'Escribe cuál fue el medio.'],
    ['a past next action', { ...BODY(), proximaAccion: { tipo: 'llamar', fecha: pasado } }, 'La fecha de la próxima acción no puede ser pasada.'],
    ['Otro action without detail', { ...BODY(), proximaAccion: { tipo: 'otro', fecha: futuro() } }, 'Escribe cuál es la próxima acción.'],
    ['a result of the other direction', { ...BODY(), resultado: 'pendiente' }, 'El resultado no corresponde a la dirección del contacto.'],
  ])('answers 400 with the exact message for %s and stores nothing', async (_n, body, mensaje) => {
    const repo = repoConEmpresa();
    __setCrmDbForTests(repo);
    const res = await POST(createJsonRequest(body), routeContext('e-1'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: mensaje });
    expect(repo.updateSeguimiento).not.toHaveBeenCalled();
  });

  it('answers 400 for a Perdido card', async () => {
    const repo = repoConEmpresa({ etapa: 'perdido' });
    __setCrmDbForTests(repo);
    const res = await POST(createJsonRequest(BODY()), routeContext('e-1'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('No se puede registrar un contacto en una empresa en Perdido.');
    expect(repo.updateSeguimiento).not.toHaveBeenCalled();
  });

  it('answers 400 for a body of the wrong shape and non-JSON, 404 for an unknown empresa', async () => {
    __setCrmDbForTests(makeMockRepo());
    expect((await POST(createJsonRequest({ medio: 'llamada' }), routeContext('e-1'))).status).toBe(400);
    expect((await POST(invalidJsonRequest(), routeContext('e-1'))).status).toBe(400);
    const res = await POST(createJsonRequest(BODY()), routeContext('nope'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ success: false, error: 'Empresa no encontrada' });
  });

  it('answers 401 without a session and without the crm permiso', async () => {
    __setCrmDbForTests(repoConEmpresa());
    mockGetSession.mockResolvedValue(null);
    expect((await POST(createJsonRequest(BODY()), routeContext('e-1'))).status).toBe(401);
    mockGetSession.mockResolvedValue(sinCrmSession);
    expect((await POST(createJsonRequest(BODY()), routeContext('e-1'))).status).toBe(401);
  });

  it('answers 500 without leaking the cause when storage fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    __setCrmDbForTests(
      makeMockRepo({
        getById: vi.fn().mockResolvedValue(FILA),
        updateSeguimiento: vi.fn().mockRejectedValue(new Error('secret')),
      }),
    );
    const res = await POST(createJsonRequest(BODY()), routeContext('e-1'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'Error al registrar el contacto' });
  });
});

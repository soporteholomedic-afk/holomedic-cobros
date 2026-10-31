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

const repoCon = (empresa = FILA) =>
  makeMockRepo({ getById: vi.fn().mockResolvedValue(empresa) });

describe('/api/crm/empresas/[id]/etapa PATCH', () => {
  beforeEach(() => mockGetSession.mockResolvedValue(crmSession));
  afterEach(() => {
    __setCrmDbForTests(null);
    vi.restoreAllMocks();
  });

  it('moves an empresa that already has a medium to En seguimiento with just {etapa}', async () => {
    const updateEstado = vi.fn().mockImplementation(async (_id, estado) => ({ ...FILA, ...estado }));
    __setCrmDbForTests(
      makeMockRepo({ getById: vi.fn().mockResolvedValue({ ...FILA, etapa: 'contactado', medio: 'llamada' }), updateEstado }),
    );
    const res = await PATCH(createJsonRequest({ etapa: 'en_seguimiento' }), routeContext('e-1'));
    expect(res.status).toBe(200);
    expect((await res.json()).empresa).toMatchObject({ etapa: 'en_seguimiento', medio: 'llamada' });
    expect(updateEstado).toHaveBeenCalledWith('e-1', { etapa: 'en_seguimiento', medio: 'llamada', motivo: null });
  });

  it('Contactado stores the medium sent with the move', async () => {
    const updateEstado = vi.fn().mockImplementation(async (_id, estado) => ({ ...FILA, ...estado }));
    __setCrmDbForTests(makeMockRepo({ getById: vi.fn().mockResolvedValue(FILA), updateEstado }));
    const res = await PATCH(createJsonRequest({ etapa: 'contactado', medio: 'whatsapp' }), routeContext('e-1'));
    expect(res.status).toBe(200);
    expect(updateEstado).toHaveBeenCalledWith('e-1', { etapa: 'contactado', medio: 'whatsapp', motivo: null });
  });

  it('Contactado without a medium is a 400 and nothing is stored', async () => {
    const updateEstado = vi.fn();
    __setCrmDbForTests(makeMockRepo({ getById: vi.fn().mockResolvedValue(FILA), updateEstado }));
    const res = await PATCH(createJsonRequest({ etapa: 'contactado' }), routeContext('e-1'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/cómo se contactó/i);
    expect(updateEstado).not.toHaveBeenCalled();
  });

  it('Perdido stores the structured reason', async () => {
    const updateEstado = vi.fn().mockImplementation(async (_id, estado) => ({ ...FILA, ...estado }));
    __setCrmDbForTests(
      makeMockRepo({ getById: vi.fn().mockResolvedValue({ ...FILA, etapa: 'cliente', medio: 'correo' }), updateEstado }),
    );
    const res = await PATCH(
      createJsonRequest({ etapa: 'perdido', motivo: { categoria: 'precio', detalle1: 'S/ 7,000', notas: 'Muy caro' } }),
      routeContext('e-1'),
    );
    expect(res.status).toBe(200);
    expect(updateEstado).toHaveBeenCalledWith('e-1', {
      etapa: 'perdido',
      medio: 'correo',
      motivo: { categoria: 'precio', detalle1: 'S/ 7,000', detalle2: null, notas: 'Muy caro' },
    });
  });

  it.each([
    ['without a reason', { etapa: 'perdido' }, /motivo/i],
    ['with an unknown category', { etapa: 'perdido', motivo: { categoria: 'zzz' } }, /motivo/i],
    ['Precio without the offered price', { etapa: 'perdido', motivo: { categoria: 'precio' } }, /Precio que les ofrecimos/],
    ['an unknown stage', { etapa: 'archivado' }, /Etapa inválida/],
  ])('rejects Perdido/stage %s with 400 and stores nothing', async (_n, body, mensaje) => {
    const updateEstado = vi.fn();
    __setCrmDbForTests(makeMockRepo({ getById: vi.fn().mockResolvedValue(FILA), updateEstado }));
    const res = await PATCH(createJsonRequest(body), routeContext('e-1'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(mensaje);
    expect(updateEstado).not.toHaveBeenCalled();
  });

  it.each([
    ['no etapa', {}],
    ['a numeric etapa', { etapa: 3 }],
    ['a medio that is not text', { etapa: 'contactado', medio: 5 }],
    ['a motivo that is not an object', { etapa: 'perdido', motivo: 'caro' }],
  ])('returns 400 for a malformed body (%s)', async (_n, body) => {
    __setCrmDbForTests(repoCon());
    const res = await PATCH(createJsonRequest(body), routeContext('e-1'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Cuerpo inválido/);
  });

  it('returns 400 for a body that is not JSON', async () => {
    __setCrmDbForTests(repoCon());
    expect((await PATCH(invalidJsonRequest(), routeContext('e-1'))).status).toBe(400);
  });

  it('returns 404 for an unknown id', async () => {
    __setCrmDbForTests(makeMockRepo());
    const res = await PATCH(createJsonRequest({ etapa: 'cliente' }), routeContext('nope'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ success: false, error: 'Empresa no encontrada' });
  });

  it('returns 401 without a session or without the permiso, and never touches the database', async () => {
    for (const session of [null, sinCrmSession]) {
      mockGetSession.mockResolvedValue(session);
      const getById = vi.fn();
      __setCrmDbForTests(makeMockRepo({ getById }));
      const res = await PATCH(createJsonRequest({ etapa: 'cliente' }), routeContext('e-1'));
      expect(res.status).toBe(401);
      expect(getById).not.toHaveBeenCalled();
    }
  });

  it('returns 500 without leaking the cause when storage fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    __setCrmDbForTests(
      makeMockRepo({ getById: vi.fn().mockResolvedValue(FILA), updateEstado: vi.fn().mockRejectedValue(new Error('x')) }),
    );
    const res = await PATCH(createJsonRequest({ etapa: 'cliente' }), routeContext('e-1'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'Error al mover la empresa' });
  });
});

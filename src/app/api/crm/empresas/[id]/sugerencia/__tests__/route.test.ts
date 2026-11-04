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

const MUCHOS = {
  ...FILA,
  etapa: 'contactado' as const,
  medio: 'llamada' as const,
  intentosSinRespuesta: 3,
  faltaResponderDesde: '2026-10-30T10:00:00.000Z',
  proximaAccion: { tipo: 'llamar' as const, detalle: null, fecha: '2026-11-03' },
};
const MSG = 'La sugerencia ya no corresponde a esta tarjeta.';

function repoCon(empresa = MUCHOS) {
  const updateSeguimiento = vi.fn().mockImplementation(async (_id, s) => ({ ...empresa, ...s }));
  return { repo: makeMockRepo({ getById: vi.fn().mockResolvedValue(empresa), updateSeguimiento }), updateSeguimiento };
}

describe('POST /api/crm/empresas/[id]/sugerencia', () => {
  beforeEach(() => mockGetSession.mockResolvedValue(crmSession));
  afterEach(() => {
    __setCrmDbForTests(null);
    vi.restoreAllMocks();
  });

  it('"perder": 200 { empresa } in Perdido with motivo no_contestan, no history entry', async () => {
    const { repo, updateSeguimiento } = repoCon();
    __setCrmDbForTests(repo);
    const res = await POST(createJsonRequest({ accion: 'perder' }), routeContext('e-1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      success: true,
      empresa: { etapa: 'perdido', motivo: { categoria: 'no_contestan' }, proximaAccion: null, faltaResponderDesde: null },
    });
    expect(updateSeguimiento).toHaveBeenCalledWith('e-1', expect.anything(), null);
  });

  it('"seguir": 200 { empresa } storing the current count', async () => {
    const { repo } = repoCon();
    __setCrmDbForTests(repo);
    const res = await POST(createJsonRequest({ accion: 'seguir' }), routeContext('e-1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ empresa: { etapa: 'contactado', sugerenciaDescartadaEn: 3 } });
  });

  it('answers 400 when the suggestion is not showing and stores nothing', async () => {
    const { repo, updateSeguimiento } = repoCon({ ...MUCHOS, intentosSinRespuesta: 2 });
    __setCrmDbForTests(repo);
    const res = await POST(createJsonRequest({ accion: 'perder' }), routeContext('e-1'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: MSG });
    expect(updateSeguimiento).not.toHaveBeenCalled();
  });

  it('answers 400 for an unknown action, a wrong shape and non-JSON; 404 for an unknown empresa', async () => {
    const { repo, updateSeguimiento } = repoCon();
    __setCrmDbForTests(repo);
    const res = await POST(createJsonRequest({ accion: 'borrar' }), routeContext('e-1'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: 'Elige qué hacer con la sugerencia.' });
    expect((await POST(createJsonRequest({}), routeContext('e-1'))).status).toBe(400);
    expect((await POST(invalidJsonRequest(), routeContext('e-1'))).status).toBe(400);
    expect(updateSeguimiento).not.toHaveBeenCalled();
    __setCrmDbForTests(makeMockRepo());
    expect((await POST(createJsonRequest({ accion: 'perder' }), routeContext('nope'))).status).toBe(404);
  });

  it('answers 401 without a session and without the crm permiso', async () => {
    __setCrmDbForTests(repoCon().repo);
    mockGetSession.mockResolvedValue(null);
    expect((await POST(createJsonRequest({ accion: 'perder' }), routeContext('e-1'))).status).toBe(401);
    mockGetSession.mockResolvedValue(sinCrmSession);
    expect((await POST(createJsonRequest({ accion: 'perder' }), routeContext('e-1'))).status).toBe(401);
  });

  it('answers 500 without leaking the cause when storage fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    __setCrmDbForTests(makeMockRepo({ getById: vi.fn().mockRejectedValue(new Error('secret')) }));
    const res = await POST(createJsonRequest({ accion: 'perder' }), routeContext('e-1'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'Error al resolver la sugerencia' });
  });
});

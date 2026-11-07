import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __setCrmDbForTests } from '@/features/crm/infrastructure/getCrmDb';
import {
  FILA,
  crmSession,
  makeMockRepo,
  routeContext,
  sinCrmSession,
} from '../../../../_lib/__tests__/fixtures';

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({ getSession: mockGetSession }));

import { GET } from '../route';

const req = new Request('http://localhost/api/crm/empresas/e-1/historial');
const fila = (id: number, idOportunidad: string | null = null) => ({
  idInteraccion: id,
  idEmpresa: 'e-1',
  idOportunidad,
  fecha: '2026-10-31T15:00:00.000Z',
  idUsuario: 'u-1',
  nombreUsuario: 'Scott Palomino',
  direccion: 'saliente',
  medio: 'llamada',
  medioOtro: null,
  resultado: 'no_contesto',
  resumen: null,
});

describe('GET /api/crm/empresas/[id]/historial', () => {
  beforeEach(() => mockGetSession.mockResolvedValue(crmSession));
  afterEach(() => {
    __setCrmDbForTests(null);
    vi.restoreAllMocks();
  });

  it('answers 200 { interacciones } exactly as the repository lists them (newest first), each with its idOportunidad', async () => {
    const repo = makeMockRepo({
      getById: vi.fn().mockResolvedValue(FILA),
      listInteracciones: vi.fn().mockResolvedValue([fila(3, 'o-9'), fila(2, null), fila(1, 'o-1')]),
    });
    __setCrmDbForTests(repo);
    const res = await GET(req, routeContext('e-1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.interacciones.map((i: { idInteraccion: number }) => i.idInteraccion)).toEqual([3, 2, 1]);
    expect(json.interacciones.map((i: { idOportunidad: string | null }) => i.idOportunidad)).toEqual(['o-9', null, 'o-1']);
    expect(repo.listInteracciones).toHaveBeenCalledWith('e-1');
  });

  it('answers an empty list for an empresa without history', async () => {
    __setCrmDbForTests(makeMockRepo({ getById: vi.fn().mockResolvedValue(FILA) }));
    const res = await GET(req, routeContext('e-1'));
    expect(await res.json()).toEqual({ success: true, interacciones: [] });
  });

  it('answers 404 for an unknown empresa', async () => {
    const repo = makeMockRepo();
    __setCrmDbForTests(repo);
    const res = await GET(req, routeContext('nope'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ success: false, error: 'Empresa no encontrada' });
    expect(repo.listInteracciones).not.toHaveBeenCalled();
  });

  it('answers 401 without a session and without the crm permiso', async () => {
    __setCrmDbForTests(makeMockRepo({ getById: vi.fn().mockResolvedValue(FILA) }));
    mockGetSession.mockResolvedValue(null);
    expect((await GET(req, routeContext('e-1'))).status).toBe(401);
    mockGetSession.mockResolvedValue(sinCrmSession);
    expect((await GET(req, routeContext('e-1'))).status).toBe(401);
  });

  it('answers 500 without leaking the cause when storage fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    __setCrmDbForTests(makeMockRepo({ getById: vi.fn().mockRejectedValue(new Error('secret')) }));
    const res = await GET(req, routeContext('e-1'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'Error al leer el historial' });
  });
});

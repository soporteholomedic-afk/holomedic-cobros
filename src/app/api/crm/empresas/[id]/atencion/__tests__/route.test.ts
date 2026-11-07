import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __setCrmAtencionesForTests, __setCrmDbForTests } from '@/features/crm/infrastructure/getCrmDb';
import {
  FILA,
  crmSession,
  makeMockAtenciones,
  makeMockRepo,
  routeContext,
  sinCrmSession,
} from '../../../../_lib/__tests__/fixtures';

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({ getSession: mockGetSession }));

import { GET } from '../route';

const req = new Request('http://localhost/api/crm/empresas/e-1/atencion');

const haceDias = (dias: number): string => new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);

describe('GET /api/crm/empresas/[id]/atencion', () => {
  beforeEach(() => mockGetSession.mockResolvedValue(crmSession));
  afterEach(() => {
    __setCrmDbForTests(null);
    __setCrmAtencionesForTests(null);
    vi.restoreAllMocks();
  });

  it('answers the live SIGLA lookup and its derived state for a cliente with recent attention', async () => {
    const ultimaAtencion = vi.fn().mockResolvedValue(haceDias(5));
    __setCrmDbForTests(makeMockRepo({ getById: vi.fn().mockResolvedValue({ ...FILA, relacion: 'cliente' }) }));
    __setCrmAtencionesForTests(makeMockAtenciones({ ultimaAtencion }));
    const res = await GET(req, routeContext('e-1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.actividad).toEqual({ ultimaAtencion: haceDias(5), ruc: FILA.ruc });
    expect(json.estado).toBe('reciente');
    expect(ultimaAtencion).toHaveBeenCalledWith(FILA.ruc);
  });

  it('a cliente whose RUC has no attention at all is "Pendiente de primera atención", never inactive (S6.7)', async () => {
    const ultimaAtencion = vi.fn().mockResolvedValue(null);
    __setCrmDbForTests(makeMockRepo({ getById: vi.fn().mockResolvedValue({ ...FILA, relacion: 'cliente' }) }));
    __setCrmAtencionesForTests(makeMockAtenciones({ ultimaAtencion }));
    const res = await GET(req, routeContext('e-1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      actividad: { ultimaAtencion: null, ruc: FILA.ruc },
      estado: 'pendiente_primera',
    });
  });

  it('a cliente inactive for more than 4 months shows "Sin actividad de servicios reciente"', async () => {
    __setCrmDbForTests(makeMockRepo({ getById: vi.fn().mockResolvedValue({ ...FILA, relacion: 'cliente' }) }));
    __setCrmAtencionesForTests(makeMockAtenciones({ ultimaAtencion: vi.fn().mockResolvedValue(haceDias(200)) }));
    const res = await GET(req, routeContext('e-1'));
    expect((await res.json()).estado).toBe('sin_actividad');
  });

  it('a prospecto shows "Sin información" even though the live lookup runs (S6.6: the state ignores it)', async () => {
    const ultimaAtencion = vi.fn().mockResolvedValue(haceDias(5));
    __setCrmDbForTests(makeMockRepo({ getById: vi.fn().mockResolvedValue({ ...FILA, relacion: 'prospecto' }) }));
    __setCrmAtencionesForTests(makeMockAtenciones({ ultimaAtencion }));
    const res = await GET(req, routeContext('e-1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.estado).toBe('sin_informacion');
    expect(ultimaAtencion).toHaveBeenCalledWith(FILA.ruc);
  });

  it('an empresa without RUC never reaches SIGLA either (S6.7)', async () => {
    const ultimaAtencion = vi.fn();
    __setCrmDbForTests(makeMockRepo({ getById: vi.fn().mockResolvedValue({ ...FILA, ruc: null, relacion: 'cliente' }) }));
    __setCrmAtencionesForTests(makeMockAtenciones({ ultimaAtencion }));
    const res = await GET(req, routeContext('e-1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      actividad: { ultimaAtencion: null, ruc: null },
      estado: 'sin_informacion',
    });
    expect(ultimaAtencion).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown empresa, without querying SIGLA', async () => {
    const ultimaAtencion = vi.fn();
    __setCrmDbForTests(makeMockRepo());
    __setCrmAtencionesForTests(makeMockAtenciones({ ultimaAtencion }));
    const res = await GET(req, routeContext('nope'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ success: false, error: 'Empresa no encontrada' });
    expect(ultimaAtencion).not.toHaveBeenCalled();
  });

  it('answers 503 with a clear message when the SIGLA lookup fails, without leaking the driver error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    __setCrmDbForTests(makeMockRepo({ getById: vi.fn().mockResolvedValue({ ...FILA, relacion: 'cliente' }) }));
    __setCrmAtencionesForTests(makeMockAtenciones({ ultimaAtencion: vi.fn().mockRejectedValue(new Error('ECONNREFUSED 172.16.10.12')) }));
    const res = await GET(req, routeContext('e-1'));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ success: false, error: 'No se pudo consultar la última atención en SIGLA' });
  });

  it('answers 401 without a session and without the crm permiso', async () => {
    __setCrmDbForTests(makeMockRepo());
    __setCrmAtencionesForTests(makeMockAtenciones());
    mockGetSession.mockResolvedValue(null);
    expect((await GET(req, routeContext('e-1'))).status).toBe(401);
    mockGetSession.mockResolvedValue(sinCrmSession);
    expect((await GET(req, routeContext('e-1'))).status).toBe(401);
  });
});

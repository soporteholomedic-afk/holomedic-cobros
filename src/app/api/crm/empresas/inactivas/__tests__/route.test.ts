import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __setCrmAtencionesForTests, __setCrmDbForTests } from '@/features/crm/infrastructure/getCrmDb';
import {
  FILA,
  crmSession,
  makeMockAtenciones,
  makeMockRepo,
  sinCrmSession,
} from '../../../_lib/__tests__/fixtures';

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({ getSession: mockGetSession }));

import { GET } from '../route';


const haceDias = (dias: number): string => new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);

describe('GET /api/crm/empresas/inactivas', () => {
  beforeEach(() => mockGetSession.mockResolvedValue(crmSession));
  afterEach(() => {
    __setCrmDbForTests(null);
    __setCrmAtencionesForTests(null);
    vi.restoreAllMocks();
  });

  it('lists inactive clientes most abandoned first and counts clientes without RUC', async () => {
    const vieja = { ...FILA, idEmpresa: 'e-vieja', razonSocial: 'Clínica Vieja', ruc: '20100000001', sector: 'Odontología', relacion: 'cliente' };
    const reciente = { ...FILA, idEmpresa: 'e-reciente', razonSocial: 'Clínica Reciente', ruc: '20100000002', relacion: 'cliente' };
    const sinRuc = { ...FILA, idEmpresa: 'e-sinruc', razonSocial: 'Sin RUC S.A.C.', ruc: null, relacion: 'cliente' };
    const nunca = { ...FILA, idEmpresa: 'e-nunca', razonSocial: 'Clínica Nueva', ruc: '20100000003', relacion: 'cliente' };
    __setCrmDbForTests(makeMockRepo({ list: vi.fn().mockResolvedValue([vieja, reciente, sinRuc, nunca]) }));
    __setCrmAtencionesForTests(
      makeMockAtenciones({
        ultimaAtencionPorRucs: vi.fn().mockResolvedValue(
          new Map([
            ['20100000001', haceDias(200)], // ~6 months old
            ['20100000002', haceDias(5)], // reciente: not listed
            ['20100000003', null], // never attended: pendiente_primera, last
          ]),
        ),
      }),
    );
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.sinInformacion).toBe(1);
    expect(json.filas.map((f: { idEmpresa: string }) => f.idEmpresa)).toEqual(['e-vieja', 'e-nunca']);
    expect(json.filas[0]).toMatchObject({ estado: 'sin_actividad', ruc: '20100000001', sector: 'Odontología' });
    expect(json.filas[1]).toMatchObject({ estado: 'pendiente_primera', ultimaAtencion: null });
    expect(json.filas[0].ultimoContactoCrm).toBeNull(); // default mock has no interactions
    expect(json.filas.some((f: { idEmpresa: string }) => f.idEmpresa === 'e-reciente')).toBe(false);
  });

  it('answers 503 with a clear message when the SIGLA bulk lookup fails, without leaking the driver error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    __setCrmDbForTests(makeMockRepo({ list: vi.fn().mockResolvedValue([{ ...FILA, relacion: 'cliente' }]) }));
    __setCrmAtencionesForTests(
      makeMockAtenciones({ ultimaAtencionPorRucs: vi.fn().mockRejectedValue(new Error('ECONNREFUSED 172.16.10.14')) }),
    );
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ success: false, error: 'No se pudo consultar la actividad en SIGLA' });
  });

  it('answers 401 without a session and without the crm permiso', async () => {
    __setCrmDbForTests(makeMockRepo());
    __setCrmAtencionesForTests(makeMockAtenciones());
    mockGetSession.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    mockGetSession.mockResolvedValue(sinCrmSession);
    expect((await GET()).status).toBe(401);
  });
});

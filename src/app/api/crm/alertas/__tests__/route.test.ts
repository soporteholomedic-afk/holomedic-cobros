import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __setCrmDbForTests, __setCrmOportunidadesDbForTests } from '@/features/crm/infrastructure/getCrmDb';
import {
  FILA,
  OPORTUNIDAD,
  crmSession,
  makeMockOportunidadesRepo,
  makeMockRepo,
  sinCrmSession,
} from '../../_lib/__tests__/fixtures';

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({ getSession: mockGetSession }));

import { GET } from '../route';

describe('GET /api/crm/alertas', () => {
  beforeEach(() => mockGetSession.mockResolvedValue(crmSession));
  afterEach(() => {
    __setCrmDbForTests(null);
    __setCrmOportunidadesDbForTests(null);
    vi.restoreAllMocks();
  });

  it('computes the alerts from oportunidades joined with their empresas, each carrying the deal AND the empresa', async () => {
    const ayer = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const vencida: typeof OPORTUNIDAD = {
      ...OPORTUNIDAD,
      idOportunidad: 'o-2',
      nombre: 'Monitoreo de ruido',
      etapa: 'cotizado',
      proximaAccion: { tipo: 'llamar', detalle: null, fecha: ayer },
    };
    __setCrmDbForTests(makeMockRepo({ list: vi.fn().mockResolvedValue([FILA]) }));
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo({ list: vi.fn().mockResolvedValue([vencida, OPORTUNIDAD]) }));
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.alertas).toEqual([
      expect.objectContaining({
        idOportunidad: 'o-2',
        nombreOportunidad: 'Monitoreo de ruido',
        idEmpresa: 'e-1',
        nombreEmpresa: 'Constructora Andina S.A.C.',
        clase: 'accion_vencida',
        atraso: 1,
      }),
    ]);
    expect(json.resumen).toEqual({ vencidas: 1, hoy: 0, sinResponder: 0 });
  });

  it('answers 401 without a session and without the crm permiso, and never touches the database', async () => {
    const list = vi.fn();
    __setCrmDbForTests(makeMockRepo({ list }));
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo({ list }));
    mockGetSession.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    mockGetSession.mockResolvedValue(sinCrmSession);
    expect((await GET()).status).toBe(401);
    expect(list).not.toHaveBeenCalled();
  });

  it('answers 500 without leaking the cause when storage fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    __setCrmDbForTests(makeMockRepo({ list: vi.fn().mockRejectedValue(new Error('secret')) }));
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo());
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'Error al calcular las alertas del CRM' });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mock auth session + the idUsuario→usuario lookup seam ----

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
}));

const mockGetUsuarioDb = vi.hoisted(() => vi.fn());
vi.mock('@/features/auth/infrastructure/getUsuarioDb', () => ({
  getUsuarioDb: mockGetUsuarioDb,
}));

// ---- Import under test (after mocks) ----

import { GET } from '../route';
import { __setCrmDbForTests, type CrmDb } from '@/features/crm/infrastructure/getCrmDb';
import type {
  CrmActividadesRepositoryPort,
  CrmResultadosRepositoryPort,
} from '@/features/crm/domain/ports';

/**
 * `/api/crm/productividad` seam matrix (tasks pr16/WU2, spec G6
 * "Productivity visibility"): the route validates the period strictly
 * (required `desde`/`hasta`, YYYY-MM-DD, desde ≤ hasta), resolves the
 * session's LOGIN NAME via the canonical getById seam (session.sub is
 * the opaque idUsuario — the pr15 decision), and hands identity +
 * admin flag to the scoping use case. The scope can NEVER be widened
 * from the client: there is no user/scope parameter at all.
 */

function makeFakeActividades(conteos: { usuario: string; total: number }[]): CrmActividadesRepositoryPort {
  return {
    registrarEnvioCadencia: vi.fn(),
    contarActividadesPorUsuario: vi.fn().mockResolvedValue(conteos),
  };
}

function makeFakeResultados(
  conteos: { usuario: string; tipo: string; total: number }[],
): CrmResultadosRepositoryPort {
  return {
    registrar: vi.fn(),
    contarResultadosPorUsuario: vi.fn().mockResolvedValue(conteos),
  };
}

function setDb(actividades: CrmActividadesRepositoryPort, resultados: CrmResultadosRepositoryPort): void {
  __setCrmDbForTests({
    pool: {} as never,
    empresas: {} as never,
    importador: {} as never,
    pipeline: {} as never,
    transiciones: {} as never,
    resultados,
    handoffs: {} as never,
    actividades,
    asignaciones: {} as never,
  } satisfies CrmDb);
}

/** Sessions: sub '10' resolves to login name 'jperez'; '11' to 'mgarcia'. */
const crmJperez = { sub: '10', nombre: 'Juan Perez', area: 'ventas', permisos: ['crm'] };
const adminMgarcia = { sub: '11', nombre: 'Maria Garcia', area: 'ventas', permisos: ['crm', 'crm_admin'] };

function mockUsuarioLookup(mapa: Record<string, string | null>): void {
  mockGetUsuarioDb.mockResolvedValue({
    getById: vi.fn(async (id: string) =>
      mapa[id] === undefined ? null : { idUsuario: id, usuario: mapa[id] },
    ),
  });
}

function pedir(query = ''): Request {
  return new Request(`http://localhost/api/crm/productividad${query}`, { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockReset();
  mockGetUsuarioDb.mockReset();
});

afterEach(() => {
  __setCrmDbForTests(null);
});

describe('GET /api/crm/productividad — auth matrix', () => {
  it('returns 401 UNAUTHORIZED without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    setDb(makeFakeActividades([]), makeFakeResultados([]));

    const response = await GET(pedir('?desde=2026-09-01&hasta=2026-09-30'));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 without the crm permiso', async () => {
    mockGetSession.mockResolvedValue({ ...crmJperez, permisos: ['otro'] });
    setDb(makeFakeActividades([]), makeFakeResultados([]));

    const response = await GET(pedir('?desde=2026-09-01&hasta=2026-09-30'));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe('FORBIDDEN');
  });

  it('returns 401 when the session’s idUsuario no longer resolves (stale session)', async () => {
    mockGetSession.mockResolvedValue(crmJperez);
    mockUsuarioLookup({});
    setDb(makeFakeActividades([]), makeFakeResultados([]));

    const response = await GET(pedir('?desde=2026-09-01&hasta=2026-09-30'));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.code).toBe('UNAUTHORIZED');
  });
});

describe('GET /api/crm/productividad — period validation', () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue(crmJperez);
    mockUsuarioLookup({ '10': 'jperez' });
    setDb(makeFakeActividades([]), makeFakeResultados([]));
  });

  it('returns 400 when desde is missing', async () => {
    const response = await GET(pedir('?hasta=2026-09-30'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when hasta is missing', async () => {
    const response = await GET(pedir('?desde=2026-09-01'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for a malformed date', async () => {
    const response = await GET(pedir('?desde=09/01/2026&hasta=2026-09-30'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when desde is after hasta', async () => {
    const response = await GET(pedir('?desde=2026-10-01&hasta=2026-09-30'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/crm/productividad — scoping proof + wiring', () => {
  it('returns 200 with the OWN counts for a plain crm holder (identity resolved from sub)', async () => {
    mockGetSession.mockResolvedValue(crmJperez);
    mockUsuarioLookup({ '10': 'jperez' });
    const actividades = makeFakeActividades([{ usuario: 'jperez', total: 10 }]);
    const resultados = makeFakeResultados([
      { usuario: 'jperez', tipo: 'CotizaciónEnviada', total: 3 },
    ]);
    setDb(actividades, resultados);

    const response = await GET(pedir('?desde=2026-09-01&hasta=2026-09-30'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      desde: '2026-09-01',
      hasta: '2026-09-30',
      filas: [
        {
          usuario: 'jperez',
          actividades: 10,
          resultados: 3,
          porEvento: {
            CotizaciónEnviada: 3,
            PresentaciónEnviada: 0,
            AceptaciónOutbound: 0,
            ConfirmaciónPresentación: 0,
            HandoffRegistrado: 0,
            ConversiónProspectoACliente: 0,
          },
        },
      ],
    });
    // THE scoping proof: the resolved LOGIN NAME filters, the client
    // never gets to choose the scope.
    expect(actividades.contarActividadesPorUsuario).toHaveBeenCalledWith(
      '2026-09-01',
      '2026-09-30',
      'jperez',
    );
    expect(resultados.contarResultadosPorUsuario).toHaveBeenCalledWith(
      '2026-09-01',
      '2026-09-30',
      'jperez',
    );
  });

  it('returns 200 with ALL users for a crm_admin (no filter reaches the ports)', async () => {
    mockGetSession.mockResolvedValue(adminMgarcia);
    mockUsuarioLookup({ '11': 'mgarcia' });
    const actividades = makeFakeActividades([
      { usuario: 'jperez', total: 2 },
      { usuario: 'mgarcia', total: 5 },
    ]);
    const resultados = makeFakeResultados([]);
    setDb(actividades, resultados);

    const response = await GET(pedir('?desde=2026-09-01&hasta=2026-09-30'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.filas).toHaveLength(2);
    expect(actividades.contarActividadesPorUsuario).toHaveBeenCalledWith(
      '2026-09-01',
      '2026-09-30',
      undefined,
    );
  });

  it('returns 500 INTERNAL_ERROR on an unexpected failure', async () => {
    mockGetSession.mockResolvedValue(crmJperez);
    mockUsuarioLookup({ '10': 'jperez' });
    const actividades = makeFakeActividades([]);
    (actividades.contarActividadesPorUsuario as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('db down'),
    );
    setDb(actividades, makeFakeResultados([]));

    const response = await GET(pedir('?desde=2026-09-01&hasta=2026-09-30'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});

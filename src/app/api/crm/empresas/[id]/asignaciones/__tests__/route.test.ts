import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mock auth session (devolver route.test.ts precedent) ----

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
}));

// ---- Import under test (after mocks) ----

import { GET } from '../route';
import { __setCrmDbForTests, type CrmDb } from '@/features/crm/infrastructure/getCrmDb';
import type {
  CrmAsignacionesRepositoryPort,
  CrmEmpresaRepositoryPort,
} from '@/features/crm/domain/ports';
import type { AsignacionHistorial } from '@/features/crm/domain/ports';

/**
 * GET /api/crm/empresas/[id]/asignaciones — the per-empresa assignment
 * history read (tasks pr15/WU2, spec G5 traceability scenario: assign,
 * reassign and return events in order with actor and timestamp).
 * Reads are open to any `crm` holder (detail-route precedent); writes
 * stay gated by pr14's routes. 404 when the empresa does not exist.
 */

const historial: AsignacionHistorial[] = [
  {
    id: 3,
    empresaId: 42,
    accion: 'DEVUELTO',
    responsablePrevio: 'jperez',
    responsableNuevo: null,
    actorUsuario: 'u-jperez',
    createdAt: '2026-09-03T10:00:00.000Z',
  },
  {
    id: 2,
    empresaId: 42,
    accion: 'REASIGNADO',
    responsablePrevio: null,
    responsableNuevo: 'jperez',
    actorUsuario: 'u-admin',
    createdAt: '2026-09-02T09:00:00.000Z',
  },
];

const crmJperez = { sub: '10', nombre: 'Juan Perez', area: 'ventas', permisos: ['crm'] };

function makeFakeEmpresas(existe: boolean): CrmEmpresaRepositoryPort {
  return {
    crear: vi.fn(),
    listar: vi.fn(),
    obtenerPorId: vi.fn().mockResolvedValue(existe ? { id: 42 } : null),
    actualizar: vi.fn(),
  };
}

function makeFakeAsignaciones(
  overrides: Partial<CrmAsignacionesRepositoryPort> = {},
): CrmAsignacionesRepositoryPort {
  return {
    registrarAsignacion: vi.fn(),
    listarAsignaciones: vi.fn().mockResolvedValue(historial),
    ...overrides,
  };
}

function setDb(
  empresas: CrmEmpresaRepositoryPort,
  asignaciones: CrmAsignacionesRepositoryPort,
): void {
  __setCrmDbForTests({
    pool: {} as never,
    empresas,
    importador: {} as never,
    pipeline: {} as never,
    transiciones: {} as never,
    resultados: {} as never,
    handoffs: {} as never,
    actividades: {} as never,
    asignaciones,
  } satisfies CrmDb);
}

function pedir(id: string): Request {
  return new Request(`http://localhost/api/crm/empresas/${id}/asignaciones`, { method: 'GET' });
}

function ctx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockReset();
});

afterEach(() => {
  __setCrmDbForTests(null);
});

describe('GET /api/crm/empresas/[id]/asignaciones — history read (spec G5)', () => {
  it('returns 401 UNAUTHORIZED without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    setDb(makeFakeEmpresas(true), makeFakeAsignaciones());

    const response = await GET(pedir('42'), ctx('42'));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 without the crm permiso', async () => {
    mockGetSession.mockResolvedValue({ ...crmJperez, permisos: ['otro'] });
    setDb(makeFakeEmpresas(true), makeFakeAsignaciones());

    const response = await GET(pedir('42'), ctx('42'));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe('FORBIDDEN');
  });

  it('returns 404 NOT_FOUND_ERROR when the empresa does not exist', async () => {
    mockGetSession.mockResolvedValue(crmJperez);
    setDb(makeFakeEmpresas(false), makeFakeAsignaciones());

    const response = await GET(pedir('99'), ctx('99'));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.code).toBe('NOT_FOUND_ERROR');
  });

  it('returns 400 for a non-numeric id', async () => {
    mockGetSession.mockResolvedValue(crmJperez);
    setDb(makeFakeEmpresas(true), makeFakeAsignaciones());

    const response = await GET(pedir('abc'), ctx('abc'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 200 with the history newest first (all three event kinds traceable)', async () => {
    mockGetSession.mockResolvedValue(crmJperez);
    const asignaciones = makeFakeAsignaciones();
    setDb(makeFakeEmpresas(true), asignaciones);

    const response = await GET(pedir('42'), ctx('42'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.asignaciones).toEqual(historial);
    expect(asignaciones.listarAsignaciones).toHaveBeenCalledWith(42);
  });

  it('returns 200 with an EMPTY history for an empresa with no assignment events', async () => {
    mockGetSession.mockResolvedValue(crmJperez);
    setDb(makeFakeEmpresas(true), makeFakeAsignaciones({ listarAsignaciones: vi.fn().mockResolvedValue([]) }));

    const response = await GET(pedir('42'), ctx('42'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.asignaciones).toEqual([]);
  });

  it('returns 500 INTERNAL_ERROR on an unexpected failure', async () => {
    mockGetSession.mockResolvedValue(crmJperez);
    setDb(
      makeFakeEmpresas(true),
      makeFakeAsignaciones({ listarAsignaciones: vi.fn().mockRejectedValue(new Error('db down')) }),
    );

    const response = await GET(pedir('42'), ctx('42'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});

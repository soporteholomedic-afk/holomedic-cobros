import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mock auth session (auth/me route.test.ts precedent) ----

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
}));

// ---- Mock the idUsuario→usuario lookup seam (cartera route.test.ts precedent) ----

const mockGetUsuarioDb = vi.hoisted(() => vi.fn());
vi.mock('@/features/auth/infrastructure/getUsuarioDb', () => ({
  getUsuarioDb: mockGetUsuarioDb,
}));

// ---- Import under test (after mocks) ----

import { POST } from '../route';
import { __setCrmDbForTests, type CrmDb } from '@/features/crm/infrastructure/getCrmDb';
import type {
  CrmAsignacionesRepositoryPort,
  CrmEmpresaRepositoryPort,
} from '@/features/crm/domain/ports';
import type { Empresa } from '@/features/crm/domain/entities';

// ---- Fixtures ----

const empresa: Empresa = {
  id: 42,
  ruc: '900123456',
  rucNormalizado: '900123456',
  razonSocial: 'Constructora X',
  tipo: 'Prospecto',
  origen: null,
  proyectoObra: null,
  destinoComun: null,
  notas: null,
  responsable: 'jperez',
  contactos: [],
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

function makeFakeEmpresas(overrides: Partial<CrmEmpresaRepositoryPort> = {}): CrmEmpresaRepositoryPort {
  return {
    crear: vi.fn(),
    listar: vi.fn(),
    obtenerPorId: vi.fn().mockResolvedValue(empresa),
    actualizar: vi.fn(),
    ...overrides,
  };
}

function makeFakeAsignaciones(overrides: Partial<CrmAsignacionesRepositoryPort> = {}): CrmAsignacionesRepositoryPort {
  return {
    registrarAsignacion: vi.fn().mockResolvedValue(undefined),
    listarAsignaciones: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function setDb(empresas: CrmEmpresaRepositoryPort, asignaciones: CrmAsignacionesRepositoryPort): void {
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

/**
 * Session `sub` values are OPAQUE auth IDs (idUsuario) — the route must
 * resolve each to a login name via getById; 'u-jperez' resolves to
 * 'jperez' (owner of the fixture empresa), 'u-mgarcia' to 'mgarcia'.
 */
const crmJperez = { sub: 'u-jperez', nombre: 'Juan Perez', area: 'ventas', permisos: ['crm'] };
const crmMgarcia = { sub: 'u-mgarcia', nombre: 'Maria Garcia', area: 'ventas', permisos: ['crm'] };
const adminMgarcia = { ...crmMgarcia, permisos: ['crm', 'crm_admin'] };

function mockUsuarioLookup(mapa: Record<string, string | null>): void {
  mockGetUsuarioDb.mockResolvedValue({
    getById: vi.fn(async (id: string) =>
      mapa[id] === undefined ? null : { idUsuario: id, usuario: mapa[id] },
    ),
  });
}

function routeContext(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function jsonPost(id: string): Parameters<typeof POST>[0] {
  return new Request(`http://localhost/api/crm/empresas/${id}/devolver`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  }) as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockReset();
  mockGetUsuarioDb.mockReset();
  // Canonical resolution default: every authenticated fixture resolves.
  mockUsuarioLookup({ 'u-jperez': 'jperez', 'u-mgarcia': 'mgarcia', 'usr-7f3a': 'jperez' });
});

afterEach(() => {
  __setCrmDbForTests(null);
});

describe('POST /api/crm/empresas/[id]/devolver — owner or crm_admin in-route (spec G5)', () => {
  it('returns 401 UNAUTHORIZED without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const asignaciones = makeFakeAsignaciones();
    setDb(makeFakeEmpresas(), asignaciones);

    const response = await POST(jsonPost('42'), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 without the crm permiso', async () => {
    mockGetSession.mockResolvedValue({ ...crmJperez, permisos: ['otro'] });
    const asignaciones = makeFakeAsignaciones();
    setDb(makeFakeEmpresas(), asignaciones);

    const response = await POST(jsonPost('42'), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe('FORBIDDEN');
    expect(asignaciones.registrarAsignacion).not.toHaveBeenCalled();
  });

  it('returns 200 DEVUELTO when the CURRENT OWNER returns the empresa (no admin needed)', async () => {
    mockGetSession.mockResolvedValue(crmJperez);
    const asignaciones = makeFakeAsignaciones();
    setDb(makeFakeEmpresas(), asignaciones);

    const response = await POST(jsonPost('42'), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, accion: 'DEVUELTO', responsablePrevio: 'jperez' });
    expect(asignaciones.registrarAsignacion).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: 42,
        accion: 'DEVUELTO',
        responsablePrevio: 'jperez',
        responsableNuevo: null,
        actorUsuario: 'u-jperez',
      }),
    );
  });

  it('returns 200 DEVUELTO when a PRODUCTION-identity owner returns the empresa (sub = opaque idUsuario, resolved via getById)', async () => {
    // REGRESSION (verify flag 1, tasks risks 17/18): real sessions carry
    // session.sub = dbo.usuarios.idUsuario (an opaque ID), while
    // CRM_Empresas.responsable stores the login username. The owner match
    // MUST resolve sub → usuario through the auth module's getById (the
    // pr15 cartera canonical resolution), not string notation tricks.
    mockGetSession.mockResolvedValue({ sub: 'usr-7f3a', nombre: 'Juan Perez', area: 'ventas', permisos: ['crm'] });
    mockUsuarioLookup({ 'usr-7f3a': 'jperez' });
    const asignaciones = makeFakeAsignaciones();
    setDb(makeFakeEmpresas(), asignaciones);

    const response = await POST(jsonPost('42'), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, accion: 'DEVUELTO', responsablePrevio: 'jperez' });
    expect(asignaciones.registrarAsignacion).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: 42,
        accion: 'DEVUELTO',
        responsablePrevio: 'jperez',
        responsableNuevo: null,
        actorUsuario: 'usr-7f3a',
      }),
    );
  });

  it('returns 200 DEVUELTO when an ADMIN (non-owner) returns the empresa', async () => {
    mockGetSession.mockResolvedValue(adminMgarcia);
    const asignaciones = makeFakeAsignaciones();
    setDb(makeFakeEmpresas(), asignaciones);

    const response = await POST(jsonPost('42'), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, accion: 'DEVUELTO', responsablePrevio: 'jperez' });
    expect(asignaciones.registrarAsignacion).toHaveBeenCalledWith(
      expect.objectContaining({ actorUsuario: 'u-mgarcia' }),
    );
  });

  it('returns 403 when a non-owner non-admin tries to return the empresa (port untouched)', async () => {
    mockGetSession.mockResolvedValue(crmMgarcia);
    const asignaciones = makeFakeAsignaciones();
    setDb(makeFakeEmpresas(), asignaciones);

    const response = await POST(jsonPost('42'), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe('FORBIDDEN');
    expect(asignaciones.registrarAsignacion).not.toHaveBeenCalled();
  });

  it('returns 401 when the session’s idUsuario no longer resolves (stale session)', async () => {
    mockGetSession.mockResolvedValue(crmJperez);
    mockUsuarioLookup({}); // getById → null for any id
    const asignaciones = makeFakeAsignaciones();
    setDb(makeFakeEmpresas(), asignaciones);

    const response = await POST(jsonPost('42'), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.code).toBe('UNAUTHORIZED');
    expect(asignaciones.registrarAsignacion).not.toHaveBeenCalled();
  });

  it('returns 404 NOT_FOUND_ERROR when the empresa does not exist', async () => {
    mockGetSession.mockResolvedValue(adminMgarcia);
    const asignaciones = makeFakeAsignaciones();
    setDb(makeFakeEmpresas({ obtenerPorId: vi.fn().mockResolvedValue(null) }), asignaciones);

    const response = await POST(jsonPost('99'), routeContext('99'));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.code).toBe('NOT_FOUND_ERROR');
    expect(asignaciones.registrarAsignacion).not.toHaveBeenCalled();
  });

  it('returns 400 when the empresa is ALREADY in the pool (no-op guard)', async () => {
    mockGetSession.mockResolvedValue(adminMgarcia);
    const asignaciones = makeFakeAsignaciones();
    setDb(
      makeFakeEmpresas({ obtenerPorId: vi.fn().mockResolvedValue({ ...empresa, responsable: null }) }),
      asignaciones,
    );

    const response = await POST(jsonPost('42'), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(asignaciones.registrarAsignacion).not.toHaveBeenCalled();
  });

  it('returns 400 for a non-numeric id', async () => {
    mockGetSession.mockResolvedValue(adminMgarcia);
    const asignaciones = makeFakeAsignaciones();
    setDb(makeFakeEmpresas(), asignaciones);

    const response = await POST(jsonPost('abc'), routeContext('abc'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(asignaciones.registrarAsignacion).not.toHaveBeenCalled();
  });

  it('returns 500 INTERNAL_ERROR on an unexpected failure', async () => {
    mockGetSession.mockResolvedValue(crmJperez);
    setDb(
      makeFakeEmpresas(),
      makeFakeAsignaciones({ registrarAsignacion: vi.fn().mockRejectedValue(new Error('db down')) }),
    );

    const response = await POST(jsonPost('42'), routeContext('42'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});

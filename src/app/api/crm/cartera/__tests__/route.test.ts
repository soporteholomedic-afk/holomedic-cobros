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
  CandidatoCola,
  CrmEmpresaRepositoryPort,
  CrmPipelineRepositoryPort,
} from '@/features/crm/domain/ports';
import type { Empresa } from '@/features/crm/domain/entities';

/**
 * `/api/crm/cartera` seam matrix (tasks pr15/WU1, spec G5 "Cartera
 * views"): the route resolves the session's LOGIN NAME (session.sub is
 * the opaque idUsuario — the canonical resolution this slice owns, via
 * the auth module's own `getUsuarioDb().getById`) and passes it to the
 * scoping use case. A plain `crm` holder can NEVER widen the scope,
 * not even with `?todas=true`.
 */

const empresaJperez: Empresa = {
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

const empresaAjena: Empresa = {
  ...empresaJperez,
  id: 43,
  ruc: '900999999',
  rucNormalizado: '900999999',
  razonSocial: 'De otro',
  responsable: 'mgarcia',
};

function filaCandidato(empresaId: number): CandidatoCola {
  return {
    empresaId,
    flujo: 'OUTBOUND',
    etapa: 'CADENCIA',
    ciclo: 1,
    enviosCiclo: 1,
    fechaCicloInicio: '2026-05-25',
    fechaUltimoEnvio: '2026-05-25',
    descansoHasta: null,
    rechazadoHasta: null,
    motivoRechazo: null,
    updatedBy: null,
    updatedAt: '2026-05-25T00:00:00.000Z',
    razonSocial: 'Constructora X',
    responsable: 'jperez',
  };
}

function makeFakeEmpresas(listado: Empresa[]): CrmEmpresaRepositoryPort {
  return {
    crear: vi.fn(),
    listar: vi.fn().mockResolvedValue(structuredClone(listado)),
    obtenerPorId: vi.fn(),
    actualizar: vi.fn(),
  };
}

function makeFakePipeline(): CrmPipelineRepositoryPort {
  return {
    obtenerPorEmpresaId: vi.fn(),
    registrarTransicion: vi.fn(),
    cambiarTipo: vi.fn(),
    listarTransiciones: vi.fn().mockResolvedValue([]),
    listarHandoffs: vi.fn().mockResolvedValue([]),
    listarCandidatosCola: vi.fn().mockResolvedValue([filaCandidato(42)]),
  } satisfies CrmPipelineRepositoryPort;
}

function setDb(empresas: CrmEmpresaRepositoryPort, pipeline: CrmPipelineRepositoryPort): void {
  __setCrmDbForTests({
    pool: {} as never,
    empresas,
    importador: {} as never,
    pipeline,
    transiciones: {} as never,
    resultados: {} as never,
    handoffs: {} as never,
    actividades: {} as never,
    asignaciones: {} as never,
  } satisfies CrmDb);
}

/** Sessions: sub '10' resolves to login name 'jperez'; '11' to 'mgarcia'. */
const crmJperez = { sub: '10', nombre: 'Juan Perez', area: 'ventas', permisos: ['crm'] };
const crmMgarcia = { sub: '11', nombre: 'Maria Garcia', area: 'ventas', permisos: ['crm'] };
const adminMgarcia = { ...crmMgarcia, permisos: ['crm', 'crm_admin'] };

function mockUsuarioLookup(mapa: Record<string, string | null>): void {
  mockGetUsuarioDb.mockResolvedValue({
    getById: vi.fn(async (id: string) =>
      mapa[id] === undefined ? null : { idUsuario: id, usuario: mapa[id] },
    ),
  });
}

function pedir(query = ''): Request {
  return new Request(`http://localhost/api/crm/cartera${query}`, { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockReset();
  mockGetUsuarioDb.mockReset();
});

afterEach(() => {
  __setCrmDbForTests(null);
});

describe('GET /api/crm/cartera — resolved-identity scoping (spec G5)', () => {
  it('returns 401 UNAUTHORIZED without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    setDb(makeFakeEmpresas([]), makeFakePipeline());

    const response = await GET(pedir());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 without the crm permiso', async () => {
    mockGetSession.mockResolvedValue({ ...crmJperez, permisos: ['otro'] });
    setDb(makeFakeEmpresas([]), makeFakePipeline());

    const response = await GET(pedir());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe('FORBIDDEN');
  });

  it('returns 200 with the user’s OWN empresas, resolved from sub via getById', async () => {
    mockGetSession.mockResolvedValue(crmJperez);
    mockUsuarioLookup({ '10': 'jperez' });
    const empresas = makeFakeEmpresas([empresaJperez]);
    const pipeline = makeFakePipeline();
    setDb(empresas, pipeline);

    const response = await GET(pedir());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.todas).toBe(false);
    expect(body.filas).toHaveLength(1);
    expect(body.filas[0]).toMatchObject({
      empresaId: 42,
      razonSocial: 'Constructora X',
      etapa: 'CADENCIA',
      proximaAccion: 'Enviar seguimiento (vencido hoy)',
    });
    // THE scoping proof: the resolved LOGIN NAME (not sub) filters.
    expect(empresas.listar).toHaveBeenCalledWith({ responsable: 'jperez' });
  });

  it('a plain user with ?todas=true STAYS scoped to own (no leak at the boundary)', async () => {
    mockGetSession.mockResolvedValue(crmJperez);
    mockUsuarioLookup({ '10': 'jperez' });
    const empresas = makeFakeEmpresas([empresaJperez]);
    setDb(empresas, makeFakePipeline());

    const response = await GET(pedir('?todas=true'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.todas).toBe(false);
    expect(empresas.listar).toHaveBeenCalledWith({ responsable: 'jperez' });
  });

  it('admin with ?todas=true gets ALL empresas (port called without the owner filter)', async () => {
    mockGetSession.mockResolvedValue(adminMgarcia);
    mockUsuarioLookup({ '11': 'mgarcia' });
    const empresas = makeFakeEmpresas([empresaJperez, empresaAjena]);
    setDb(empresas, makeFakePipeline());

    const response = await GET(pedir('?todas=true'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.todas).toBe(true);
    expect(body.filas).toHaveLength(2);
    // No owner filter — the whole registry read (no-arg listar).
    expect(empresas.listar).toHaveBeenCalledWith();
  });

  it('admin without todas sees only their OWN cartera', async () => {
    mockGetSession.mockResolvedValue(adminMgarcia);
    mockUsuarioLookup({ '11': 'mgarcia' });
    const empresas = makeFakeEmpresas([empresaAjena]);
    setDb(empresas, makeFakePipeline());

    const response = await GET(pedir());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.todas).toBe(false);
    expect(empresas.listar).toHaveBeenCalledWith({ responsable: 'mgarcia' });
  });

  it('returns 400 for an invalid todas param', async () => {
    mockGetSession.mockResolvedValue(crmJperez);
    mockUsuarioLookup({ '10': 'jperez' });
    setDb(makeFakeEmpresas([]), makeFakePipeline());

    const response = await GET(pedir('?todas=si'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 401 when the session’s idUsuario no longer resolves (stale session)', async () => {
    mockGetSession.mockResolvedValue(crmJperez);
    mockUsuarioLookup({}); // getById → null for any id
    setDb(makeFakeEmpresas([]), makeFakePipeline());

    const response = await GET(pedir());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 500 INTERNAL_ERROR on an unexpected failure', async () => {
    mockGetSession.mockResolvedValue(crmJperez);
    mockUsuarioLookup({ '10': 'jperez' });
    setDb(
      {
        ...makeFakeEmpresas([]),
        listar: vi.fn().mockRejectedValue(new Error('db down')),
      },
      makeFakePipeline(),
    );

    const response = await GET(pedir());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});

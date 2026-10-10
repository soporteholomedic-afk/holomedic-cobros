import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mock auth session (panel route.test.ts precedent) ----

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
}));

// ---- Import under test (after mocks) ----

import { GET } from '@/app/api/crm/conversaciones/[id]/candidatos/route';
import { __setCrmDbForTests, type CrmDb } from '@/features/crm/infrastructure/getCrmDb';
import type { ContactoConEmpresa, ConversacionCrmRepository } from '@/features/crm/domain/ports';

/**
 * Seam contract for GET /api/crm/conversaciones/[id]/candidatos
 * (agente-ia-crm E1, panel de vinculación): permiso
 * `crm_conversaciones` (401 sin sesión, 403 sin permiso), `busqueda`
 * con ≥ 2 caracteres o 400, and the candidates ride the success body
 * verbatim from the port's text search (TOP 20 por defecto).
 */

const candidato: ContactoConEmpresa = {
  contactoId: 11,
  empresaId: 1,
  nombreContacto: 'Ana Ruiz',
  razonSocial: 'Constructora Andes SA',
  telefono: '0981 234 567',
};

function makeFakeRepo(
  overrides: Partial<ConversacionCrmRepository> = {},
): ConversacionCrmRepository {
  return {
    crear: vi.fn(),
    obtenerPorId: vi.fn(),
    buscarPorCanal: vi.fn(),
    listar: vi.fn(),
    vincular: vi.fn(),
    actualizarEstado: vi.fn(),
    marcarMensajesLeidos: vi.fn(),
    registrarActividad: vi.fn(),
    buscarCandidatosVinculacion: vi.fn(),
    crearContacto: vi.fn(),
    obtenerContactoPorId: vi.fn(),
    buscarContactosTexto: vi.fn().mockResolvedValue([candidato]),
    ...overrides,
  } as ConversacionCrmRepository;
}

function setDb(repo: ConversacionCrmRepository): void {
  __setCrmDbForTests({
    pool: {} as never,
    empresas: {} as never,
    importador: {} as never,
    pipeline: {} as never,
    transiciones: {} as never,
    resultados: {} as never,
    handoffs: {} as never,
    actividades: {} as never,
    asignaciones: {} as never,
    envios: {} as never,
    panel: {} as never,
    conversaciones: repo,
    mensajes: {} as never,
  } satisfies CrmDb);
}

function request(query: string): Request {
  return new Request(`http://localhost/api/crm/conversaciones/7/candidatos?${query}`);
}

function ctx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

const sessionBase = { sub: 'u-1', nombre: 'Juana Perez', area: 'ventas' };
const conversacionesSession = { ...sessionBase, permisos: ['crm_conversaciones'] };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockReset();
  mockGetSession.mockResolvedValue(conversacionesSession);
  setDb(makeFakeRepo());
});

afterEach(() => {
  __setCrmDbForTests(null);
});

describe('GET /api/crm/conversaciones/[id]/candidatos', () => {
  it('401s without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const response = await GET(request('busqueda=ana'), ctx('7'));
    expect(response.status).toBe(401);
  });

  it('403s without the crm_conversaciones permiso', async () => {
    mockGetSession.mockResolvedValue({ ...sessionBase, permisos: ['crm'] });
    const response = await GET(request('busqueda=ana'), ctx('7'));
    expect(response.status).toBe(403);
  });

  it('400s on an invalid conversation id', async () => {
    const response = await GET(request('busqueda=ana'), ctx('abc'));
    expect(response.status).toBe(400);
  });

  it('400s when busqueda is shorter than 2 characters', async () => {
    const response = await GET(request('busqueda=a'), ctx('7'));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('400s when busqueda is missing', async () => {
    const response = await GET(request(''), ctx('7'));
    expect(response.status).toBe(400);
  });

  it('returns the port candidates on success (trimmed search, TOP 20)', async () => {
    const repo = makeFakeRepo();
    setDb(repo);
    const response = await GET(request('busqueda=%20%20ana%20%20'), ctx('7'));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { success: boolean; candidatos: ContactoConEmpresa[] };
    expect(body).toEqual({ success: true, candidatos: [candidato] });
    expect(repo.buscarContactosTexto).toHaveBeenCalledWith('ana', 20);
  });

  it('503s when the adapter lacks the text search (optional port)', async () => {
    const repo = makeFakeRepo();
    delete (repo as Partial<ConversacionCrmRepository>).buscarContactosTexto;
    setDb(repo);
    const response = await GET(request('busqueda=ana'), ctx('7'));
    expect(response.status).toBe(503);
  });

  it('maps a repository failure to 500 INTERNAL_ERROR', async () => {
    setDb(makeFakeRepo({ buscarContactosTexto: vi.fn().mockRejectedValue(new Error('boom')) }));
    const response = await GET(request('busqueda=ana'), ctx('7'));
    expect(response.status).toBe(500);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});

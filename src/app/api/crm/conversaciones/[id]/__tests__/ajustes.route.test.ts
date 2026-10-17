import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Route contract for GET/POST /api/crm/conversaciones/[id]/ajustes
 * (E3·T5) — the operator's settings panel source. Pinned:
 * - GET 200 {success, estado, modo, asignadaA, memoriaActiva, config};
 *   404 unknown conversación.
 * - POST {memoriaActiva: boolean} → 200 with the REFRESHED ajustes;
 *   invalid body → 400; 401/403 session/permiso gates.
 * Use case mocked at the module boundary (memorias route precedent).
 */

const mocks = vi.hoisted(() => ({
  obtenerMock: vi.fn(),
  actualizarMock: vi.fn(),
  sessionMock: vi.fn(),
  depsMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ getSession: mocks.sessionMock }));

vi.mock('@/features/crm/application/ajustesConversacion', () => ({
  AjustesConversacionUseCase: class AjustesConversacionUseCaseFake {
    constructor(deps: unknown) {
      mocks.depsMock(deps);
    }
    obtener = mocks.obtenerMock;
    actualizarMemoriaActiva = mocks.actualizarMock;
  },
}));

import { GET, POST } from '../ajustes/route';
import { __setCrmDbForTests, type CrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { NotFoundError } from '@/features/crm/domain/errors';

const sessionBase = { sub: 'u-1', nombre: 'Juana Perez', area: 'ventas' };

function setDb(): void {
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
    conversaciones: {} as never,
  } satisfies CrmDb);
}

function setDbConConfig(filas: Array<{ clave: string; valor: string }>): void {
  __setCrmDbForTests({
    pool: {} as never,
    conversaciones: {} as never,
    config: {
      listar: async () =>
        filas.map((fila) => ({
          ...fila,
          esSecreto: false,
          actualizadoPor: 'admin',
          actualizadoEn: new Date(),
        })),
    } as never,
  } as unknown as CrmDb);
}

function routeContext(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

const AJUSTES = {
  estado: 'REQUIERE_HUMANO',
  modo: 'IA',
  asignadaA: null,
  memoriaActiva: true,
  config: { umbralConfianza: 0.6, maxIntercambios: 8, horarioDesde: 8, horarioHasta: 18 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sessionMock.mockResolvedValue({ ...sessionBase, permisos: ['crm_conversaciones'] });
  setDb();
});

afterEach(() => {
  __setCrmDbForTests(null);
});

describe('GET /api/crm/conversaciones/[id]/ajustes (E3·T5)', () => {
  it('200 happy: {success, ...ajustes}', async () => {
    mocks.obtenerMock.mockResolvedValueOnce(AJUSTES);

    const response = await GET(
      new Request('http://localhost/api/crm/conversaciones/1/ajustes') as Parameters<
        typeof GET
      >[0],
      routeContext('1'),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, ...AJUSTES });
    expect(mocks.obtenerMock).toHaveBeenCalledWith(1);
  });

  it('conversación inexistente → 404 NOT_FOUND_ERROR', async () => {
    mocks.obtenerMock.mockRejectedValueOnce(new NotFoundError('Conversación no encontrada'));

    const response = await GET(
      new Request('http://localhost/api/crm/conversaciones/99/ajustes') as Parameters<
        typeof GET
      >[0],
      routeContext('99'),
    );

    expect(response.status).toBe(404);
  });

  it('id inválido → 400', async () => {
    const response = await GET(
      new Request('http://localhost/api/crm/conversaciones/x/ajustes') as Parameters<
        typeof GET
      >[0],
      routeContext('x'),
    );

    expect(response.status).toBe(400);
  });

  it('sin sesión → 401; sin permiso → 403', async () => {
    mocks.sessionMock.mockResolvedValueOnce(null);
    const sinSesion = await GET(
      new Request('http://localhost/api/crm/conversaciones/1/ajustes') as Parameters<
        typeof GET
      >[0],
      routeContext('1'),
    );
    expect(sinSesion.status).toBe(401);

    mocks.sessionMock.mockResolvedValueOnce({ ...sessionBase, permisos: [] });
    const sinPermiso = await GET(
      new Request('http://localhost/api/crm/conversaciones/1/ajustes') as Parameters<
        typeof GET
      >[0],
      routeContext('1'),
    );
    expect(sinPermiso.status).toBe(403);
  });
});

describe('GET ajustes — config injection (E5·T3 gap)', () => {
  interface DepsCapturadas {
    config?: () => Promise<{ umbralConfianza: number }>;
  }

  async function llamarGet(): Promise<DepsCapturadas> {
    mocks.obtenerMock.mockResolvedValueOnce(AJUSTES);
    await GET(
      new Request('http://localhost/api/crm/conversaciones/1/ajustes') as Parameters<typeof GET>[0],
      routeContext('1'),
    );
    return mocks.depsMock.mock.calls[0]?.[0] as DepsCapturadas;
  }

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('injects the DB-backed resolver when db.config exists: a DB row overrides env', async () => {
    vi.stubEnv('AGENTE_UMBRAL_CONF', '0.5');
    setDbConConfig([{ clave: 'agente.umbralConfianza', valor: '0.9' }]);

    const deps = await llamarGet();

    expect(deps.config).toBeTypeOf('function');
    expect((await deps.config?.())?.umbralConfianza).toBe(0.9);
  });

  it('falls back to env (no resolver injected) when db.config is absent', async () => {
    vi.stubEnv('AGENTE_UMBRAL_CONF', '0.5');

    const deps = await llamarGet();

    expect(deps.config).toBeUndefined();
  });
});

describe('POST /api/crm/conversaciones/[id]/ajustes (E3·T5)', () => {
  function jsonPost(body: unknown): Parameters<typeof POST>[0] {
    return new Request('http://localhost/api/crm/conversaciones/1/ajustes', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }) as Parameters<typeof POST>[0];
  }

  it('200 happy: {memoriaActiva: false} → ajustes refrescados', async () => {
    mocks.actualizarMock.mockResolvedValueOnce({ ...AJUSTES, memoriaActiva: false });

    const response = await POST(jsonPost({ memoriaActiva: false }), routeContext('1'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, ...AJUSTES, memoriaActiva: false });
    expect(mocks.actualizarMock).toHaveBeenCalledWith(1, false);
  });

  it('cuerpo inválido (sin memoriaActiva / tipo erróneo / JSON roto) → 400', async () => {
    const sinCampo = await POST(jsonPost({}), routeContext('1'));
    expect(sinCampo.status).toBe(400);

    const tipoErroneo = await POST(jsonPost({ memoriaActiva: 'si' }), routeContext('1'));
    expect(tipoErroneo.status).toBe(400);

    const jsonRoto = await POST(jsonPost('{no'), routeContext('1'));
    expect(jsonRoto.status).toBe(400);
  });

  it('conversación inexistente → 404', async () => {
    mocks.actualizarMock.mockRejectedValueOnce(new NotFoundError('Conversación no encontrada'));

    const response = await POST(jsonPost({ memoriaActiva: true }), routeContext('1'));

    expect(response.status).toBe(404);
  });
});

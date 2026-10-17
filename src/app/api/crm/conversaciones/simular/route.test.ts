import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Route contract for POST /api/crm/conversaciones/simular (agente-ia-crm
 * E1, remediation R1-ruta-simular-siempre-presente): the inbound
 * simulator exists ONLY while simulated mode is active (the SAME
 * esModoSimulado flag the UI card uses). Pinned:
 * - prod SIN KAPSO_MODO (fail-closed) → 404 before ANY auth/body/db
 * - dev + KAPSO_MODO=real → 404 (same flag; the use-case guard stays
 *   as backstop)
 * - prod + KAPSO_MODO=simulado EXPLÍCITO → la ruta existe (201),
 *   coherente con la tarjeta del UI
 *   body; the use case is never invoked)
 * - dev + KAPSO_MODO=real → 403 SIMULACION_DESACTIVADA (explicit real
 *   mode keeps the simulator off in dev too)
 * - dev + KAPSO_MODO=simulado → 201 happy path
 * - missing session → 401; missing permiso → 403 FORBIDDEN; invalid
 *   body → 400
 * The use case is mocked at the module boundary (its own pipeline is
 * covered by simularMensajeEntrante.test.ts).
 */

const mocks = vi.hoisted(() => {
  /** Same name/code as the real SimulacionDesactivadaError (route instanceof check). */
  class SimulacionDesactivadaFake extends Error {
    readonly code = 'SIMULACION_DESACTIVADA' as const;
  }
  return {
    ejecutarMock: vi.fn(),
    depsCapturadas: [] as unknown[],
    getSessionMock: vi.fn(),
    SimulacionDesactivadaFake,
  };
});

vi.mock('@/lib/auth', () => ({ getSession: mocks.getSessionMock }));

vi.mock('@/features/crm/application/simularMensajeEntrante', () => ({
  SimularMensajeEntranteUseCase: class SimularMensajeEntranteUseCaseFake {
    readonly ejecutar = mocks.ejecutarMock;
    constructor(deps: unknown) {
      mocks.depsCapturadas.push(deps);
    }
  },
  SimulacionDesactivadaError: mocks.SimulacionDesactivadaFake,
}));

import { POST } from './route';
import { __setCrmDbForTests, type CrmDb } from '@/features/crm/infrastructure/getCrmDb';
import type { ConfigCrmRepository } from '@/features/crm/domain/ports';

const sessionBase = { sub: 'u-1', nombre: 'Juana Perez', area: 'ventas' };

function setDb(config?: Pick<ConfigCrmRepository, 'listar'>): void {
  __setCrmDbForTests({
    ...(config ? { config: config as ConfigCrmRepository } : {}),
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
    mensajes: {} as never,
  } satisfies CrmDb);
}

function jsonPost(body: unknown): Request {
  return new Request('http://localhost/api/crm/conversaciones/simular', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionMock.mockResolvedValue({ ...sessionBase, permisos: ['crm_conversaciones'] });
  setDb();
});

afterEach(() => {
  __setCrmDbForTests(null);
  vi.unstubAllEnvs();
});

describe('POST /api/crm/conversaciones/simular — ruta solo-dev (E1)', () => {
  it('en producción SIN KAPSO_MODO (fail-closed) responde 404 sin tocar sesión ni use case', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const response = await POST(jsonPost({ telefono: '0981 234 567', texto: 'hola' }));

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toMatchObject({ success: false, code: 'NOT_FOUND_ERROR' });
    expect(mocks.getSessionMock).not.toHaveBeenCalled();
    expect(mocks.ejecutarMock).not.toHaveBeenCalled();
  });

  it('en dev con KAPSO_MODO=real → 404 (la ruta no existe sin modo simulado)', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('KAPSO_MODO', 'real');

    const response = await POST(jsonPost({ telefono: '0981 234 567', texto: 'hola' }));

    expect(response.status).toBe(404);
    expect(mocks.getSessionMock).not.toHaveBeenCalled();
    expect(mocks.ejecutarMock).not.toHaveBeenCalled();
  });

  it('en producción con KAPSO_MODO=simulado EXPLÍCITO la ruta existe → 201 (coherente con la tarjeta UI)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('KAPSO_MODO', 'simulado');
    mocks.ejecutarMock.mockResolvedValueOnce({ conversacionId: 3, mensajeId: 5, vinculado: true });

    const response = await POST(jsonPost({ telefono: '0981 234 567', texto: 'hola' }));

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({ success: true, conversacionId: 3, vinculado: true });
  });

  it('en dev con KAPSO_MODO=simulado → 201 happy path', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('KAPSO_MODO', 'simulado');
    mocks.ejecutarMock.mockResolvedValueOnce({ conversacionId: 7, mensajeId: 9, vinculado: false });

    const response = await POST(jsonPost({ telefono: '0981 234 567', texto: 'hola' }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      success: true,
      conversacionId: 7,
      mensajeId: 9,
      vinculado: false,
    });
    expect(mocks.ejecutarMock).toHaveBeenCalledWith({ telefono: '0981 234 567', texto: 'hola' });
  });

  it('DB modo=simulado con KAPSO_MODO=real → 201 y el use case recibe la decisión resuelta (true)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('KAPSO_MODO', 'real');
    setDb({
      listar: async () => [
        {
          clave: 'canal.kapso.modo',
          valor: 'simulado',
          esSecreto: false,
          actualizadoPor: 'admin',
          actualizadoEn: new Date(),
        },
      ],
    });
    mocks.ejecutarMock.mockResolvedValueOnce({ conversacionId: 1, mensajeId: 2, vinculado: false });

    const response = await POST(jsonPost({ telefono: '0981 234 567', texto: 'hola' }));

    expect(response.status).toBe(201);
    const deps = mocks.depsCapturadas[0] as { modoSimulado?: () => boolean | Promise<boolean> };
    expect(typeof deps.modoSimulado).toBe('function');
    expect(await deps.modoSimulado?.()).toBe(true);
  });

  it('sin sesión → 401', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    mocks.getSessionMock.mockResolvedValueOnce(null);

    const response = await POST(jsonPost({ telefono: '0981 234 567', texto: 'hola' }));

    expect(response.status).toBe(401);
    expect(mocks.ejecutarMock).not.toHaveBeenCalled();
  });

  it('sin permiso crm_conversaciones → 403 FORBIDDEN', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    mocks.getSessionMock.mockResolvedValueOnce({ ...sessionBase, permisos: ['cobranza'] });

    const response = await POST(jsonPost({ telefono: '0981 234 567', texto: 'hola' }));

    expect(response.status).toBe(403);
    expect(mocks.ejecutarMock).not.toHaveBeenCalled();
  });

  it('cuerpo inválido (texto vacío) → 400 VALIDATION_ERROR', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const response = await POST(jsonPost({ telefono: '0981 234 567', texto: '   ' }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
    expect(mocks.ejecutarMock).not.toHaveBeenCalled();
  });
});

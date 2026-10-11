import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Route contract for POST /api/crm/conversaciones/[id]/indicacion
 * (agente-ia-crm E3·T3) — the operator answers a pending help request
 * with an indicación. Pinned: session + crm_conversaciones, strict
 * [id] parsing, {indicacion} body, the trimmed result shape
 * {solicitud, hueco, memoria, tarea}, AyudaNoPendienteError → 409
 * (NOT the NotFoundError 404 its parent class would map to), the
 * fire-and-forget agent drain after a successful apply, and typed
 * error mapping (404 conversación / 400 indicación inválida). The
 * use case is mocked at the module boundary (simular route test
 * precedent — its pipeline has its own aplicarIndicacion.test.ts).
 */

const mocks = vi.hoisted(() => {
  class AyudaNoPendienteFake extends Error {
    readonly code = 'NOT_FOUND_ERROR' as const;
  }
  return {
    ejecutarMock: vi.fn(),
    getSessionMock: vi.fn(),
    procesarMock: vi.fn(),
    AyudaNoPendienteFake,
  };
});

vi.mock('@/lib/auth', () => ({ getSession: mocks.getSessionMock }));

vi.mock('@/features/crm/application/aplicarIndicacion', () => ({
  AplicarIndicacionUseCase: class AplicarIndicacionUseCaseFake {
    readonly ejecutar = mocks.ejecutarMock;
  },
  AyudaNoPendienteError: mocks.AyudaNoPendienteFake,
}));

vi.mock('@/features/crm/infrastructure/engram/crearMemoriaConversacion', () => ({
  crearMemoriaConversacion: () => ({}) as never,
}));

vi.mock('@/features/crm/infrastructure/agentes/iniciarBarredorTareas', () => ({
  iniciarBarredorTareas: () => {},
}));

vi.mock('@/features/crm/infrastructure/agentes/crearProcesadorTareasAgente', () => ({
  crearProcesadorTareasAgente: () => ({ procesar: mocks.procesarMock }),
}));

import { POST } from '../indicacion/route';
import { __setCrmDbForTests, type CrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { NotFoundError, ValidationError } from '@/features/crm/domain/errors';

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
    mensajes: {} as never,
    conocimiento: {} as never,
    tareas: {} as never,
  } satisfies CrmDb);
}

function routeContext(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function jsonPost(id: string, body: unknown): Parameters<typeof POST>[0] {
  return new Request(`http://localhost/api/crm/conversaciones/${id}/indicacion`, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }) as Parameters<typeof POST>[0];
}

const RESULTADO = {
  solicitud: {
    id: 11,
    conversacionId: 1,
    mensajeId: 55,
    consulta: '¿Hacen exámenes los sábados?',
    terminosBuscados: ['hacen', 'examenes'],
    score: 0.3,
    estado: 'RESUELTA',
    indicacion: 'Dile que sí, sábados de 8 a 12',
    resueltaPor: 'Juana Perez',
    creadoEn: new Date(),
    resueltaEn: new Date(),
  },
  hueco: {
    id: 61,
    consulta: '¿Hacen exámenes los sábados?',
    terminos: ['hacen', 'examenes'],
    estado: 'ABIERTO',
    origenSolicitudId: 11,
    creadoEn: new Date(),
  },
  memoria: { guardada: true },
  tarea: { id: 71, creada: true },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionMock.mockResolvedValue({ ...sessionBase, permisos: ['crm_conversaciones'] });
  mocks.procesarMock.mockResolvedValue({ procesadas: 1, resultados: [] });
  setDb();
});

afterEach(() => {
  __setCrmDbForTests(null);
});

describe('POST /api/crm/conversaciones/[id]/indicacion (E3·T3)', () => {
  it('200 happy: aplica la indicación y responde el resultado recortado; drena tareas fire-and-forget', async () => {
    mocks.ejecutarMock.mockResolvedValueOnce(RESULTADO);

    const response = await POST(jsonPost('1', { indicacion: 'Dile que sí, sábados de 8 a 12' }), routeContext('1'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      solicitud: { id: 11, estado: 'RESUELTA' },
      hueco: { id: 61 },
      memoria: { guardada: true },
      tarea: { id: 71, tipo: 'RESPONDER_CON_INDICACION' },
    });
    expect(mocks.ejecutarMock).toHaveBeenCalledWith({
      conversacionId: 1,
      indicacion: 'Dile que sí, sábados de 8 a 12',
      usuarioId: 'u-1',
      usuarioNombre: 'Juana Perez',
    });
    expect(mocks.procesarMock).toHaveBeenCalled();
  });

  it('resueltaPor cae al sub cuando la sesión no carga nombre', async () => {
    mocks.getSessionMock.mockResolvedValueOnce({
      ...sessionBase,
      nombre: '',
      permisos: ['crm_conversaciones'],
    });
    mocks.ejecutarMock.mockResolvedValueOnce(RESULTADO);

    const response = await POST(jsonPost('1', { indicacion: 'x' }), routeContext('1'));

    expect(response.status).toBe(200);
    expect(mocks.ejecutarMock).toHaveBeenCalledWith(
      expect.objectContaining({ usuarioId: 'u-1', usuarioNombre: '' }),
    );
  });

  it('409 CONFLICT_ERROR cuando NO hay solicitud pendiente (AyudaNoPendienteError, no 404)', async () => {
    mocks.ejecutarMock.mockRejectedValueOnce(new mocks.AyudaNoPendienteFake('sin pendiente'));

    const response = await POST(jsonPost('1', { indicacion: 'x' }), routeContext('1'));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({ success: false, code: 'CONFLICT_ERROR' });
    expect(mocks.procesarMock).not.toHaveBeenCalled();
  });

  it('404 NOT_FOUND_ERROR cuando la conversación no existe', async () => {
    mocks.ejecutarMock.mockRejectedValueOnce(new NotFoundError('Conversación no encontrada'));

    const response = await POST(jsonPost('99', { indicacion: 'x' }), routeContext('99'));

    expect(response.status).toBe(404);
  });

  it('400 VALIDATION_ERROR cuando la indicación es inválida (use case tipado)', async () => {
    mocks.ejecutarMock.mockRejectedValueOnce(new ValidationError('La indicación no puede estar vacía'));

    const response = await POST(jsonPost('1', { indicacion: '   ' }), routeContext('1'));

    expect(response.status).toBe(400);
  });

  it('sin sesión → 401; sin permiso → 403; id inválido → 400; body inválido → 400', async () => {
    mocks.getSessionMock.mockResolvedValueOnce(null);
    expect((await POST(jsonPost('1', { indicacion: 'x' }), routeContext('1'))).status).toBe(401);

    mocks.getSessionMock.mockResolvedValueOnce({ ...sessionBase, permisos: ['cobranza'] });
    expect((await POST(jsonPost('1', { indicacion: 'x' }), routeContext('1'))).status).toBe(403);

    mocks.ejecutarMock.mockResolvedValueOnce(RESULTADO);
    expect((await POST(jsonPost('abc', { indicacion: 'x' }), routeContext('abc'))).status).toBe(400);

    expect((await POST(jsonPost('1', 'no-json{'), routeContext('1'))).status).toBe(400);
    expect((await POST(jsonPost('1', { otra: 'cosa' }), routeContext('1'))).status).toBe(400);
    expect(mocks.ejecutarMock).not.toHaveBeenCalled();
  });
});

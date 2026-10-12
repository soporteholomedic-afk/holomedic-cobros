import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Route contract for POST /api/crm/conversaciones/[id]/deficiente
 * (agente-ia-crm E4·T5) — the operator flags an IA reply as deficient
 * and the engine leaves a KB-gap candidate for the curator. Pinned:
 * session + crm_conversaciones, strict [id] parsing, {mensajeId}
 * body (positive integer), the trimmed result shape {huecoId,
 * mensajeId}, and typed error mapping — MENSAJE_YA_MARCADO → 409
 * (huecoId incluido cuando se conoce), SIN_CONSULTA_PREVIA → 422
 * (NOT the 400 its ValidationError parent would map to), mensaje/
 * conversación inexistente → 404. The use case is mocked at the
 * module boundary (indicacion route test precedent — its pipeline
 * has its own marcarRespuestaDeficiente.test.ts).
 */

const mocks = vi.hoisted(() => {
  class MensajeYaMarcadoFake extends Error {
    readonly code = 'CONFLICT_ERROR' as const;
    readonly huecoId: number | null;
    constructor(huecoId: number | null = null) {
      super('La respuesta ya fue marcada como deficiente');
      this.name = 'MensajeYaMarcadoError';
      this.huecoId = huecoId;
    }
  }
  class SinConsultaPreviaFake extends Error {
    readonly code = 'VALIDATION_ERROR' as const;
    constructor() {
      super('No hay una consulta previa del cliente para marcar');
      this.name = 'SinConsultaPreviaError';
    }
  }
  return {
    ejecutarMock: vi.fn(),
    getSessionMock: vi.fn(),
    MensajeYaMarcadoFake,
    SinConsultaPreviaFake,
  };
});

vi.mock('@/lib/auth', () => ({ getSession: mocks.getSessionMock }));

vi.mock('@/features/crm/application/marcarRespuestaDeficiente', () => ({
  MarcarRespuestaDeficienteUseCase: class MarcarRespuestaDeficienteUseCaseFake {
    readonly ejecutar = mocks.ejecutarMock;
  },
  MensajeNoEncontradoError: class extends Error {
    readonly code = 'NOT_FOUND_ERROR' as const;
  },
  MensajeYaMarcadoError: mocks.MensajeYaMarcadoFake,
  SinConsultaPreviaError: mocks.SinConsultaPreviaFake,
}));

import { POST } from '../deficiente/route';
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
  return new Request(`http://localhost/api/crm/conversaciones/${id}/deficiente`, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }) as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionMock.mockResolvedValue({ ...sessionBase, permisos: ['crm_conversaciones'] });
  setDb();
});

afterEach(() => {
  __setCrmDbForTests(null);
});

describe('POST /api/crm/conversaciones/[id]/deficiente (E4·T5)', () => {
  it('200 happy: marca la respuesta y responde {huecoId, mensajeId}', async () => {
    mocks.ejecutarMock.mockResolvedValueOnce({ huecoId: 61, mensajeId: 42 });

    const response = await POST(jsonPost('7', { mensajeId: 42 }), routeContext('7'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, huecoId: 61, mensajeId: 42 });
    expect(mocks.ejecutarMock).toHaveBeenCalledWith({
      conversacionId: 7,
      mensajeId: 42,
      usuarioId: 'u-1',
      usuarioNombre: 'Juana Perez',
    });
  });

  it('409 CONFLICT_ERROR cuando ya estaba marcada (MensajeYaMarcadoError, con huecoId si se conoce)', async () => {
    mocks.ejecutarMock.mockRejectedValueOnce(new mocks.MensajeYaMarcadoFake(61));

    const response = await POST(jsonPost('7', { mensajeId: 42 }), routeContext('7'));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({ success: false, code: 'CONFLICT_ERROR', huecoId: 61 });
  });

  it('422 VALIDATION_ERROR cuando no hay consulta previa (SinConsultaPreviaError, NO 400)', async () => {
    mocks.ejecutarMock.mockRejectedValueOnce(new mocks.SinConsultaPreviaFake());

    const response = await POST(jsonPost('7', { mensajeId: 42 }), routeContext('7'));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
  });

  it('404 NOT_FOUND_ERROR cuando la conversación o el mensaje no existe', async () => {
    mocks.ejecutarMock.mockRejectedValueOnce(new NotFoundError('Mensaje no encontrado'));

    const response = await POST(jsonPost('99', { mensajeId: 42 }), routeContext('99'));

    expect(response.status).toBe(404);
  });

  it('400 VALIDATION_ERROR cuando el use case rechaza por regla de negocio (mensaje no es IA)', async () => {
    mocks.ejecutarMock.mockRejectedValueOnce(new ValidationError('Solo respuestas de la IA'));

    const response = await POST(jsonPost('7', { mensajeId: 42 }), routeContext('7'));

    expect(response.status).toBe(400);
  });

  it('sin sesión → 401; sin permiso → 403; id inválido → 400; body inválido → 400', async () => {
    mocks.getSessionMock.mockResolvedValueOnce(null);
    expect((await POST(jsonPost('7', { mensajeId: 42 }), routeContext('7'))).status).toBe(401);

    mocks.getSessionMock.mockResolvedValueOnce({ ...sessionBase, permisos: ['cobranza'] });
    expect((await POST(jsonPost('7', { mensajeId: 42 }), routeContext('7'))).status).toBe(403);

    mocks.ejecutarMock.mockResolvedValue({ huecoId: 61, mensajeId: 42 });
    expect((await POST(jsonPost('abc', { mensajeId: 42 }), routeContext('abc'))).status).toBe(400);

    expect((await POST(jsonPost('7', 'no-json{'), routeContext('7'))).status).toBe(400);
    expect((await POST(jsonPost('7', { otra: 'cosa' }), routeContext('7'))).status).toBe(400);
    expect((await POST(jsonPost('7', { mensajeId: '42' }), routeContext('7'))).status).toBe(400);
    expect((await POST(jsonPost('7', { mensajeId: -3 }), routeContext('7'))).status).toBe(400);
    expect(mocks.ejecutarMock).not.toHaveBeenCalled();
  });
});

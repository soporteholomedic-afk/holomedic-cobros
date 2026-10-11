import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Route contract for POST /api/crm/conversaciones/[id]/escalar
 * (E3·T3) — reassign a taken conversation to another operator.
 * Pinned: the ROUTE owns the target validation (empresas asignar
 * precedent): usuarioId must be an ASIGNABLE user (permiso
 * crm_conversaciones, resolved over getUsuarioDb().list()) — unknown
 * or no-permission target → 400 VALIDATION_ERROR, never reaching the
 * use case. Happy → 200 {estado: 'TOMADA_HUMANO', asignadaA:
 * usuarioId}. Use case mocked at the module boundary.
 */

const mocks = vi.hoisted(() => ({
  ejecutarMock: vi.fn(),
  getSessionMock: vi.fn(),
  getUsuarioDbMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ getSession: mocks.getSessionMock }));

vi.mock('@/features/auth/infrastructure/getUsuarioDb', () => ({
  getUsuarioDb: mocks.getUsuarioDbMock,
}));

vi.mock('@/features/crm/application/escalarConversacion', () => ({
  EscalarConversacionUseCase: class EscalarConversacionUseCaseFake {
    readonly ejecutar = mocks.ejecutarMock;
  },
}));

import { POST } from '../escalar/route';
import { __setCrmDbForTests, type CrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { ConflictError, NotFoundError } from '@/features/crm/domain/errors';

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

function routeContext(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function jsonPost(id: string, body: unknown): Parameters<typeof POST>[0] {
  return new Request(`http://localhost/api/crm/conversaciones/${id}/escalar`, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }) as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionMock.mockResolvedValue({ ...sessionBase, permisos: ['crm_conversaciones'] });
  mocks.getUsuarioDbMock.mockResolvedValue({
    list: vi.fn().mockResolvedValue([
      { usuario: 'juana', nombre: 'Juana Perez', permisos: ['crm_conversaciones'] },
      { usuario: 'mlopez', nombre: 'Mario Lopes', permisos: ['crm_conversaciones'] },
      { usuario: 'otros', nombre: 'Otro Usuario', permisos: ['crm'] },
    ]),
  });
  setDb();
});

afterEach(() => {
  __setCrmDbForTests(null);
});

describe('POST /api/crm/conversaciones/[id]/escalar (E3·T3)', () => {
  it('200 happy: target asignable → {estado, asignadaA: usuarioId}', async () => {
    mocks.ejecutarMock.mockResolvedValueOnce({ estado: 'TOMADA_HUMANO', asignadaA: 'mlopez' });

    const response = await POST(jsonPost('5', { usuarioId: 'mlopez' }), routeContext('5'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, estado: 'TOMADA_HUMANO', asignadaA: 'mlopez' });
    expect(mocks.ejecutarMock).toHaveBeenCalledWith({ conversacionId: 5, usuarioId: 'mlopez' });
  });

  it('target sin permiso crm_conversaciones → 400 VALIDATION_ERROR, el use case NO corre', async () => {
    const response = await POST(jsonPost('5', { usuarioId: 'otros' }), routeContext('5'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
    expect(mocks.ejecutarMock).not.toHaveBeenCalled();
  });

  it('target desconocido → 400 VALIDATION_ERROR', async () => {
    const response = await POST(jsonPost('5', { usuarioId: 'fantasma' }), routeContext('5'));

    expect(response.status).toBe(400);
    expect(mocks.ejecutarMock).not.toHaveBeenCalled();
  });

  it('body sin usuarioId (o no-string) → 400', async () => {
    expect((await POST(jsonPost('5', {}), routeContext('5'))).status).toBe(400);
    expect((await POST(jsonPost('5', { usuarioId: 42 }), routeContext('5'))).status).toBe(400);
    expect((await POST(jsonPost('5', 'x{'), routeContext('5'))).status).toBe(400);
    expect(mocks.ejecutarMock).not.toHaveBeenCalled();
  });

  it('estado inválido → 409; conversación inexistente → 404; id inválido → 400', async () => {
    mocks.ejecutarMock.mockRejectedValueOnce(new ConflictError('no se puede escalar'));
    expect((await POST(jsonPost('5', { usuarioId: 'mlopez' }), routeContext('5'))).status).toBe(409);

    mocks.ejecutarMock.mockRejectedValueOnce(new NotFoundError('Conversación no encontrada'));
    expect((await POST(jsonPost('99', { usuarioId: 'mlopez' }), routeContext('99'))).status).toBe(404);

    expect((await POST(jsonPost('0', { usuarioId: 'mlopez' }), routeContext('0'))).status).toBe(400);
  });

  it('sin sesión → 401; sin permiso → 403', async () => {
    mocks.getSessionMock.mockResolvedValueOnce(null);
    expect((await POST(jsonPost('5', { usuarioId: 'mlopez' }), routeContext('5'))).status).toBe(401);

    mocks.getSessionMock.mockResolvedValueOnce({ ...sessionBase, permisos: ['crm'] });
    expect((await POST(jsonPost('5', { usuarioId: 'mlopez' }), routeContext('5'))).status).toBe(403);
    expect(mocks.ejecutarMock).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Route contract for POST /api/crm/conversaciones/[id]/devolver
 * (E3·T3) — hand the conversation back to la Guía. Pinned: 200
 * {estado: 'ACTIVA_IA', reencolada}, typed error mapping (estado
 * inválido → 409, conversación → 404). No identity resolution: the
 * devolución records no actor (there is no asignaciones audit for
 * conversations — the task deliberately omits one). Use case mocked
 * at the module boundary (simular precedent).
 */

const mocks = vi.hoisted(() => ({
  ejecutarMock: vi.fn(),
  getSessionMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ getSession: mocks.getSessionMock }));

vi.mock('@/features/crm/application/devolverConversacion', () => ({
  DevolverConversacionUseCase: class DevolverConversacionUseCaseFake {
    readonly ejecutar = mocks.ejecutarMock;
  },
}));

import { POST } from '../devolver/route';
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
    mensajes: {} as never,
    tareas: {} as never,
  } satisfies CrmDb);
}

function routeContext(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function jsonPost(id: string): Parameters<typeof POST>[0] {
  return new Request(`http://localhost/api/crm/conversaciones/${id}/devolver`, {
    method: 'POST',
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

describe('POST /api/crm/conversaciones/[id]/devolver (E3·T3)', () => {
  it('200 happy: {estado: ACTIVA_IA, reencolada}', async () => {
    mocks.ejecutarMock.mockResolvedValueOnce({ estado: 'ACTIVA_IA', reencolada: true });

    const response = await POST(jsonPost('5'), routeContext('5'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, estado: 'ACTIVA_IA', reencolada: true });
    expect(mocks.ejecutarMock).toHaveBeenCalledWith({ conversacionId: 5 });
  });

  it('estado inválido → 409 CONFLICT_ERROR; conversación inexistente → 404', async () => {
    mocks.ejecutarMock.mockRejectedValueOnce(new ConflictError('no se puede devolver'));
    expect((await POST(jsonPost('5'), routeContext('5'))).status).toBe(409);

    mocks.ejecutarMock.mockRejectedValueOnce(new NotFoundError('Conversación no encontrada'));
    expect((await POST(jsonPost('99'), routeContext('99'))).status).toBe(404);
  });

  it('sin sesión → 401; sin permiso → 403; id inválido → 400', async () => {
    mocks.getSessionMock.mockResolvedValueOnce(null);
    expect((await POST(jsonPost('5'), routeContext('5'))).status).toBe(401);

    mocks.getSessionMock.mockResolvedValueOnce({ ...sessionBase, permisos: ['crm'] });
    expect((await POST(jsonPost('5'), routeContext('5'))).status).toBe(403);

    expect((await POST(jsonPost('1.5'), routeContext('1.5'))).status).toBe(400);
    expect(mocks.ejecutarMock).not.toHaveBeenCalled();
  });
});

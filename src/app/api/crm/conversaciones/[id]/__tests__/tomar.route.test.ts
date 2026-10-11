import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Route contract for POST /api/crm/conversaciones/[id]/tomar (E3·T3) —
 * the operator takes over the conversation. Pinned: the canonical
 * sub → login identity resolution (empresas asignar precedent —
 * getUsuarioDb().getById(sub), 401 when the user row is gone), the
 * use case receives {id: login, nombre: display}, and the typed
 * error mapping (ya tomada / estado inválido → 409, conversación →
 * 404). Use case mocked at the module boundary (simular precedent).
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

vi.mock('@/features/crm/application/tomarConversacion', () => ({
  TomarConversacionUseCase: class TomarConversacionUseCaseFake {
    readonly ejecutar = mocks.ejecutarMock;
  },
}));

import { POST } from '../tomar/route';
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

function jsonPost(id: string): Parameters<typeof POST>[0] {
  return new Request(`http://localhost/api/crm/conversaciones/${id}/tomar`, {
    method: 'POST',
  }) as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionMock.mockResolvedValue({ ...sessionBase, permisos: ['crm_conversaciones'] });
  mocks.getUsuarioDbMock.mockResolvedValue({
    getById: vi.fn().mockResolvedValue({ usuario: 'juana', nombre: 'Juana Perez' }),
  });
  setDb();
});

afterEach(() => {
  __setCrmDbForTests(null);
});

describe('POST /api/crm/conversaciones/[id]/tomar (E3·T3)', () => {
  it('200 happy: resuelve sub→login y pasa {id: login, nombre} al use case', async () => {
    mocks.ejecutarMock.mockResolvedValueOnce({ estado: 'TOMADA_HUMANO', asignadaA: 'juana' });

    const response = await POST(jsonPost('5'), routeContext('5'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, estado: 'TOMADA_HUMANO', asignadaA: 'juana' });
    expect(mocks.ejecutarMock).toHaveBeenCalledWith({
      conversacionId: 5,
      usuario: { id: 'juana', nombre: 'Juana Perez' },
    });
  });

  it('sesión cuyo usuario ya no existe → 401 (la identidad no se puede establecer)', async () => {
    mocks.getUsuarioDbMock.mockResolvedValueOnce({
      getById: vi.fn().mockResolvedValue(null),
    });

    const response = await POST(jsonPost('5'), routeContext('5'));

    expect(response.status).toBe(401);
    expect(mocks.ejecutarMock).not.toHaveBeenCalled();
  });

  it('ya tomada → 409 CONFLICT_ERROR; conversación inexistente → 404', async () => {
    mocks.ejecutarMock.mockRejectedValueOnce(new ConflictError('La conversación ya está tomada'));
    expect((await POST(jsonPost('5'), routeContext('5'))).status).toBe(409);

    mocks.ejecutarMock.mockRejectedValueOnce(new NotFoundError('Conversación no encontrada'));
    expect((await POST(jsonPost('99'), routeContext('99'))).status).toBe(404);
  });

  it('sin sesión → 401; sin permiso → 403; id inválido → 400', async () => {
    mocks.getSessionMock.mockResolvedValueOnce(null);
    expect((await POST(jsonPost('5'), routeContext('5'))).status).toBe(401);

    mocks.getSessionMock.mockResolvedValueOnce({ ...sessionBase, permisos: ['crm'] });
    expect((await POST(jsonPost('5'), routeContext('5'))).status).toBe(403);

    expect((await POST(jsonPost('-1'), routeContext('-1'))).status).toBe(400);
    expect(mocks.ejecutarMock).not.toHaveBeenCalled();
  });
});

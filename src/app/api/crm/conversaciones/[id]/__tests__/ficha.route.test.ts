import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Route contract for GET/POST /api/crm/conversaciones/[id]/ficha
 * (E3·T4) — the living contact card. Pinned:
 * - GET 200 {success, conversacionId, contacto, empresa, datos};
 *   404 unknown conversación.
 * - POST {campo, valor} → 200 refreshed ficha; 400 invalid
 *   campo/valor (shape at the route, semantics via ValidationError);
 *   404 conversación; 409 typed conflicts (campo without its key).
 * - Session + crm_conversaciones permiso, strict _id parse (memorias
 *   route precedent). Use cases mocked at the module boundary.
 */

const mocks = vi.hoisted(() => ({
  obtenerMock: vi.fn(),
  confirmarMock: vi.fn(),
  getSessionMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ getSession: mocks.getSessionMock }));

vi.mock('@/features/crm/application/obtenerFichaConversacion', () => ({
  ObtenerFichaConversacionUseCase: class ObtenerFichaConversacionUseCaseFake {
    readonly ejecutar = mocks.obtenerMock;
  },
}));

vi.mock('@/features/crm/application/confirmarDatoFicha', () => ({
  ConfirmarDatoFichaUseCase: class ConfirmarDatoFichaUseCaseFake {
    readonly ejecutar = mocks.confirmarMock;
  },
}));

import { GET, POST } from '../ficha/route';
import { __setCrmDbForTests, type CrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { ConflictError, NotFoundError, ValidationError } from '@/features/crm/domain/errors';

const sessionBase = { sub: 'u-1', nombre: 'Juana Perez', area: 'ventas' };

function setDb(conversaciones?: unknown): void {
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
    // undefined = container sin el adaptador conversaciones (→ 503).
    conversaciones: conversaciones as never,
  } satisfies CrmDb);
}

function routeContext(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function jsonGet(id: string): Parameters<typeof GET>[0] {
  return new Request(`http://localhost/api/crm/conversaciones/${id}/ficha`) as Parameters<
    typeof GET
  >[0];
}

function jsonPost(id: string, body: unknown): Parameters<typeof POST>[0] {
  return new Request(`http://localhost/api/crm/conversaciones/${id}/ficha`, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }) as Parameters<typeof POST>[0];
}

const FICHA = {
  conversacionId: 1,
  contacto: {
    id: 42,
    nombre: 'Ana Giménez',
    telefono: '+595981234567',
    cargo: 'Gerente de Compras',
  },
  empresa: { id: 7, razonSocial: 'Constructora X S.A.', cantidadTrabajadores: 80 },
  datos: {
    cargo: { valor: 'Gerente de Compras', origen: 'canonico', confirmado: true },
    trabajadores: { valor: '80', origen: 'canonico', confirmado: true },
    sedes: { valor: '3', origen: 'IA', confirmado: false },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionMock.mockResolvedValue({ ...sessionBase, permisos: ['crm_conversaciones'] });
  setDb({});
});

afterEach(() => {
  __setCrmDbForTests(null);
});

describe('GET /api/crm/conversaciones/[id]/ficha (E3·T4)', () => {
  it('200 happy: {success, conversacionId, contacto, empresa, datos}', async () => {
    mocks.obtenerMock.mockResolvedValueOnce(FICHA);

    const response = await GET(jsonGet('1'), routeContext('1'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, ...FICHA });
    expect(mocks.obtenerMock).toHaveBeenCalledWith(1);
  });

  it('conversación inexistente → 404 NOT_FOUND_ERROR', async () => {
    mocks.obtenerMock.mockRejectedValueOnce(new NotFoundError('Conversación no encontrada'));

    const response = await GET(jsonGet('99'), routeContext('99'));

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toMatchObject({ success: false, code: 'NOT_FOUND_ERROR' });
  });

  it('sin sesión → 401; sin permiso → 403; id inválido → 400', async () => {
    mocks.getSessionMock.mockResolvedValueOnce(null);
    expect((await GET(jsonGet('1'), routeContext('1'))).status).toBe(401);

    mocks.getSessionMock.mockResolvedValueOnce({ ...sessionBase, permisos: [] });
    expect((await GET(jsonGet('1'), routeContext('1'))).status).toBe(403);

    expect((await GET(jsonGet('x'), routeContext('x'))).status).toBe(400);
    expect(mocks.obtenerMock).not.toHaveBeenCalled();
  });

  it('CRM no configurado (sin adaptador conversaciones) → 503', async () => {
    setDb(undefined);

    const response = await GET(jsonGet('1'), routeContext('1'));

    expect(response.status).toBe(503);
  });
});

describe('POST /api/crm/conversaciones/[id]/ficha (E3·T4)', () => {
  it('200 ficha refrescada; el use case recibe {conversacionId, campo, valor, usuario}', async () => {
    mocks.confirmarMock.mockResolvedValueOnce(FICHA);

    const response = await POST(
      jsonPost('1', { campo: 'sedes', valor: '4' }),
      routeContext('1'),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, ...FICHA });
    expect(mocks.confirmarMock).toHaveBeenCalledWith({
      conversacionId: 1,
      campo: 'sedes',
      valor: '4',
      usuario: 'u-1',
    });
  });

  it('body inválido: campo fuera del union / valor no string / JSON roto → 400', async () => {
    expect(
      (await POST(jsonPost('1', { campo: 'patente', valor: 'x' }), routeContext('1'))).status,
    ).toBe(400);
    expect(
      (await POST(jsonPost('1', { campo: 'cargo', valor: 42 }), routeContext('1'))).status,
    ).toBe(400);
    expect((await POST(jsonPost('1', { campo: 'cargo' }), routeContext('1'))).status).toBe(400);
    expect((await POST(jsonPost('1', 'no-json'), routeContext('1'))).status).toBe(400);
    expect(mocks.confirmarMock).not.toHaveBeenCalled();
  });

  it('errores tipados del use case: 404 NotFound / 409 Conflict / 400 Validation', async () => {
    mocks.confirmarMock.mockRejectedValueOnce(new NotFoundError('Conversación no encontrada'));
    expect(
      (await POST(jsonPost('1', { campo: 'cargo', valor: 'Jefe' }), routeContext('1'))).status,
    ).toBe(404);

    mocks.confirmarMock.mockRejectedValueOnce(
      new ConflictError('La conversación no tiene contacto vinculado'),
    );
    expect(
      (await POST(jsonPost('1', { campo: 'cargo', valor: 'Jefe' }), routeContext('1'))).status,
    ).toBe(409);

    mocks.confirmarMock.mockRejectedValueOnce(
      new ValidationError('"trabajadores" debe ser un número entero mayor o igual a 1'),
    );
    const response = await POST(
      jsonPost('1', { campo: 'trabajadores', valor: '12.5' }),
      routeContext('1'),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
  });

  it('sin sesión → 401; id inválido → 400', async () => {
    mocks.getSessionMock.mockResolvedValueOnce(null);
    expect(
      (await POST(jsonPost('1', { campo: 'cargo', valor: 'Jefe' }), routeContext('1'))).status,
    ).toBe(401);
    expect(
      (await POST(jsonPost('x', { campo: 'cargo', valor: 'Jefe' }), routeContext('x'))).status,
    ).toBe(400);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Route contract for GET/POST /api/crm/conversaciones/[id]/memorias
 * (E3·T3) — the operator memory panel. Pinned:
 * - GET 200 {success, memorias, empresaId}; 404 unknown conversación.
 * - POST {observacionId, accion: 'pinear'|'eliminar'} → 200 {ok: true};
 *   ownership violation (MemoriaAjenaError, NotFoundError subclass) →
 *   404; invalid body → 400.
 * - ErrorMemoriaCrm mapping: MEMORIA_NO_CONFIGURADA → 503, the rest
 *   (timeout/red/respuesta) → 502 — the memory upstream failing is
 *   never a 200-with-empty-list lie.
 * Use cases mocked at the module boundary (simular precedent).
 */

const mocks = vi.hoisted(() => ({
  listarMock: vi.fn(),
  gestionarMock: vi.fn(),
  guardarMock: vi.fn(),
  getSessionMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ getSession: mocks.getSessionMock }));

vi.mock('@/features/crm/application/listarMemoriasConversacion', () => ({
  ListarMemoriasConversacionUseCase: class ListarMemoriasConversacionUseCaseFake {
    readonly ejecutar = mocks.listarMock;
  },
  GestionarMemoriaConversacionUseCase: class GestionarMemoriaConversacionUseCaseFake {
    readonly ejecutar = mocks.gestionarMock;
  },
  GuardarMemoriaConversacionUseCase: class GuardarMemoriaConversacionUseCaseFake {
    readonly ejecutar = mocks.guardarMock;
  },
}));

import { GET, POST } from '../memorias/route';
import { __setCrmDbForTests, type CrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { NotFoundError, ValidationError } from '@/features/crm/domain/errors';
import { ErrorMemoriaCrm } from '@/features/crm/infrastructure/engram/memoriaEngramHttp';

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

function jsonGet(id: string): Parameters<typeof GET>[0] {
  return new Request(`http://localhost/api/crm/conversaciones/${id}/memorias`) as Parameters<
    typeof GET
  >[0];
}

function jsonPost(id: string, body: unknown): Parameters<typeof POST>[0] {
  return new Request(`http://localhost/api/crm/conversaciones/${id}/memorias`, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }) as Parameters<typeof POST>[0];
}

const MEMORIAS = {
  empresaId: 7,
  memorias: [
    {
      id: 101,
      nivel: 'chat',
      tipo: 'indicacion_humana',
      titulo: 'Indicación humana',
      contenido: 'Responder solo por la tarde',
      pineada: true,
      creadoEn: '2026-06-10T10:00:00.000Z',
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionMock.mockResolvedValue({ ...sessionBase, permisos: ['crm_conversaciones'] });
  setDb();
});

afterEach(() => {
  __setCrmDbForTests(null);
});

describe('GET /api/crm/conversaciones/[id]/memorias (E3·T3)', () => {
  it('200 happy: {success, memorias, empresaId}', async () => {
    mocks.listarMock.mockResolvedValueOnce(MEMORIAS);

    const response = await GET(jsonGet('1'), routeContext('1'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, ...MEMORIAS });
    expect(mocks.listarMock).toHaveBeenCalledWith(1);
  });

  it('conversación inexistente → 404 NOT_FOUND_ERROR', async () => {
    mocks.listarMock.mockRejectedValueOnce(new NotFoundError('Conversación no encontrada'));

    const response = await GET(jsonGet('99'), routeContext('99'));

    expect(response.status).toBe(404);
  });

  it('memoria no configurada (producción sin Engram) → 503; fallo de Engram → 502', async () => {
    mocks.listarMock.mockRejectedValueOnce(
      new ErrorMemoriaCrm('MEMORIA_NO_CONFIGURADA', 'sin ENGRAM_CRM_URL'),
    );
    expect((await GET(jsonGet('1'), routeContext('1'))).status).toBe(503);

    mocks.listarMock.mockRejectedValueOnce(
      new ErrorMemoriaCrm('MEMORIA_TIMEOUT', 'Engram no respondió'),
    );
    const response = await GET(jsonGet('1'), routeContext('1'));
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toMatchObject({ success: false, code: 'MEMORIA_ERROR' });
  });

  it('sin sesión → 401; id inválido → 400', async () => {
    mocks.getSessionMock.mockResolvedValueOnce(null);
    expect((await GET(jsonGet('1'), routeContext('1'))).status).toBe(401);
    expect((await GET(jsonGet('x'), routeContext('x'))).status).toBe(400);
  });
});

describe('POST /api/crm/conversaciones/[id]/memorias (E3·T3)', () => {
  it('200 {ok: true} para pinear y para eliminar', async () => {
    mocks.gestionarMock.mockResolvedValueOnce({ ok: true });

    const pinear = await POST(
      jsonPost('1', { observacionId: 101, accion: 'pinear' }),
      routeContext('1'),
    );
    expect(pinear.status).toBe(200);
    expect(await pinear.json()).toEqual({ ok: true });

    mocks.gestionarMock.mockResolvedValueOnce({ ok: true });
    const eliminar = await POST(
      jsonPost('1', { observacionId: 101, accion: 'eliminar' }),
      routeContext('1'),
    );
    expect(eliminar.status).toBe(200);
    expect(await eliminar.json()).toEqual({ ok: true });
    expect(mocks.gestionarMock).toHaveBeenCalledWith({
      conversacionId: 1,
      observacionId: 101,
      accion: 'eliminar',
    });
  });

  it('observación ajena (ownership) → 404 NOT_FOUND_ERROR', async () => {
    mocks.gestionarMock.mockRejectedValueOnce(
      new NotFoundError('La memoria no pertenece a esta conversación'),
    );

    const response = await POST(
      jsonPost('1', { observacionId: 999, accion: 'pinear' }),
      routeContext('1'),
    );

    expect(response.status).toBe(404);
  });

  it('body inválido (accion desconocida / observacionId no entero) → 400', async () => {
    expect(
      (await POST(jsonPost('1', { observacionId: 1, accion: 'editar' }), routeContext('1'))).status,
    ).toBe(400);
    expect(
      (await POST(jsonPost('1', { observacionId: 'x', accion: 'pinear' }), routeContext('1')))
        .status,
    ).toBe(400);
    expect((await POST(jsonPost('1', {}), routeContext('1'))).status).toBe(400);
    expect(mocks.gestionarMock).not.toHaveBeenCalled();
  });

  it('ErrorMemoriaCrm → 502 (upstream Engram)', async () => {
    mocks.gestionarMock.mockRejectedValueOnce(
      new ErrorMemoriaCrm('MEMORIA_ERROR', 'Engram respondió HTTP 500'),
    );

    const response = await POST(
      jsonPost('1', { observacionId: 101, accion: 'eliminar' }),
      routeContext('1'),
    );

    expect(response.status).toBe(502);
  });
});

describe('POST /api/crm/conversaciones/[id]/memorias — accion guardar (E3·T5)', () => {
  it('200 {ok: true, id} para una memoria manual de nivel chat', async () => {
    mocks.guardarMock.mockResolvedValueOnce({ id: 555, estado: 'comprometido' });

    const response = await POST(
      jsonPost('1', {
        accion: 'guardar',
        nivel: 'chat',
        tipo: 'indicacion_humana',
        titulo: 'Indicación humana',
        contenido: 'Crédito fiscal 30 días: SÍ',
      }),
      routeContext('1'),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, id: 555 });
    expect(mocks.guardarMock).toHaveBeenCalledWith({
      conversacionId: 1,
      nivel: 'chat',
      tipo: 'indicacion_humana',
      titulo: 'Indicación humana',
      contenido: 'Crédito fiscal 30 días: SÍ',
    });
  });

  it('nivel empresa también cruza (misma forma, nivel distinto)', async () => {
    mocks.guardarMock.mockResolvedValueOnce({ id: 556, estado: 'guardado' });

    const response = await POST(
      jsonPost('1', {
        accion: 'guardar',
        nivel: 'empresa',
        tipo: 'acuerdo',
        titulo: 'Acuerdo de firmas',
        contenido: 'Cronograma mensual',
      }),
      routeContext('1'),
    );

    expect(response.status).toBe(200);
    expect(mocks.guardarMock).toHaveBeenCalledWith(
      expect.objectContaining({ nivel: 'empresa', tipo: 'acuerdo' }),
    );
  });

  it('body inválido (nivel/tipo/titulo/contenido fuera de contrato) → 400', async () => {
    const casos = [
      { accion: 'guardar', nivel: 'otro', tipo: 'acuerdo', titulo: 'T', contenido: 'C' },
      { accion: 'guardar', nivel: 'chat', tipo: 'inventado', titulo: 'T', contenido: 'C' },
      { accion: 'guardar', nivel: 'chat', tipo: 'acuerdo', titulo: '  ', contenido: 'C' },
      { accion: 'guardar', nivel: 'chat', tipo: 'acuerdo', titulo: 'T', contenido: '' },
      { accion: 'guardar', nivel: 'chat' },
    ];
    for (const cuerpo of casos) {
      expect((await POST(jsonPost('1', cuerpo), routeContext('1'))).status).toBe(400);
    }
    expect(mocks.guardarMock).not.toHaveBeenCalled();
  });

  it('conversación sin empresa (MemoriaSinEmpresaError, ValidationError) → 400', async () => {
    mocks.guardarMock.mockRejectedValueOnce(
      new ValidationError('La conversación no tiene empresa vinculada'),
    );

    const response = await POST(
      jsonPost('1', {
        accion: 'guardar',
        nivel: 'chat',
        tipo: 'acuerdo',
        titulo: 'T',
        contenido: 'C',
      }),
      routeContext('1'),
    );

    expect(response.status).toBe(400);
  });

  it('ErrorMemoriaCrm → 502 (upstream Engram)', async () => {
    mocks.guardarMock.mockRejectedValueOnce(
      new ErrorMemoriaCrm('MEMORIA_ERROR', 'Engram respondió HTTP 500'),
    );

    const response = await POST(
      jsonPost('1', {
        accion: 'guardar',
        nivel: 'chat',
        tipo: 'acuerdo',
        titulo: 'T',
        contenido: 'C',
      }),
      routeContext('1'),
    );

    expect(response.status).toBe(502);
  });
});

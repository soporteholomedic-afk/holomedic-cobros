import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mock auth session (pr4 CRM route precedent) ----

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
}));

// ---- Import under test (after mocks) ----

import { POST } from '../route';
import { __setCrmDbForTests, type CrmDb } from '@/features/crm/infrastructure/getCrmDb';
import type { CrmImportadorPort } from '@/features/crm/domain/ports';
import type { ErrorFilaImport } from '@/features/crm/domain/importar/validarImportacion';

// ---- Fixtures ----

/**
 * A raw sheet row keyed by the template's own headers (asterisks and
 * all) — exactly what the wizard's client-side parser posts. Building
 * fixtures this way exercises `mapearFilasImportCrm` header
 * normalization through the route (G3 anti-drift end to end).
 */
function filaValida(sobres: Record<string, string> = {}): Record<string, string> {
  return {
    'Empresa*': 'Constructora X',
    RUC: '900123456',
    Tipo: 'Cliente',
    Origen: 'Inbound',
    Encargado: 'Ana',
    'Correos*': 'ana@x.com',
    ...sobres,
  };
}

function makeFakeImportador(overrides: Partial<CrmImportadorPort> = {}): CrmImportadorPort {
  return {
    ejecutarGrupo: vi.fn().mockResolvedValue({
      modo: 'crear',
      contactosCreados: 1,
      contactosActualizados: 0,
      advertencias: [],
    }),
    registrarImportacion: vi.fn().mockResolvedValue(99),
    ...overrides,
  };
}

function setDb(importador: CrmImportadorPort): void {
  __setCrmDbForTests({
    pool: {} as never,
    empresas: { crear: vi.fn(), listar: vi.fn(), obtenerPorId: vi.fn(), actualizar: vi.fn() },
    importador,
  } satisfies CrmDb);
}

const sessionBase = { sub: 'u-1', nombre: 'Juana Perez', area: 'ventas' };

function jsonPost(body: unknown): Request {
  return new Request('http://localhost/api/crm/import/validar', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function postValido(importador: CrmImportadorPort): Promise<Response> {
  setDb(importador);
  return POST(
    jsonPost({ archivoNombre: 'empresas.xlsx', filas: [filaValida()] }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockReset();
  mockGetSession.mockResolvedValue({ ...sessionBase, permisos: ['crm', 'crm_admin'] });
});

afterEach(() => {
  __setCrmDbForTests(null);
});

// ---- Auth matrix ----

describe('POST /api/crm/import/validar — auth', () => {
  it('returns 401 UNAUTHORIZED without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    setDb(makeFakeImportador());

    const response = await POST(jsonPost({ archivoNombre: 'a.xlsx', filas: [] }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 FORBIDDEN with unrelated permisos', async () => {
    mockGetSession.mockResolvedValue({ ...sessionBase, permisos: ['cobranza'] });
    setDb(makeFakeImportador());

    const response = await POST(jsonPost({ archivoNombre: 'a.xlsx', filas: [] }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe('FORBIDDEN');
  });

  it('returns 403 FORBIDDEN with plain crm (crm_admin required in-route)', async () => {
    // The proxy prefix already gates /api/crm/import to crm_admin; the
    // route re-checks IN-ROUTE (design D2, pr4/pr7 precedent).
    mockGetSession.mockResolvedValue({ ...sessionBase, permisos: ['crm'] });
    setDb(makeFakeImportador());

    const response = await POST(jsonPost({ archivoNombre: 'a.xlsx', filas: [] }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe('FORBIDDEN');
  });
});

// ---- Payload guards ----

describe('POST /api/crm/import/validar — payload guards', () => {
  it('returns 400 VALIDATION_ERROR for malformed JSON', async () => {
    setDb(makeFakeImportador());

    const response = await POST(jsonPost('{not json'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when filas is not an array', async () => {
    setDb(makeFakeImportador());

    const response = await POST(jsonPost({ archivoNombre: 'a.xlsx', filas: 'nope' }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when archivoNombre is missing or a row is not an object', async () => {
    setDb(makeFakeImportador());

    const sinNombre = await POST(jsonPost({ filas: [] }));
    expect(sinNombre.status).toBe(400);

    const filaNoObjeto = await POST(
      jsonPost({ archivoNombre: 'a.xlsx', filas: ['texto suelto'] }),
    );
    expect(filaNoObjeto.status).toBe(400);
    expect((await filaNoObjeto.json()).code).toBe('VALIDATION_ERROR');
  });
});

// ---- Over-cap guard ----

describe('POST /api/crm/import/validar — row cap', () => {
  it('returns 400 with the Spanish cap message for over-2000 files', async () => {
    const importador = makeFakeImportador();
    setDb(importador);
    const demasiadas = Array.from({ length: 2001 }, () => filaValida());

    const response = await POST(jsonPost({ archivoNombre: 'a.xlsx', filas: demasiadas }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toContain('2000');
    // The cap trips BEFORE any import machinery is touched.
    expect(importador.ejecutarGrupo).not.toHaveBeenCalled();
    expect(importador.registrarImportacion).not.toHaveBeenCalled();
  });
});

// ---- Preview behavior (spec G2) ----

describe('POST /api/crm/import/validar — preview', () => {
  it('writes NOTHING: the importador is never touched on a successful preview', async () => {
    // G2 preview-before-commit: validar is a pure read of the payload —
    // no group execution, no job record. The importador spies stay
    // untouched even though a container is injected.
    const importador = makeFakeImportador();

    const response = await postValido(importador);

    expect(response.status).toBe(200);
    expect(importador.ejecutarGrupo).not.toHaveBeenCalled();
    expect(importador.registrarImportacion).not.toHaveBeenCalled();
  });

  it('returns 200 with counts and grouped empresas for valid header-keyed rows', async () => {
    // The container is present but the route is DB-free — asserted by
    // the writes-nothing test above.
    setDb(makeFakeImportador());

    const response = await POST(
      jsonPost({
        archivoNombre: 'empresas.xlsx',
        filas: [
          filaValida(),
          filaValida({ Encargado: 'Luis', 'Correos*': 'luis@x.com' }),
        ],
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.totalFilas).toBe(2);
    expect(body.filasValidas).toBe(2);
    expect(body.errores).toEqual([]);
    expect(body.empresas).toEqual([
      {
        ruc: '900123456',
        razonSocial: 'Constructora X',
        tipo: 'Cliente',
        contactos: ['Ana', 'Luis'],
      },
    ]);
  });

  it('reports per-row Spanish errors without blocking valid rows', async () => {
    setDb(makeFakeImportador());

    const response = await POST(
      jsonPost({
        archivoNombre: 'empresas.xlsx',
        filas: [
          filaValida(), // fila 2 — valida
          filaValida({ RUC: '900123456', Encargado: 'Luis', 'Correos*': 'luis@x.com', Tipo: 'Lead' }), // fila 3
          filaValida({ RUC: 'abc', Encargado: 'Marta', 'Correos*': 'marta@x.com' }), // fila 4
        ],
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.totalFilas).toBe(3);
    expect(body.filasValidas).toBe(1);

    const errores: ErrorFilaImport[] = body.errores;
    expect(errores).toHaveLength(2);
    expect(errores[0]).toMatchObject({
      fila: 3,
      columna: 'Tipo',
      mensaje: '"Tipo" debe ser "Cliente" o "Prospecto"',
    });
    expect(errores[1]?.fila).toBe(4);
    expect(errores[1]?.columna).toBe('RUC');
    expect(errores[1]?.mensaje).toContain('8 y 11 dígitos');

    // Only the valid row survives into the preview groups.
    expect(body.empresas).toEqual([
      {
        ruc: '900123456',
        razonSocial: 'Constructora X',
        tipo: 'Cliente',
        contactos: ['Ana'],
      },
    ]);
  });

  it('exposes repeated-empresa-field conflicts as row errors, group excluded', async () => {
    setDb(makeFakeImportador());

    const response = await POST(
      jsonPost({
        archivoNombre: 'empresas.xlsx',
        filas: [
          // Rows 2/5 share the RUC but disagree on Tipo → both reported,
          // group skipped; the unrelated RUC group stays intact.
          filaValida({ Tipo: 'Cliente' }),
          filaValida({ RUC: '876543210', Empresa: 'Otra S.A.', Encargado: 'Marta', 'Correos*': 'marta@otra.com' }),
          filaValida({ RUC: '900-123456', Tipo: 'Prospecto', Encargado: 'Luis', 'Correos*': 'luis@x.com' }),
        ],
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.filasValidas).toBe(1);
    const conflictos = (body.errores as ErrorFilaImport[]).filter((e) => e.columna === 'Tipo');
    expect(conflictos).toHaveLength(2);
    expect(conflictos[0]?.fila).toBe(2);
    expect(conflictos[1]?.fila).toBe(4);
    expect(conflictos[0]?.mensaje).toContain('valores distintos para el mismo RUC');
    expect(body.empresas).toEqual([
      expect.objectContaining({ ruc: '876543210', razonSocial: 'Otra S.A.' }),
    ]);
  });
});

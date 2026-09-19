import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mock auth session (pr4 CRM route precedent) ----

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
}));

// ---- Import under test (after mocks) ----

import { POST } from '../route';
import { __setCrmDbForTests, type CrmDb } from '@/features/crm/infrastructure/getCrmDb';
import type { CrmImportadorPort, ResultadoGrupoImport } from '@/features/crm/domain/ports';
import type { ErrorFilaImport } from '@/features/crm/domain/importar/validarImportacion';
import type { ResultadoEjecucionImportacion } from '@/features/crm/application/importar/ejecutarImportacion';

// ---- Fixtures ----

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

function resultadoGrupo(sobres: Partial<ResultadoGrupoImport> = {}): ResultadoGrupoImport {
  return { modo: 'crear', contactosCreados: 1, contactosActualizados: 0, advertencias: [], ...sobres };
}

function makeFakeImportador(overrides: Partial<CrmImportadorPort> = {}): CrmImportadorPort {
  return {
    ejecutarGrupo: vi.fn().mockResolvedValue(resultadoGrupo()),
    registrarImportacion: vi.fn().mockResolvedValue(77),
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
  return new Request('http://localhost/api/crm/import/confirmar', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
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

describe('POST /api/crm/import/confirmar — auth', () => {
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
    mockGetSession.mockResolvedValue({ ...sessionBase, permisos: ['crm'] });
    setDb(makeFakeImportador());

    const response = await POST(jsonPost({ archivoNombre: 'a.xlsx', filas: [] }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe('FORBIDDEN');
  });
});

// ---- Payload guards ----

describe('POST /api/crm/import/confirmar — payload guards', () => {
  it('returns 400 VALIDATION_ERROR for malformed JSON', async () => {
    setDb(makeFakeImportador());

    const response = await POST(jsonPost('{not json'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for a shape-invalid body', async () => {
    setDb(makeFakeImportador());

    const response = await POST(jsonPost({ archivoNombre: 42, filas: [] }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 over-cap BEFORE any write reaches the importador', async () => {
    const importador = makeFakeImportador();
    setDb(importador);
    const demasiadas = Array.from({ length: 2001 }, () => filaValida());

    const response = await POST(jsonPost({ archivoNombre: 'a.xlsx', filas: demasiadas }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain('2000');
    expect(importador.ejecutarGrupo).not.toHaveBeenCalled();
    expect(importador.registrarImportacion).not.toHaveBeenCalled();
  });
});

// ---- Execution (spec G2 upsert + job record) ----

describe('POST /api/crm/import/confirmar — execution', () => {
  it('executes the import and returns counters with the job id', async () => {
    const importador = makeFakeImportador({
      ejecutarGrupo: vi.fn().mockResolvedValue(resultadoGrupo({ contactosCreados: 2 })),
    });
    setDb(importador);

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

    const resultado: ResultadoEjecucionImportacion = body.resultado;
    expect(resultado.empresasCreadas).toBe(1);
    expect(resultado.empresasActualizadas).toBe(0);
    expect(resultado.contactosCreados).toBe(2);
    expect(resultado.importacionId).toBe(77);
    expect(resultado.errores).toEqual([]);
    expect(resultado.fallos).toEqual([]);
    expect(resultado.advertencias).toEqual([]);

    // The job row is written exactly once, audited to the session user.
    expect(importador.registrarImportacion).toHaveBeenCalledTimes(1);
    const registro = vi.mocked(importador.registrarImportacion).mock.calls[0]?.[0];
    expect(registro?.archivoNombre).toBe('empresas.xlsx');
    expect(registro?.ejecutadoPor).toBe('u-1');
    expect(typeof registro?.erroresJson).toBe('string');
  });

  it('re-validates EVERYTHING: invalid rows are excluded, only valid groups execute', async () => {
    const importador = makeFakeImportador();
    setDb(importador);

    const response = await POST(
      jsonPost({
        archivoNombre: 'empresas.xlsx',
        filas: [
          filaValida(), // fila 2 — válida
          filaValida({ RUC: '900123456', Encargado: 'Luis', 'Correos*': 'luis@x.com', Tipo: 'Lead' }), // fila 3
        ],
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    // The "Lead" row never reaches the executor.
    expect(importador.ejecutarGrupo).toHaveBeenCalledTimes(1);
    const grupo = vi.mocked(importador.ejecutarGrupo).mock.calls[0]?.[0];
    expect(grupo?.contactos.map((c) => c.nombre)).toEqual(['Ana']);

    const errores: ErrorFilaImport[] = body.resultado.errores;
    expect(errores).toEqual([
      { fila: 3, columna: 'Tipo', mensaje: '"Tipo" debe ser "Cliente" o "Prospecto"' },
    ]);
    expect(body.resultado.totalFilas).toBe(2);
    expect(body.resultado.filasValidas).toBe(1);
  });

  it('isolates per-group failures: fallos reported, job row still written', async () => {
    const importador = makeFakeImportador({
      ejecutarGrupo: vi
        .fn()
        .mockRejectedValueOnce(new Error('unique violation en correos'))
        .mockResolvedValueOnce(resultadoGrupo({ modo: 'actualizar', contactosActualizados: 1 })),
    });
    setDb(importador);

    const response = await POST(
      jsonPost({
        archivoNombre: 'empresas.xlsx',
        filas: [
          filaValida(),
          filaValida({ RUC: '876543210', Empresa: 'Otra S.A.', Encargado: 'Marta', 'Correos*': 'marta@otra.com' }),
        ],
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    const resultado: ResultadoEjecucionImportacion = body.resultado;
    // The surviving group's fake reports modo 'actualizar'.
    expect(resultado.empresasActualizadas).toBe(1);
    expect(resultado.empresasCreadas).toBe(0);
    expect(resultado.fallos).toHaveLength(1);
    expect(resultado.fallos[0]?.columna).toBe('RUC');
    expect(resultado.fallos[0]?.mensaje).toContain('Constructora X');
    expect(resultado.fallos[0]?.mensaje).toContain('unique violation');
    // The job record is ALWAYS written, even with failures.
    expect(importador.registrarImportacion).toHaveBeenCalledTimes(1);
  });

  it('surfaces non-blocking advertencias from the merge rule', async () => {
    const advertencia: ErrorFilaImport = {
      fila: 2,
      columna: 'Correos',
      mensaje: 'Posible contacto duplicado',
    };
    const importador = makeFakeImportador({
      ejecutarGrupo: vi.fn().mockResolvedValue(resultadoGrupo({ advertencias: [advertencia] })),
    });
    setDb(importador);

    const response = await POST(jsonPost({ archivoNombre: 'a.xlsx', filas: [filaValida()] }));
    const body = await response.json();

    expect(response.status).toBe(200);
    const resultado: ResultadoEjecucionImportacion = body.resultado;
    expect(resultado.advertencias).toEqual([advertencia]);
    // Advertencias ride erroresJson into the job record (pr6 pinned policy).
    const registro = vi.mocked(importador.registrarImportacion).mock.calls[0]?.[0];
    expect(registro?.erroresJson).toContain('Posible contacto duplicado');
  });

  it('maps an internal failure to 500 INTERNAL_ERROR with a generic Spanish message', async () => {
    mockGetSession.mockRejectedValue(new Error('session store unavailable'));
    setDb(makeFakeImportador());

    const response = await POST(jsonPost({ archivoNombre: 'a.xlsx', filas: [] }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body.error).not.toContain('session store');
  });
});

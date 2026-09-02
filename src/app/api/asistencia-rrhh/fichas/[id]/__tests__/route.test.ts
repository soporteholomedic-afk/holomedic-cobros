import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * POST /api/asistencia-rrhh/fichas/[id] — RRHH ficha completion
 * (REQ-F1-10, ADR-6). This namespace is the SESSION-authenticated side
 * of the feature (registered in RUTAS_PROTEGIDAS with permiso
 * `asistencia` since WU4): the route requires a user session and
 * attributes the dbo.auditoria row to session.sub. Wire body follows
 * the design contract {dni, apellidos, area, fecha_ingreso} (+opcionales
 * nombres/cargo); the answer is 200 {empleado}.
 */
import { POST } from '../route';
import {
  __setAsistenciaDbForTests,
  type AsistenciaDb,
} from '@/features/asistencia-rrhh/infrastructure/getAsistenciaDb';
import { FichaNoEncontradaError } from '@/features/asistencia-rrhh/infrastructure/sqlserver/SqlServerEmpleadoRepository';
import type { Empleado } from '@/features/asistencia-rrhh/domain/entities';

// ---- Mock auth session (usuarios route.test.ts precedent) ----

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
}));

// ---- Fixtures ----

const SESION_RRHH = {
  sub: 'b3f1c9a0-7d2e-4f6a-9b8c-1e0d5a7f3c21',
  nombre: 'RRHH User',
  area: 'RRHH',
  permisos: ['asistencia'],
};

function makeEmpleadoActivo(): Empleado {
  return {
    id: 5,
    userId: 'U001',
    dni: '12345678',
    nombres: 'Juan',
    apellidos: 'Pérez',
    area: 'Enfermería',
    cargo: null,
    fechaIngreso: '2026-08-01',
    fechaBaja: null,
    estado: 'ACTIVO',
    modoExtras: 'PAGAR',
    createdAt: new Date('2026-09-01T08:00:00'),
    updatedAt: new Date('2026-09-01T08:05:00'),
  };
}

function makeRequest(id: string, body: unknown): Request {
  return new Request(`http://localhost:3000/api/asistencia-rrhh/fichas/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeRequestRaw(id: string, raw: string): Request {
  return new Request(`http://localhost:3000/api/asistencia-rrhh/fichas/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw,
  });
}

const BODY_VALIDO = {
  dni: '12345678',
  apellidos: 'Pérez',
  area: 'Enfermería',
  fecha_ingreso: '2026-08-01',
};

describe('POST /api/asistencia-rrhh/fichas/[id]', () => {
  let completar: ReturnType<typeof vi.fn>;
  let reasignarEmpleado: ReturnType<typeof vi.fn>;
  let registrarAuditoria: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockGetSession.mockReset();
    mockGetSession.mockResolvedValue(SESION_RRHH);
    completar = vi.fn(async () => makeEmpleadoActivo());
    reasignarEmpleado = vi.fn(async () => 10);
    registrarAuditoria = vi.fn(async () => undefined);
  });

  afterEach(() => {
    __setAsistenciaDbForTests(null);
  });

  function injectDb(): void {
    __setAsistenciaDbForTests({
      empleados: {
        upsertPendientes: vi.fn(async () => 0),
        pendientes: vi.fn(async () => []),
        completar,
      },
      marcaciones: {
        insertarLote: vi.fn(async () => ({ insertados: 0, userIdsDesconocidos: [] })),
        listarDelDia: vi.fn(async () => []),
        buscar: vi.fn(async () => []),
        reasignarEmpleado,
      },
      auditoria: { registrar: registrarAuditoria },
    } as unknown as AsistenciaDb);
  }

  // ---- 401: session auth (ADR-6) ----

  it('401 sin sesión — nada se completa ni audita', async () => {
    mockGetSession.mockResolvedValue(null);
    injectDb();
    const res = await POST(makeRequest('5', BODY_VALIDO), {
      params: Promise.resolve({ id: '5' }),
    });
    expect(res.status).toBe(401);
    expect(completar).not.toHaveBeenCalled();
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });

  // ---- 400: contract validation ----

  it('400 sin DNI — completar NO es llamado', async () => {
    injectDb();
    const sinDni = {
      apellidos: BODY_VALIDO.apellidos,
      area: BODY_VALIDO.area,
      fecha_ingreso: BODY_VALIDO.fecha_ingreso,
    };
    const res = await POST(makeRequest('5', sinDni), {
      params: Promise.resolve({ id: '5' }),
    });
    expect(res.status).toBe(400);
    expect(completar).not.toHaveBeenCalled();
  });

  it('400 con id no numérico', async () => {
    injectDb();
    const res = await POST(makeRequest('abc', BODY_VALIDO), {
      params: Promise.resolve({ id: 'abc' }),
    });
    expect(res.status).toBe(400);
    expect(completar).not.toHaveBeenCalled();
  });

  it('400 con JSON malformado', async () => {
    injectDb();
    const res = await POST(makeRequestRaw('5', '{dni: no-json'), {
      params: Promise.resolve({ id: '5' }),
    });
    expect(res.status).toBe(400);
    expect(completar).not.toHaveBeenCalled();
  });

  it('400 con fecha_ingreso fuera del formato ISO', async () => {
    injectDb();
    const res = await POST(makeRequest('5', { ...BODY_VALIDO, fecha_ingreso: '01/08/2026' }), {
      params: Promise.resolve({ id: '5' }),
    });
    expect(res.status).toBe(400);
    expect(completar).not.toHaveBeenCalled();
  });

  // ---- 200: the happy path ----

  it('200 válido → {empleado} ACTIVO; completar recibe id numérico y los datos mapeados (fecha_ingreso→fechaIngreso)', async () => {
    injectDb();
    const res = await POST(makeRequest('5', BODY_VALIDO), {
      params: Promise.resolve({ id: '5' }),
    });
    expect(res.status).toBe(200);
    expect(completar).toHaveBeenCalledTimes(1);
    const [idLlamada, datosLlamada] = completar.mock.calls[0] as [number, Record<string, unknown>];
    expect(idLlamada).toBe(5);
    expect(datosLlamada).toMatchObject({
      dni: '12345678',
      apellidos: 'Pérez',
      area: 'Enfermería',
      fechaIngreso: '2026-08-01',
    });
    const json = (await res.json()) as { empleado: { estado: string; id: number } };
    expect(json.empleado.estado).toBe('ACTIVO');
    expect(json.empleado.id).toBe(5);
  });

  it('la auditoría se atribuye a session.sub (NVARCHAR(50)) y el backfill corre con el userId de la ficha', async () => {
    injectDb();
    await POST(makeRequest('5', BODY_VALIDO), { params: Promise.resolve({ id: '5' }) });
    expect(registrarAuditoria).toHaveBeenCalledTimes(1);
    const entrada = registrarAuditoria.mock.calls[0]?.[0] as {
      tabla: string;
      registroId: number;
      accion: string;
      usuarioId: string;
    };
    expect(entrada.tabla).toBe('empleados');
    expect(entrada.registroId).toBe(5);
    expect(entrada.accion).toBe('UPDATE');
    expect(entrada.usuarioId).toBe(SESION_RRHH.sub);
    expect(reasignarEmpleado).toHaveBeenCalledWith('U001', 5);
  });

  // ---- 404: unknown ficha ----

  it('404 cuando la ficha no existe (FichaNoEncontradaError)', async () => {
    completar.mockRejectedValue(new FichaNoEncontradaError(99));
    injectDb();
    const res = await POST(makeRequest('99', BODY_VALIDO), {
      params: Promise.resolve({ id: '99' }),
    });
    expect(res.status).toBe(404);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
});

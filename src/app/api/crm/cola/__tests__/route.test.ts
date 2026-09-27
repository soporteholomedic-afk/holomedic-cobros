import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mock auth session (detalle route.test.ts precedent) ----

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
}));

// ---- Mock auth identity resolution (cartera route precedent) ----
// session.sub 'u-1' resolves to login name 'jperez' — the currency
// the sinGestion scope compares against.

const mockGetUsuarioDb = vi.hoisted(() => vi.fn());
vi.mock('@/features/auth/infrastructure/getUsuarioDb', () => ({
  getUsuarioDb: mockGetUsuarioDb,
}));

// ---- Import under test (after mocks) ----

import { GET } from '../route';
import { __setCrmDbForTests, type CrmDb } from '@/features/crm/infrastructure/getCrmDb';
import type { CandidatoCola, CrmPipelineRepositoryPort } from '@/features/crm/domain/ports';

/**
 * Seam contract for GET /api/crm/cola (tasks pr13/WU3, design §4):
 * permiso `crm` (401 without a session, 403 without the permiso,
 * 401 when the session user no longer resolves), the use case result
 * rides the success body verbatim, and repository failures map to
 * 500 INTERNAL_ERROR. The four due sections are team-wide (spec G4)
 * while sinGestion (crm-ux redesign) is scoped to the session user's
 * resolved login name.
 */

function candidato(overrides: Partial<CandidatoCola>): CandidatoCola {
  return {
    empresaId: 1,
    flujo: 'OUTBOUND',
    etapa: 'CADENCIA',
    ciclo: 1,
    enviosCiclo: 1,
    fechaCicloInicio: '2026-05-25',
    fechaUltimoEnvio: '2026-05-25',
    descansoHasta: null,
    rechazadoHasta: null,
    motivoRechazo: null,
    updatedBy: null,
    updatedAt: '2026-05-25T00:00:00.000Z',
    razonSocial: 'Constructora X',
    responsable: null,
    ...overrides,
  };
}

// 2026-06-01 local — the fake candidates are due exactly then (the
// route's clock is the wall clock; the fixtures pin themselves to the
// runner's "today" via the boundary: fechaUltimoEnvio = hoy - 7d is
// NOT stable, so the seam test asserts WIRING (sections echo the use
// case output) with candidates classified against the REAL today.
function makeFakePipeline(overrides: Partial<CrmPipelineRepositoryPort> = {}): CrmPipelineRepositoryPort {
  return {
    obtenerPorEmpresaId: vi.fn(),
    listarTransiciones: vi.fn().mockResolvedValue([]),
    listarHandoffs: vi.fn().mockResolvedValue([]),
    registrarTransicion: vi.fn(),
    cambiarTipo: vi.fn(),
    listarCandidatosCola: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function setDb(pipeline: CrmPipelineRepositoryPort): void {
  __setCrmDbForTests({
    pool: {} as never,
    empresas: {} as never,
    importador: {} as never,
    pipeline,
    transiciones: {} as never,
    resultados: {} as never,
    handoffs: {} as never,
    actividades: {} as never,
    asignaciones: {} as never,
    envios: {} as never,
  } satisfies CrmDb);
}

const sessionBase = { sub: 'u-1', nombre: 'Juana Perez', area: 'ventas' };
const crmSession = { ...sessionBase, permisos: ['crm'] };

function getCola(): Promise<Response> {
  return GET();
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockReset();
  mockGetUsuarioDb.mockReset();
  mockGetUsuarioDb.mockResolvedValue({ getById: vi.fn().mockResolvedValue({ usuario: 'jperez' }) });
});

afterEach(() => {
  __setCrmDbForTests(null);
});

describe('GET /api/crm/cola', () => {
  it('returns 401 UNAUTHORIZED without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    setDb(makeFakePipeline());

    const response = await getCola();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 FORBIDDEN without the crm permiso (repo untouched)', async () => {
    mockGetSession.mockResolvedValue({ ...sessionBase, permisos: ['cobranza'] });
    const listarCandidatosCola = vi.fn();
    setDb(makeFakePipeline({ listarCandidatosCola }));

    const response = await getCola();
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe('FORBIDDEN');
    expect(listarCandidatosCola).not.toHaveBeenCalled();
  });

  it('returns 200 with the sections derived by the use case (wiring through the real use case)', async () => {
    mockGetSession.mockResolvedValue(crmSession);
    const listarCandidatosCola = vi.fn().mockResolvedValue([
      // Vencida HOY: fechaUltimoEnvio = hoy - 8d (proximo ≤ hoy para cualquier hoy real).
      candidato({
        empresaId: 10,
        razonSocial: 'Vencida Uno',
        fechaCicloInicio: diaIso(-8),
        fechaUltimoEnvio: diaIso(-8),
      }),
      // No vencida: último envío ayer → proximo = hoy+6.
      candidato({
        empresaId: 50,
        razonSocial: 'Fresca',
        fechaCicloInicio: diaIso(-1),
        fechaUltimoEnvio: diaIso(-1),
      }),
      // Decisión requerida: agotada INBOUND (counter-based — sin fecha).
      candidato({
        empresaId: 20,
        razonSocial: 'Agotada Fork',
        flujo: 'INBOUND',
        etapa: 'SEGUIMIENTO',
        enviosCiclo: 3,
      }),
      // Reactivable: rechazadoHasta en el pasado lejano (fechaUltimoEnvio irrelevante).
      candidato({
        empresaId: 40,
        razonSocial: 'Reactivable',
        etapa: 'RECHAZADO',
        rechazadoHasta: '2000-01-01',
      }),
      // sinGestion (crm-ux redesign): fresh NUEVO owned by the
      // session's resolved login name 'jperez'.
      candidato({
        empresaId: 60,
        razonSocial: 'Recién Mía',
        etapa: 'NUEVO',
        enviosCiclo: 0,
        responsable: 'jperez',
      }),
      // Fresh NUEVO owned by someone else → dropped (user-scoped).
      candidato({
        empresaId: 61,
        razonSocial: 'De Otro',
        etapa: 'NUEVO',
        enviosCiclo: 0,
        responsable: 'mgarcia',
      }),
    ]);
    setDb(makeFakePipeline({ listarCandidatosCola }));

    const response = await getCola();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.vencidasHoy.map((f: CandidatoCola) => f.empresaId)).toEqual([10]);
    expect(body.decisionRequerida.map((f: CandidatoCola) => f.empresaId)).toEqual([20]);
    expect(body.reactivables.map((f: CandidatoCola) => f.empresaId)).toEqual([40]);
    expect(body.reinicios).toEqual([]);
    expect(body.sinGestion.map((f: CandidatoCola) => f.empresaId)).toEqual([60]);
  });

  it('returns 500 INTERNAL_ERROR on a repository failure', async () => {
    mockGetSession.mockResolvedValue(crmSession);
    setDb(
      makeFakePipeline({
        listarCandidatosCola: vi.fn().mockRejectedValue(new Error('db down')),
      }),
    );

    const response = await getCola();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});

/** hoy - n días como DATE-only string (fixtures contra el reloj real de la ruta). */
function diaIso(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

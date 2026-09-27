import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mock auth session (cola route.test.ts precedent) ----

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
}));

// ---- Import under test (after mocks) ----

import { GET } from '../route';
import { __setCrmDbForTests, type CrmDb } from '@/features/crm/infrastructure/getCrmDb';
import type { CrmPanelRepositoryPort, FilaPanelCrm } from '@/features/crm/domain/ports';

/**
 * Seam contract for GET /api/crm/panel (rediseno-crm-panel task 7.2,
 * design D4): permiso `crm` (401 without a session, 403 without the
 * permiso), the aggregate rides the success body verbatim (filas +
 * hoy — derivation/KPIs/tabs/search are client-side), an EMPTY panel
 * is a valid 200, and repository failures map to 500 INTERNAL_ERROR.
 * Team-wide read — no per-user identity resolution (cola precedent
 * needs getUsuarioDb only for sinGestion scoping; the panel does not).
 */

function fila(overrides: Partial<FilaPanelCrm>): FilaPanelCrm {
  return {
    empresaId: 10,
    razonSocial: 'Constructora Andes SA',
    ruc: '1792345678001',
    tipo: 'Prospecto',
    responsable: 'jperez',
    sector: 'Construcción',
    cantidadTrabajadores: 45,
    createdAt: '2026-05-01T00:00:00.000Z',
    flujo: 'OUTBOUND',
    etapa: 'CADENCIA',
    ciclo: 1,
    enviosCiclo: 2,
    fechaCicloInicio: '2026-05-18',
    fechaUltimoEnvio: '2026-05-25',
    descansoHasta: null,
    rechazadoHasta: null,
    motivoRechazo: null,
    contactoNombre: 'Ana Ruiz',
    contactoCargo: 'Recursos Humanos / Seguridad',
    contactoCorreo: 'ana@andes.com',
    ...overrides,
  };
}

function makeFakePanel(overrides: Partial<CrmPanelRepositoryPort> = {}): CrmPanelRepositoryPort {
  return {
    listarEmpresasPanel: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function setDb(panel: CrmPanelRepositoryPort): void {
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
    panel,
  } satisfies CrmDb);
}

const sessionBase = { sub: 'u-1', nombre: 'Juana Perez', area: 'ventas' };
const crmSession = { ...sessionBase, permisos: ['crm'] };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockReset();
});

afterEach(() => {
  __setCrmDbForTests(null);
});

describe('GET /api/crm/panel', () => {
  it('returns 401 UNAUTHORIZED without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    setDb(makeFakePanel());

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 FORBIDDEN without the crm permiso (repo untouched)', async () => {
    mockGetSession.mockResolvedValue({ ...sessionBase, permisos: ['cobranza'] });
    const listarEmpresasPanel = vi.fn();
    setDb(makeFakePanel({ listarEmpresasPanel }));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe('FORBIDDEN');
    expect(listarEmpresasPanel).not.toHaveBeenCalled();
  });

  it('returns 200 with the rows verbatim and the server business date (hoy)', async () => {
    mockGetSession.mockResolvedValue(crmSession);
    // One pipeline row + one pipeline-less row (all-null projection) —
    // the two shapes the client-side derivation consumes.
    const filas = [
      fila({}),
      fila({
        empresaId: 20,
        razonSocial: 'Minera Sur SA',
        tipo: 'Cliente',
        responsable: null,
        sector: null,
        cantidadTrabajadores: null,
        flujo: null,
        etapa: null,
        ciclo: null,
        enviosCiclo: null,
        fechaCicloInicio: null,
        fechaUltimoEnvio: null,
        contactoNombre: null,
        contactoCargo: null,
        contactoCorreo: null,
      }),
    ];
    setDb(makeFakePanel({ listarEmpresasPanel: vi.fn().mockResolvedValue(filas) }));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.filas).toEqual(filas);
    expect(body.filas[1]).toEqual(
      expect.objectContaining({ flujo: null, etapa: null, enviosCiclo: null }),
    );
    expect(typeof body.hoy).toBe('string');
    expect(body.hoy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns 200 with an empty filas list when there are no empresas (valid empty state)', async () => {
    mockGetSession.mockResolvedValue(crmSession);
    setDb(makeFakePanel({ listarEmpresasPanel: vi.fn().mockResolvedValue([]) }));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.filas).toEqual([]);
  });

  it('returns 500 INTERNAL_ERROR on a repository failure', async () => {
    mockGetSession.mockResolvedValue(crmSession);
    setDb(
      makeFakePanel({
        listarEmpresasPanel: vi.fn().mockRejectedValue(new Error('db down')),
      }),
    );

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Route contract for GET /api/crm/calidad (agente-ia-crm E4·T6) — the
 * panel mínimo de métricas de calidad. Pinned: in-route session +
 * `crm_conversaciones` gate (401/403 — same shape as the productividad
 * route; the payload is an aggregate, but the panel is a
 * conversations-tier surface), the fixed 30-day window computed
 * SERVER-SIDE (no client input can widen it), the flat ResumenCalidad
 * shape with `success: true`, `cache-control: no-store` (metrics must
 * never be served stale), 503 when the container lacks the repo, and
 * 500 INTERNAL_ERROR mapping. Repo mocked at the module boundary.
 */

const mockGetSession = vi.hoisted(() => vi.fn());
const mockObtenerResumen = vi.hoisted(() => vi.fn());
const mockGetCrmDb = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
}));

vi.mock('@/features/crm/infrastructure/getCrmDb', () => ({
  getCrmDb: mockGetCrmDb,
}));

import { GET } from '../route';

const sessionBase = { sub: 'u-1', nombre: 'Marcos Conversa', area: 'Comercial' };

const resumenFixture = {
  desde: '2026-09-15T12:00:00.000Z',
  respuestasIa: 12,
  scorePromedio: 0.85,
  fidelidadPromedio: 0.9,
  porcentajeConFuentes: 66.666667,
  marcadasDeficiente: 2,
  solicitudesAyuda: 3,
  huecosAbiertos: 5,
  intervencionesHumanas: 4,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ ...sessionBase, permisos: ['crm_conversaciones'] });
  mockGetCrmDb.mockResolvedValue({ calidad: { obtenerResumen: mockObtenerResumen } });
  mockObtenerResumen.mockResolvedValue(resumenFixture);
});

afterEach(() => {
  mockGetSession.mockReset();
  mockGetCrmDb.mockReset();
  mockObtenerResumen.mockReset();
});

describe('GET /api/crm/calidad (E4·T6)', () => {
  it('401 UNAUTHORIZED sin sesión', async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({ success: false, code: 'UNAUTHORIZED' });
    expect(mockGetCrmDb).not.toHaveBeenCalled();
  });

  it('403 FORBIDDEN sin el permiso crm_conversaciones', async () => {
    mockGetSession.mockResolvedValue({ ...sessionBase, permisos: ['crm'] });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toMatchObject({ success: false, code: 'FORBIDDEN' });
    expect(mockGetCrmDb).not.toHaveBeenCalled();
  });

  it('200: shape ResumenCalidad completo + cache-control no-store + ventana fija de 30 días', async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, ...resumenFixture });
    expect(response.headers.get('cache-control')).toBe('no-store');

    // La ventana es SIEMPRE fija (30 días) y server-side: sin parámetros.
    expect(mockObtenerResumen).toHaveBeenCalledTimes(1);
    const desde: Date = mockObtenerResumen.mock.calls[0][0];
    expect(desde).toBeInstanceOf(Date);
    const dias = (Date.now() - desde.getTime()) / (24 * 60 * 60 * 1000);
    expect(dias).toBeGreaterThan(30 - 2 / 1440); // tolerancia ±2 min
    expect(dias).toBeLessThan(30 + 2 / 1440);
  });

  it('503 cuando el contenedor no trae el repo de calidad', async () => {
    mockGetCrmDb.mockResolvedValue({});

    const response = await GET();

    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe('INTERNAL_ERROR');
  });

  it('500 INTERNAL_ERROR cuando el repo falla (sin filtrar el error)', async () => {
    mockObtenerResumen.mockRejectedValue(new Error('secreto interno de la base'));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({ success: false, code: 'INTERNAL_ERROR' });
    expect(JSON.stringify(body)).not.toContain('secreto interno');
  });
});

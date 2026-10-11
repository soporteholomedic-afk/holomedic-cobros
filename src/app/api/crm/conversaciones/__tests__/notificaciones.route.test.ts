import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Route contract for GET /api/crm/conversaciones/notificaciones
 * (E3·T3) — the bandeja badge. Pinned: the response shape
 * {requiereAyuda, pendienteVinculacion, total, ultimaActividad},
 * `cache-control: no-store` (the badge must never be served stale),
 * and NO in-route session/permiso re-check: the proxy already gates
 * the /api/crm/conversaciones prefix with crm_conversaciones and the
 * payload carries no session-dependent data — the read stays cheap
 * (parent task decision; siblings re-check only because their
 * payloads are user-scoped). Use case mocked at the module boundary.
 */

const mocks = vi.hoisted(() => ({
  ejecutarMock: vi.fn(),
}));

vi.mock('@/features/crm/application/obtenerResumenNotificaciones', () => ({
  ObtenerResumenNotificacionesUseCase: class ObtenerResumenNotificacionesUseCaseFake {
    readonly ejecutar = mocks.ejecutarMock;
  },
}));

import { GET } from '../notificaciones/route';
import { __setCrmDbForTests, type CrmDb } from '@/features/crm/infrastructure/getCrmDb';

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

beforeEach(() => {
  vi.clearAllMocks();
  setDb();
});

afterEach(() => {
  __setCrmDbForTests(null);
});

describe('GET /api/crm/conversaciones/notificaciones (E3·T3)', () => {
  it('200: shape completo + cache-control no-store (jamás cacheado)', async () => {
    mocks.ejecutarMock.mockResolvedValueOnce({
      requiereAyuda: 2,
      pendienteVinculacion: 5,
      total: 40,
      ultimaActividad: '2026-06-15T12:30:00.000Z',
      requiereAyudaDetalle: [],
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      requiereAyuda: 2,
      pendienteVinculacion: 5,
      total: 40,
      ultimaActividad: '2026-06-15T12:30:00.000Z',
      requiereAyudaDetalle: [],
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('200: payload additive con requiereAyudaDetalle (E3·T6 toasts globales)', async () => {
    mocks.ejecutarMock.mockResolvedValueOnce({
      requiereAyuda: 2,
      pendienteVinculacion: 5,
      total: 40,
      ultimaActividad: '2026-06-15T12:30:00.000Z',
      requiereAyudaDetalle: [
        { conversacionId: 7, etiqueta: 'ACME S.A.', consulta: 'Crédito fiscal a 30 días' },
        { conversacionId: 8, etiqueta: 'Comercio Central', consulta: null },
      ],
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      requiereAyuda: 2,
      pendienteVinculacion: 5,
      total: 40,
      ultimaActividad: '2026-06-15T12:30:00.000Z',
      requiereAyudaDetalle: [
        { conversacionId: 7, etiqueta: 'ACME S.A.', consulta: 'Crédito fiscal a 30 días' },
        { conversacionId: 8, etiqueta: 'Comercio Central', consulta: null },
      ],
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('200 con ultimaActividad null (sin mensajes aún)', async () => {
    mocks.ejecutarMock.mockResolvedValueOnce({
      requiereAyuda: 0,
      pendienteVinculacion: 0,
      total: 0,
      ultimaActividad: null,
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, ultimaActividad: null });
  });

  it('CRM no configurado (contenedor sin repo conversaciones) → 503', async () => {
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
      // contenedor pre-E1: sin conversaciones
    } satisfies CrmDb);

    const response = await GET();

    expect(response.status).toBe(503);
  });
});

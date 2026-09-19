import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { buildDetallePath, useEmpresaDetalle } from '../useEmpresaDetalle';
import type { DetalleEmpresa } from '../../../application/obtenerDetalleEmpresa';

// ---- Fixtures ----

const detalle: DetalleEmpresa = {
  empresa: {
    id: 42,
    ruc: '900123456',
    rucNormalizado: '900123456',
    razonSocial: 'Constructora X',
    tipo: 'Prospecto',
    origen: 'Inbound',
    proyectoObra: null,
    destinoComun: null,
    notas: null,
    responsable: 'jperez',
    contactos: [
      {
        id: 11,
        empresaId: 42,
        nombre: 'Ana',
        telefono: '987654321',
        esPrincipal: true,
        correos: [{ id: 111, contactoId: 11, correo: 'ana@x.com' }],
      },
    ],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  pipeline: {
    empresaId: 42,
    flujo: 'INBOUND',
    etapa: 'REGISTRADO',
    ciclo: 1,
    enviosCiclo: 0,
    fechaCicloInicio: null,
    fechaUltimoEnvio: null,
    descansoHasta: null,
    rechazadoHasta: null,
    motivoRechazo: null,
    updatedBy: null,
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  transiciones: [],
  handoffs: [],
};

const fetchMock = vi.fn();

function okResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---- buildDetallePath (pure — no mocks) ----

describe('buildDetallePath', () => {
  it('builds the detail API path for the empresa id', () => {
    expect(buildDetallePath(42)).toBe('/api/crm/empresas/42/detalle');
  });
});

// ---- useEmpresaDetalle status machine ----

describe('useEmpresaDetalle', () => {
  it('goes loading → ready and exposes the fetched detail', async () => {
    fetchMock.mockResolvedValue(okResponse({ success: true, ...detalle }));

    const { result } = renderHook(() => useEmpresaDetalle(42));

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.detalle).toEqual(detalle);
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('/api/crm/empresas/42/detalle', { method: 'GET' });
  });

  it('reports an invalid id as an error WITHOUT fetching', async () => {
    const { result } = renderHook(() => useEmpresaDetalle(0));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('"id" debe ser un número entero positivo');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces the API error message on a non-OK response (404 included)', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Empresa no encontrada', code: 'NOT_FOUND_ERROR' }), {
        status: 404,
      }),
    );

    const { result } = renderHook(() => useEmpresaDetalle(99));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Empresa no encontrada');
    expect(result.current.detalle).toBeNull();
  });

  it('reports an unexpected shape as an error', async () => {
    fetchMock.mockResolvedValue(okResponse({ success: true, empresa: 'nope' }));

    const { result } = renderHook(() => useEmpresaDetalle(42));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Respuesta inesperada del servidor');
  });

  it('recovers via retry after a failure', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('Error de red'))
      .mockResolvedValueOnce(okResponse({ success: true, ...detalle }));

    const { result } = renderHook(() => useEmpresaDetalle(42));

    await waitFor(() => expect(result.current.status).toBe('error'));
    act(() => {
      result.current.retry();
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.detalle).toEqual(detalle);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refresh() re-fetches the detail (post-mutation reload contract)', async () => {
    // Fresh Response per call — a Response body can only be read once.
    fetchMock.mockImplementation(() => Promise.resolve(okResponse({ success: true, ...detalle })));

    const { result } = renderHook(() => useEmpresaDetalle(42));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => {
      result.current.refresh();
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });
});

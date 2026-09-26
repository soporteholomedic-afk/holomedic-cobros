import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { buildAsignacionesPath, buildAsignarPath, buildDevolverPath, useAsignaciones } from '../useAsignaciones';
import type { AsignacionHistorial } from '../../../domain/ports';

/**
 * Hook contract for the per-empresa assignment panel (tasks pr15/WU2,
 * spec G5): history read via GET .../asignaciones plus the two
 * mutations (asignar → pr14's POST .../asignar with {responsable};
 * devolver → POST .../devolver). A successful mutation refreshes the
 * history and reports success so the caller can refresh the cartera;
 * API errors surface in Spanish (verbatim) through `accionError`.
 */

const historial: AsignacionHistorial[] = [
  {
    id: 1,
    empresaId: 42,
    accion: 'ASIGNADO',
    responsablePrevio: null,
    responsableNuevo: 'jperez',
    actorUsuario: 'u-admin',
    createdAt: '2026-09-01T10:00:00.000Z',
  },
];

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
  fetchMock.mockResolvedValue(okResponse({ success: true, asignaciones: historial }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('path builders (pure — no mocks)', () => {
  it('builds the three assignment paths', () => {
    expect(buildAsignacionesPath(42)).toBe('/api/crm/empresas/42/asignaciones');
    expect(buildAsignarPath(42)).toBe('/api/crm/empresas/42/asignar');
    expect(buildDevolverPath(42)).toBe('/api/crm/empresas/42/devolver');
  });
});

describe('useAsignaciones', () => {
  it('stays idle and fetches nothing while no empresa is selected', async () => {
    const { result } = renderHook(() => useAsignaciones(null));

    await waitFor(() => expect(result.current.status).toBe('idle'));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.asignaciones).toEqual([]);
  });

  it('loads the history when an empresa is selected', async () => {
    const { result } = renderHook(() => useAsignaciones(42));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.asignaciones).toEqual(historial);
    expect(fetchMock).toHaveBeenCalledWith('/api/crm/empresas/42/asignaciones', { method: 'GET' });
  });

  it('surfaces a history-load failure and recovers on empresa change', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Error de red'));
    const { result, rerender } = renderHook(({ id }) => useAsignaciones(id), {
      initialProps: { id: 42 as number | null },
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Error de red');

    rerender({ id: 43 });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(fetchMock).toHaveBeenCalledWith('/api/crm/empresas/43/asignaciones', { method: 'GET' });
  });

  it('asignar posts {responsable} and refreshes the history on success', async () => {
    const { result } = renderHook(() => useAsignaciones(42));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    let exito = false;
    await act(async () => {
      exito = await result.current.asignar('jperez');
    });

    expect(exito).toBe(true);
    expect(result.current.accionError).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('/api/crm/empresas/42/asignar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ responsable: 'jperez' }),
    });
    // History re-fetched after the mutation (GET + POST + refresh GET).
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('asignar surfaces the API’s Spanish error verbatim and returns false', async () => {
    const { result } = renderHook(() => useAsignaciones(42));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ success: false, error: 'El responsable ya está asignado a esta empresa', code: 'VALIDATION_ERROR' }),
        { status: 400 },
      ),
    );

    let exito = true;
    await act(async () => {
      exito = await result.current.asignar('jperez');
    });

    expect(exito).toBe(false);
    expect(result.current.accionError).toBe('El responsable ya está asignado a esta empresa');
  });

  it('devolver posts to the devolver endpoint and refreshes on success', async () => {
    const { result } = renderHook(() => useAsignaciones(42));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    let exito = false;
    await act(async () => {
      exito = await result.current.devolver();
    });

    expect(exito).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('/api/crm/empresas/42/devolver', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('devolver surfaces the API’s Spanish error verbatim', async () => {
    const { result } = renderHook(() => useAsignaciones(42));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: false,
          error: 'Solo el responsable asignado o un usuario crm_admin puede devolver la empresa al pool',
          code: 'FORBIDDEN',
        }),
        { status: 403 },
      ),
    );

    let exito = true;
    await act(async () => {
      exito = await result.current.devolver();
    });

    expect(exito).toBe(false);
    expect(result.current.accionError).toBe(
      'Solo el responsable asignado o un usuario crm_admin puede devolver la empresa al pool',
    );
  });

  it('resets to idle when the panel closes (empresaId → null)', async () => {
    const { result, rerender } = renderHook(({ id }) => useAsignaciones(id), {
      initialProps: { id: 42 as number | null },
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    rerender({ id: null });

    await waitFor(() => expect(result.current.status).toBe('idle'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import {
  buildConversacionesQuery,
  DEBOUNCE_BUSQUEDA_MS,
  INTERVALO_POLLING_MS,
  useConversaciones,
} from '../hooks/useConversaciones';
import type { ConversacionListada } from '../../domain/entities';

/**
 * Contract for useConversaciones (agente-ia-crm E1, vista bandeja):
 * - carga inicial → ready con las filas + total + modoSimulado del GET;
 * - búsqueda en vivo con DEBOUNCE (~300ms) sobre `busqueda`;
 * - polling ligero cada INTERVALO_POLLING_MS (silent: never flashes
 *   loading) que se detiene al desmontar;
 * - simularEntrada POSTea /simular y refresca la lista (mock-first).
 */

// ---- Fixtures ----

const conversacion: ConversacionListada = {
  id: 7,
  empresaId: 1,
  contactoId: 11,
  canal: 'WHATSAPP',
  telefono: '+595981234567',
  identificadorCanal: null,
  estado: 'TOMADA_HUMANO',
  asignadaA: 'jperez',
  modo: 'HUMANO',
  ultimoMensajeEn: '2026-10-11T14:02:00.000Z',
  noLeidos: 0,
  creadoEn: '2026-10-11T10:00:00.000Z',
  actualizadoEn: '2026-10-11T14:02:00.000Z',
  razonSocial: 'Comercio Central',
  nombreContacto: 'Luis Medina',
};

function okListado(items: ConversacionListada[] = [conversacion]): Response {
  return new Response(
    JSON.stringify({ success: true, conversaciones: items, total: items.length, modoSimulado: true }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ---- buildConversacionesQuery (pure — no mocks) ----

describe('buildConversacionesQuery', () => {
  it('returns the bare path without a search term', () => {
    expect(buildConversacionesQuery('')).toBe('/api/crm/conversaciones');
  });

  it('trims and encodes the search term', () => {
    expect(buildConversacionesQuery('  comercio ')).toBe(
      `/api/crm/conversaciones?busqueda=${encodeURIComponent('comercio')}`,
    );
    expect(buildConversacionesQuery('   ')).toBe('/api/crm/conversaciones');
  });
});

// ---- carga + status machine ----

describe('useConversaciones', () => {
  it('goes loading → ready with rows, total and modoSimulado', async () => {
    fetchMock.mockResolvedValue(okListado());

    const { result } = renderHook(() => useConversaciones(''));

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.conversaciones).toEqual([conversacion]);
    expect(result.current.total).toBe(1);
    expect(result.current.modoSimulado).toBe(true);
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('/api/crm/conversaciones', expect.anything());
  });

  it('surfaces the API error message on a non-OK response', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'No autorizado', code: 'FORBIDDEN' }), {
        status: 403,
      }),
    );

    const { result } = renderHook(() => useConversaciones(''));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('No autorizado');
    expect(result.current.conversaciones).toEqual([]);
  });

  it('reports an unexpected shape as an error', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true, conversaciones: 'nope' }), { status: 200 }),
    );

    const { result } = renderHook(() => useConversaciones(''));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Respuesta inesperada del servidor');
  });
});

// ---- debounce de la búsqueda (fake timers) ----

describe('useConversaciones búsqueda con debounce', () => {
  it('waits DEBOUNCE_BUSQUEDA_MS before refetching with the term', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(okListado());

    const { result, rerender } = renderHook((busqueda: string) => useConversaciones(busqueda), {
      initialProps: '',
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.status).toBe('ready');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    rerender('comercio');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_BUSQUEDA_MS - 1);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1); // aún dentro de la ventana

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/crm/conversaciones?busqueda=${encodeURIComponent('comercio')}`,
      expect.anything(),
    );
  });
});

// ---- polling ligero ----

describe('useConversaciones polling', () => {
  it('silently refetches every INTERVALO_POLLING_MS and stops on unmount', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(okListado());

    const { result, unmount } = renderHook(() => useConversaciones(''));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.status).toBe('ready');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVALO_POLLING_MS);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('ready'); // silent: sin flash de loading

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVALO_POLLING_MS * 2);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2); // limpiado al desmontar
  });
});

// ---- simulador de entrada ----

describe('useConversaciones simularEntrada', () => {
  it('POSTs /simular and refetches the list on success', async () => {
    fetchMock.mockImplementation(async (_url: unknown, init?: RequestInit) =>
      init?.method === 'POST'
        ? new Response(
            JSON.stringify({
              success: true,
              conversacionId: 9,
              mensajeId: 99,
              vinculado: false,
            }),
            { status: 201 },
          )
        : okListado(),
    );

    const { result } = renderHook(() => useConversaciones(''));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    let salida: Awaited<ReturnType<typeof result.current.simularEntrada>>;
    await act(async () => {
      salida = await result.current.simularEntrada('0981 234 567', 'Hola, quiero info');
    });
    expect(salida!).toEqual({ ok: true, conversacionId: 9 });
    expect(fetchMock).toHaveBeenCalledTimes(3); // GET + POST + refetch
    const [, postInit] = fetchMock.mock.calls[1];
    expect(postInit).toMatchObject({ method: 'POST' });
    expect(JSON.parse(String(postInit?.body))).toEqual({
      telefono: '0981 234 567',
      texto: 'Hola, quiero info',
    });
  });

  it('returns the API error without breaking on failure', async () => {
    fetchMock.mockImplementation(async (_url: unknown, init?: RequestInit) =>
      init?.method === 'POST'
        ? new Response(
            JSON.stringify({
              success: false,
              error: 'El simulador solo está disponible con KAPSO_MODO=simulado',
              code: 'FORBIDDEN',
            }),
            { status: 403 },
          )
        : okListado(),
    );

    const { result } = renderHook(() => useConversaciones(''));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    let salida: Awaited<ReturnType<typeof result.current.simularEntrada>>;
    await act(async () => {
      salida = await result.current.simularEntrada('0981', 'Hola');
    });
    expect(salida!).toEqual({
      ok: false,
      error: 'El simulador solo está disponible con KAPSO_MODO=simulado',
    });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => {
  const pushMock = vi.fn();
  return {
    pushMock,
    // Estable entre renders como el router real de Next — un mock
    // que devuelve un objeto nuevo por llamada re-armaría el polling
    // en cada render (falso loop de fetches).
    router: { push: pushMock },
    toastMock: Object.assign(vi.fn(), { dismiss: vi.fn() }),
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => mocks.router,
}));

vi.mock('sonner', () => ({
  toast: mocks.toastMock,
}));

import {
  INTERVALO_POLLING_NOTIFICACIONES_MS,
  useNotificacionesConversaciones,
} from '../hooks/useNotificacionesConversaciones';
import type { DetalleAyudaNotificacion } from '../../domain/entities';

/**
 * Contract for useNotificacionesConversaciones (agente-ia-crm E3·T6 —
 * the shell-wide polling behind the sidebar badge + toasts):
 * - habilitado: primer fetch inmediato + polling cada
 *   INTERVALO_POLLING_NOTIFICACIONES_MS; !habilitado → ni fetch ni
 *   timer; el unmount limpia el timer (nada corre huérfano);
 * - stale-while-error: ante fallo (HTTP o red) conserva el último
 *   resumen en silencio (badge global — nunca grita);
 * - toasts: UNO por conversacionId no vista (Set `vistos` en
 *   memoria — recargar la página re-notifica ayuda aún pendiente);
 *   desaparecida del detalle (resuelta) sale de `vistos` → una
 *   NUEVA solicitud de la misma conversación vuelve a notificar;
 * - el action 'Ver conversación' navega (router.push con deep link)
 *   y disfraza el toast; JAMÁS auto-navega.
 */

function detalle(conversacionId: number, consulta: string | null = null): DetalleAyudaNotificacion {
  return { conversacionId, etiqueta: 'ACME S.A.', consulta };
}

function okPayload(
  detalleFilas: DetalleAyudaNotificacion[] = [],
  requiereAyuda = detalleFilas.length,
): Response {
  return new Response(
    JSON.stringify({
      success: true,
      requiereAyuda,
      pendienteVinculacion: 0,
      total: 12,
      ultimaActividad: '2026-06-15T12:30:00.000Z',
      requiereAyudaDetalle: detalleFilas,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  mocks.pushMock.mockReset();
  mocks.toastMock.mockReset();
  mocks.toastMock.dismiss.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ---- carga + polling ----

describe('useNotificacionesConversaciones carga y polling', () => {
  it('habilitado: primer fetch inmediato → resumen listo, cargando false', async () => {
    fetchMock.mockResolvedValue(okPayload([detalle(7, 'Crédito fiscal a 30 días')]));

    const { result } = renderHook(() => useNotificacionesConversaciones(true));

    expect(result.current.cargando).toBe(true);
    await waitFor(() => expect(result.current.cargando).toBe(false));
    expect(result.current.resumen).not.toBeNull();
    expect(result.current.resumen?.requiereAyuda).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/crm/conversaciones/notificaciones', {
      method: 'GET',
    });
  });

  it('polling silencioso cada INTERVALO_POLLING_NOTIFICACIONES_MS; limpio al desmontar', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(okPayload());

    const { unmount } = renderHook(() => useNotificacionesConversaciones(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVALO_POLLING_NOTIFICACIONES_MS);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVALO_POLLING_NOTIFICACIONES_MS);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVALO_POLLING_NOTIFICACIONES_MS * 2);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3); // el timer murió con el unmount
  });

  it('!habilitado: ni fetch ni timer (nada sin permiso)', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(okPayload());

    renderHook(() => useNotificacionesConversaciones(false));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVALO_POLLING_NOTIFICACIONES_MS * 3);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.toastMock).not.toHaveBeenCalled();
  });

  it('stale-while-error: fallo posterior conserva el último resumen en silencio', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(okPayload([detalle(7, 'Crédito fiscal a 30 días')]))
      .mockRejectedValueOnce(new Error('red caída'));

    const { result } = renderHook(() => useNotificacionesConversaciones(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.resumen).not.toBeNull();
    const resumenPrevio = result.current.resumen;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVALO_POLLING_NOTIFICACIONES_MS);
    });

    expect(result.current.resumen).toBe(resumenPrevio); // sigue el dato viejo
    expect(result.current.cargando).toBe(false);
    // Sin re-toast: el detalle ya estaba visto.
    expect(mocks.toastMock).toHaveBeenCalledTimes(1);
  });

  it('payload con forma inesperada → silencio (badge global nunca grita)', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true, requiereAyuda: 'nope' }), { status: 200 }),
    );

    const { result } = renderHook(() => useNotificacionesConversaciones(true));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(result.current.resumen).toBeNull();
    expect(mocks.toastMock).not.toHaveBeenCalled();
  });
});

// ---- toasts (vistos + re-toast) ----

describe('useNotificacionesConversaciones toasts de ayuda', () => {
  it('dispara UN toast por conversacionId no vista y no repite en el poll siguiente', async () => {
    vi.useFakeTimers();
    const filas = [detalle(7, 'Crédito fiscal a 30 días'), detalle(8, 'Turnos rotativos')];
    fetchMock.mockResolvedValue(okPayload(filas));

    renderHook(() => useNotificacionesConversaciones(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mocks.toastMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVALO_POLLING_NOTIFICACIONES_MS);
    });
    expect(mocks.toastMock).toHaveBeenCalledTimes(2); // ya vistas
  });

  it('copy del toast (mockup): título, descripción «consulta» y action Ver conversación', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(okPayload([detalle(7, 'Crédito fiscal a 30 días')]));

    renderHook(() => useNotificacionesConversaciones(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mocks.toastMock).toHaveBeenCalledWith('La Guía necesita tu ayuda · ACME S.A.', {
      id: 'crm-ayuda-7',
      description: '«Crédito fiscal a 30 días» está fuera de su alcance. Te espera una indicación.',
      action: expect.objectContaining({ label: 'Ver conversación' }),
    });
  });

  it('consulta null → descripción sin cita; consulta larga → recortada a ~80 con elipsis', async () => {
    vi.useFakeTimers();
    const larga = 'c'.repeat(120);
    fetchMock.mockResolvedValue(okPayload([detalle(7, null), detalle(8, larga)]));

    renderHook(() => useNotificacionesConversaciones(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const descripcionNull = mocks.toastMock.mock.calls.find((c) => c[1]?.id === 'crm-ayuda-7')?.[1]
      ?.description;
    expect(descripcionNull).toBe('Te espera una indicación.');

    const descripcionLarga = mocks.toastMock.mock.calls.find((c) => c[1]?.id === 'crm-ayuda-8')?.[1]
      ?.description;
    expect(descripcionLarga).toBe(
      `«${'c'.repeat(79)}…» está fuera de su alcance. Te espera una indicación.`,
    );
  });

  it('el action navega con deep link y disfraza el toast; JAMÁS auto-navega', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(okPayload([detalle(7, 'Crédito fiscal a 30 días')]));

    renderHook(() => useNotificacionesConversaciones(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mocks.pushMock).not.toHaveBeenCalled(); // sin auto-navegación

    const opciones = mocks.toastMock.mock.calls[0]?.[1];
    expect(opciones?.action).toBeDefined();
    opciones?.action?.onClick?.();

    expect(mocks.pushMock).toHaveBeenCalledWith('/crm/conversaciones?conversacion=7');
    expect(mocks.toastMock.dismiss).toHaveBeenCalledWith('crm-ayuda-7');
  });

  it('resuelta → sale de vistos → una NUEVA solicitud de la misma conversación re-notifica', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(okPayload([detalle(7, 'Crédito fiscal a 30 días')]))
      .mockResolvedValueOnce(okPayload()) // resuelta: desaparece del detalle
      .mockResolvedValueOnce(okPayload([detalle(7, 'Otra consulta distinta')]));

    renderHook(() => useNotificacionesConversaciones(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mocks.toastMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVALO_POLLING_NOTIFICACIONES_MS);
    });
    expect(mocks.toastMock).toHaveBeenCalledTimes(1); // resuelta: solo se podó vistos

    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVALO_POLLING_NOTIFICACIONES_MS);
    });
    expect(mocks.toastMock).toHaveBeenCalledTimes(2); // nueva solicitud → re-toast
    expect(mocks.toastMock.mock.lastCall?.[0]).toBe('La Guía necesita tu ayuda · ACME S.A.');
  });

  it('desalojada del top-5 (detalle < requiereAyuda) NO se poda: re-entrar no re-notifica', async () => {
    vi.useFakeTimers();
    // 6 pendientes pero el detalle solo muestra 5 → no se puede saber
    // si la ausente resolvió o cayó de la ventana.
    fetchMock
      .mockResolvedValueOnce(
        okPayload(
          [detalle(7), detalle(8), detalle(9), detalle(10), detalle(11)],
          6,
        ),
      )
      .mockImplementation(async () =>
        okPayload(
          [
            detalle(8),
            detalle(9),
            detalle(10),
            detalle(11),
            detalle(12), // 7 quedó fuera de la ventana
          ],
          6,
        ),
      );

    const { result } = renderHook(() => useNotificacionesConversaciones(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mocks.toastMock).toHaveBeenCalledTimes(5);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVALO_POLLING_NOTIFICACIONES_MS);
    });
    expect(mocks.toastMock).toHaveBeenCalledTimes(6); // solo la 12 nueva
    expect(result.current.resumen?.requiereAyudaDetalle).toHaveLength(5);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVALO_POLLING_NOTIFICACIONES_MS);
    });
    expect(mocks.toastMock).toHaveBeenCalledTimes(6); // la 7 sigue "vista"
  });
});

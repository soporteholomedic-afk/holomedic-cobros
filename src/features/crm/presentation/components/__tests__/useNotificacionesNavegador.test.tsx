import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import type { AlertaCrm } from '../../application/calcularAlertas';
import { useNotificacionesNavegador } from '../useNotificacionesNavegador';

type FakePermiso = 'default' | 'granted' | 'denied';

class FakeNotification {
  static permission: FakePermiso = 'default';
  static requestPermission = vi.fn(async (): Promise<FakePermiso> => 'granted');
  static creadas: FakeNotification[] = [];
  onclick: (() => void) | null = null;
  constructor(
    public title: string,
    public options?: NotificationOptions,
  ) {
    FakeNotification.creadas.push(this);
  }
}

const alerta = (parcial: Partial<AlertaCrm>): AlertaCrm => ({
  idEmpresa: 'e-1',
  razonSocial: 'Constructora Andina S.A.C.',
  clase: 'accion_vencida',
  etapa: 'contactado',
  tipoAccion: 'cotizar',
  detalle: null,
  fecha: '2026-10-29',
  atraso: 2,
  ...parcial,
});

function mockAlertasSecuencia(secuencias: AlertaCrm[][]): void {
  let i = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const alertas = secuencias[Math.min(i, secuencias.length - 1)] ?? [];
      i++;
      return Response.json({ success: true, alertas, resumen: { vencidas: 0, hoy: 0, sinResponder: alertas.length } });
    }),
  );
}

const USUARIO = 'u-1';
const LLAVE = `crm-notificaciones-nav:${USUARIO}`;

beforeEach(() => {
  // Only the poll interval is faked: waitFor keeps its real timers (repo
  // convention, see CrmBoard.*.test.tsx faking just what they need).
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  localStorage.clear();
  FakeNotification.permission = 'default';
  FakeNotification.creadas = [];
  FakeNotification.requestPermission = vi.fn(async (): Promise<FakePermiso> => 'granted');
  vi.stubGlobal('Notification', FakeNotification);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useNotificacionesNavegador — soporte y switch (S1)', () => {
  it('reports unsupported when the browser has no Notification API', async () => {
    vi.unstubAllGlobals();
    const { result } = renderHook(() => useNotificacionesNavegador({ idUsuario: USUARIO }));
    await waitFor(() => expect(result.current.soporte).toBe('unsupported'));
    expect(await result.current.activar()).toBe('unsupported');
    expect(result.current.activado).toBe(false);
  });

  it('activates on granted permission and persists the switch per user', async () => {
    const { result } = renderHook(() => useNotificacionesNavegador({ idUsuario: USUARIO }));
    await waitFor(() => expect(result.current.soporte).toBe('default'));
    let resultado: 'granted' | 'denied' | 'unsupported' = 'unsupported';
    await act(async () => {
      resultado = await result.current.activar();
    });
    expect(resultado).toBe('granted');
    expect(result.current.activado).toBe(true);
    expect(localStorage.getItem(LLAVE)).toBe('1');
  });

  it('stays off when the browser denies permission (banner keeps asking, S2)', async () => {
    FakeNotification.requestPermission = vi.fn(async (): Promise<FakePermiso> => 'denied');
    const { result } = renderHook(() => useNotificacionesNavegador({ idUsuario: USUARIO }));
    await waitFor(() => expect(result.current.soporte).toBe('default'));
    let resultado: 'granted' | 'denied' | 'unsupported' = 'granted';
    await act(async () => {
      resultado = await result.current.activar();
    });
    expect(resultado).toBe('denied');
    await waitFor(() => expect(result.current.soporte).toBe('denied'));
    expect(result.current.activado).toBe(false);
    expect(localStorage.getItem(LLAVE)).toBeNull();
  });

  it('restores the persisted switch for the same user on mount', async () => {
    localStorage.setItem(LLAVE, '1');
    FakeNotification.permission = 'granted';
    const { result } = renderHook(() => useNotificacionesNavegador({ idUsuario: USUARIO }));
    await waitFor(() => expect(result.current.activado).toBe(true));
  });

  it('resets when the user changes and can be turned off', async () => {
    localStorage.setItem(LLAVE, '1');
    FakeNotification.permission = 'granted';
    const { result, rerender } = renderHook(({ idUsuario }) => useNotificacionesNavegador({ idUsuario }), {
      initialProps: { idUsuario: USUARIO },
    });
    await waitFor(() => expect(result.current.activado).toBe(true));
    rerender({ idUsuario: 'u-2' });
    await waitFor(() => expect(result.current.activado).toBe(false));
    act(() => result.current.desactivar());
    expect(localStorage.getItem('crm-notificaciones-nav:u-2')).toBeNull();
    expect(result.current.activado).toBe(false);
  });
});

describe('useNotificacionesNavegador — disparo (S1)', () => {
  it('notifies once on activation and again only when a NEW alert appears', async () => {
    mockAlertasSecuencia([
      [alerta({}), alerta({ idEmpresa: 'e-2', razonSocial: 'Minera Cobre', clase: 'sin_responder', tipoAccion: null, fecha: '2026-10-29T11:00:00.000Z', atraso: 52 })],
      // same alerts → no new notification
      [alerta({}), alerta({ idEmpresa: 'e-2', razonSocial: 'Minera Cobre', clase: 'sin_responder', tipoAccion: null, fecha: '2026-10-29T11:00:00.000Z', atraso: 52 })],
      // one new alert → one new notification
      [alerta({}), alerta({ idEmpresa: 'e-2', razonSocial: 'Minera Cobre', clase: 'sin_responder', tipoAccion: null, fecha: '2026-10-29T11:00:00.000Z', atraso: 52 }), alerta({ idEmpresa: 'e-3', razonSocial: 'Transporte Río', clase: 'accion_hoy', tipoAccion: 'llamar', fecha: '2026-10-31', atraso: 0 })],
    ]);
    const { result } = renderHook(() => useNotificacionesNavegador({ idUsuario: USUARIO }));
    await waitFor(() => expect(result.current.soporte).toBe('default'));
    await act(async () => {
      await result.current.activar();
    });
    await waitFor(() => expect(FakeNotification.creadas).toHaveLength(1));
    expect(FakeNotification.creadas[0]?.title).toBe('CRM: seguimientos pendientes');
    expect(FakeNotification.creadas[0]?.options?.tag).toBe('crm-alertas');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(FakeNotification.creadas).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(FakeNotification.creadas).toHaveLength(2);
    expect(FakeNotification.creadas[1]?.options?.body).toContain('1 vence hoy');
  });

  it('stops polling after desactivar', async () => {
    mockAlertasSecuencia([[alerta({})]]);
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const { result } = renderHook(() => useNotificacionesNavegador({ idUsuario: USUARIO }));
    await waitFor(() => expect(result.current.soporte).toBe('default'));
    await act(async () => {
      await result.current.activar();
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    act(() => result.current.desactivar());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

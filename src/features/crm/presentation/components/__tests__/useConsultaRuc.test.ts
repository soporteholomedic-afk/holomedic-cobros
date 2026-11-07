import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DatosSunat } from '../../../domain/entities';
import { useConsultaRuc } from '../useConsultaRuc';

const DATOS: DatosSunat = {
  razonSocial: 'Clínica Santa Rosa S.A.C.',
  direccion: 'Jr. Las Palmas 456, Lima',
  estado: 'ACTIVO',
  condicion: 'HABIDO',
};

interface LlamadaFetch {
  url: string;
  init?: RequestInit;
  resolver: (r: { ok: boolean; status: number; json: () => Promise<unknown> }) => void;
  rechazar: (e: unknown) => void;
}

function stubFetch(): LlamadaFetch[] {
  const llamadas: LlamadaFetch[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      return new Promise((resolve, reject) => {
        llamadas.push({
          url: String(url),
          init,
          resolver: (r) => resolve(r as unknown as Response),
          rechazar: reject,
        });
      });
    }),
  );
  return llamadas;
}

function responder(l: LlamadaFetch | undefined, status: number, body: unknown): void {
  l?.resolver({ ok: status < 400, status, json: () => Promise.resolve(body) });
}

async function flush(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useConsultaRuc', () => {
  it('stays idle without fetching while the RUC has fewer than 11 digits', async () => {
    const llamadas = stubFetch();
    const { result } = renderHook(({ ruc }: { ruc: string }) => useConsultaRuc(ruc), {
      initialProps: { ruc: '2051234567' },
    });

    await flush(700);
    expect(llamadas).toHaveLength(0);
    expect(result.current.estado).toEqual({ tipo: 'idle' });
  });

  it('debounces ~500ms after 11 digits and lands on encontrada with the SUNAT data (trimmed)', async () => {
    const llamadas = stubFetch();
    const { result } = renderHook(({ ruc }: { ruc: string }) => useConsultaRuc(ruc), {
      initialProps: { ruc: ' 20512345678' },
    });

    expect(result.current.estado).toEqual({ tipo: 'cargando' });
    await flush(499);
    expect(llamadas).toHaveLength(0);

    await flush(1);
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]!.url).toBe('/api/crm/ruc/20512345678');

    responder(llamadas[0], 200, { success: true, datos: DATOS });
    await flush(0);
    expect(result.current.estado).toEqual({ tipo: 'encontrada', datos: DATOS });
  });

  it('maps 404 to no-encontrada with the server message', async () => {
    const llamadas = stubFetch();
    const { result } = renderHook(() => useConsultaRuc('20512345678'));

    await flush(500);
    responder(llamadas[0], 404, { success: false, error: `No se encontraron datos SUNAT para el RUC: 20512345678` });
    await flush(0);
    expect(result.current.estado).toEqual({
      tipo: 'no-encontrada',
      mensaje: 'No se encontraron datos SUNAT para el RUC: 20512345678',
    });
  });

  it('maps 503 to no-configurada with the server message', async () => {
    const llamadas = stubFetch();
    const { result } = renderHook(() => useConsultaRuc('20512345678'));

    await flush(500);
    responder(llamadas[0], 503, {
      success: false,
      error: 'La consulta SUNAT no está configurada. Configura el token de apifacturacion en Configuración.',
    });
    await flush(0);
    expect(result.current.estado).toEqual({
      tipo: 'no-configurada',
      mensaje: 'La consulta SUNAT no está configurada. Configura el token de apifacturacion en Configuración.',
    });
  });

  it('maps 502 (servicio caído) to error with the server message', async () => {
    const llamadas = stubFetch();
    const { result } = renderHook(() => useConsultaRuc('20512345678'));

    await flush(500);
    responder(llamadas[0], 502, { success: false, error: 'apifacturacion no respondió' });
    await flush(0);
    expect(result.current.estado).toEqual({ tipo: 'error', mensaje: 'apifacturacion no respondió' });
  });

  it('maps 400 (RUC inválido) to error with the server message', async () => {
    const llamadas = stubFetch();
    const { result } = renderHook(() => useConsultaRuc('20512345678'));

    await flush(500);
    responder(llamadas[0], 400, { success: false, error: 'El RUC debe tener 11 dígitos' });
    await flush(0);
    expect(result.current.estado).toEqual({ tipo: 'error', mensaje: 'El RUC debe tener 11 dígitos' });
  });

  it('aborts the in-flight lookup when the input changes and keeps only the newest answer', async () => {
    const llamadas = stubFetch();
    const { result, rerender } = renderHook(({ ruc }: { ruc: string }) => useConsultaRuc(ruc), {
      initialProps: { ruc: '20512345678' },
    });

    await flush(500);
    expect(llamadas).toHaveLength(1);

    rerender({ ruc: '20999999999' });
    expect(llamadas[0]!.init?.signal).toBeInstanceOf(AbortSignal);
    expect((llamadas[0]!.init?.signal as AbortSignal).aborted).toBe(true);

    await flush(500);
    expect(llamadas).toHaveLength(2);
    responder(llamadas[1], 200, { success: true, datos: DATOS });
    await flush(0);
    expect(result.current.estado).toEqual({ tipo: 'encontrada', datos: DATOS });

    // The stale answer of the aborted lookup must never overwrite the state.
    responder(llamadas[0], 200, { success: true, datos: { ...DATOS, razonSocial: 'VIEJA S.A.' } });
    await flush(0);
    expect(result.current.estado).toEqual({ tipo: 'encontrada', datos: DATOS });
  });

  it('aborts the in-flight lookup on unmount', async () => {
    const llamadas = stubFetch();
    const { unmount } = renderHook(() => useConsultaRuc('20512345678'));

    await flush(500);
    unmount();
    expect((llamadas[0]!.init?.signal as AbortSignal).aborted).toBe(true);

    responder(llamadas[0], 200, { success: true, datos: DATOS });
    await flush(0); // no state update after unmount: nothing to assert, no crash
  });

  it('resetear returns to idle, cancels the in-flight lookup and its late answer cannot resurrect it', async () => {
    const llamadas = stubFetch();
    const { result } = renderHook(() => useConsultaRuc('20512345678'));

    await flush(500);
    expect(llamadas).toHaveLength(1);

    act(() => result.current.resetear());
    expect(result.current.estado).toEqual({ tipo: 'idle' });
    expect((llamadas[0]!.init?.signal as AbortSignal).aborted).toBe(true);

    responder(llamadas[0], 200, { success: true, datos: DATOS });
    await flush(0);
    expect(result.current.estado).toEqual({ tipo: 'idle' });
  });

  it('maps a 200 with an unusable body to error', async () => {
    const llamadas = stubFetch();
    const { result } = renderHook(() => useConsultaRuc('20512345678'));

    await flush(500);
    responder(llamadas[0], 200, { success: true, datos: { sinRazonSocial: true } });
    await flush(0);
    expect(result.current.estado).toEqual({ tipo: 'error', mensaje: 'GET /api/crm/ruc → 200' });
  });
});

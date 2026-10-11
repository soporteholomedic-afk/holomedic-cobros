import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { buildHiloPath, useHiloConversacion } from '../hooks/useHiloConversacion';

/**
 * Contract for useHiloConversacion (agente-ia-crm E1, columna hilo):
 * - carga inicial con id → 1 fetch, ready con conversacion + mensajes;
 * - versionActividad (fila.ultimoMensajeEn del listado) es la señal de
 *   "hubo actividad nueva": mismo id + misma versión → NO refetch;
 *   mismo id + versión distinta → recarga silenciosa con los mensajes
 *   nuevos (bug de la demo: el hilo abierto nunca se volvía a pedir);
 * - id null → idle sin fetch (sin columna central);
 * - cambiar de id recarga el hilo de la nueva conversación.
 */

// ---- Fixtures (shapes que pasan esHiloConversacion — ver guards.ts) ----

const conversacion = {
  id: 7,
  empresaId: 1,
  contactoId: 11,
  canal: 'WHATSAPP',
  telefono: '+595981234567',
  identificadorCanal: null,
  estado: 'TOMADA_HUMANO',
  asignadaA: 'jperez',
  modo: 'HUMANO',
  ultimoMensajeEn: '2026-10-11T10:00:00Z',
  noLeidos: 0,
  creadoEn: '2026-10-11T09:00:00Z',
  actualizadoEn: '2026-10-11T10:00:00Z',
};

function mensaje(conversacionId: number, id: number, cuerpo: string, creadoEn: string) {
  return {
    id,
    conversacionId,
    direccion: 'IN',
    emisor: 'CLIENTE',
    cuerpo,
    tipo: 'TEXTO',
    canal: 'WHATSAPP',
    wamid: null,
    idempotenciaKey: null,
    estadoEnvio: null,
    fuentes: null,
    score: null,
    modelo: null,
    creadoEn,
  };
}

function okHilo(mensajes: unknown[]): Response {
  return new Response(JSON.stringify({ success: true, conversacion, mensajes }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

interface Props {
  id: number | null;
  version: string | null;
}

function montar(props: Props) {
  return renderHook((p: Props) => useHiloConversacion(p.id, p.version), { initialProps: props });
}

// ---- carga + versionActividad ----

describe('useHiloConversacion carga', () => {
  it('carga el hilo al seleccionar un id (un solo fetch)', async () => {
    fetchMock.mockResolvedValue(
      okHilo([mensaje(7, 1, 'Hola, quiero info', '2026-10-11T10:00:00Z')]),
    );

    const { result } = montar({ id: 7, version: '2026-10-11T10:00:00Z' });

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.hilo?.conversacion.id).toBe(7);
    expect(result.current.hilo?.mensajes.map((m) => m.cuerpo)).toEqual(['Hola, quiero info']);
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(buildHiloPath(7), expect.anything());
  });

  it('queda idle sin fetch cuando el id es null', () => {
    const { result } = montar({ id: null, version: null });

    expect(result.current.status).toBe('idle');
    expect(result.current.hilo).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('useHiloConversacion versionActividad', () => {
  it('mismo id + misma versión → NO segundo fetch', async () => {
    fetchMock.mockResolvedValue(
      okHilo([mensaje(7, 1, 'Hola, quiero info', '2026-10-11T10:00:00Z')]),
    );

    const { result, rerender } = montar({ id: 7, version: '2026-10-11T10:00:00Z' });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    rerender({ id: 7, version: '2026-10-11T10:00:00Z' });
    expect(result.current.status).toBe('ready');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('mismo id + versión distinta → segundo fetch con los mensajes nuevos', async () => {
    fetchMock
      .mockResolvedValueOnce(
        okHilo([mensaje(7, 1, 'Hola, quiero info', '2026-10-11T10:00:00Z')]),
      )
      .mockResolvedValueOnce(
        okHilo([
          mensaje(7, 1, 'Hola, quiero info', '2026-10-11T10:00:00Z'),
          mensaje(7, 2, 'Sigo con la consulta', '2026-10-11T10:05:00Z'),
        ]),
      );

    const { result, rerender } = montar({ id: 7, version: '2026-10-11T10:00:00Z' });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender({ id: 7, version: '2026-10-11T10:05:00Z' });
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.hilo?.mensajes.map((m) => m.cuerpo)).toEqual([
      'Hola, quiero info',
      'Sigo con la consulta',
    ]);
  });

  it('cambiar de id recarga el hilo de la nueva conversación', async () => {
    fetchMock
      .mockResolvedValueOnce(
        okHilo([mensaje(7, 1, 'Hola, quiero info', '2026-10-11T10:00:00Z')]),
      )
      .mockResolvedValueOnce(
        okHilo([mensaje(8, 2, 'Otra conversación', '2026-10-11T11:00:00Z')]),
      );

    const { result, rerender } = montar({ id: 7, version: '2026-10-11T10:00:00Z' });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      rerender({ id: 8, version: '2026-10-11T11:00:00Z' });
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.hilo?.mensajes.map((m) => m.cuerpo)).toEqual(['Otra conversación']);
  });
});

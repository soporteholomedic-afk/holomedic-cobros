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
 * - cambiar de id recarga el hilo de la nueva conversación;
 * - enviarMensaje: ok → POST + append + errorEnvio null; !ok (502
 *   KAPSO_*) o fallo de red → errorEnvio y el borrador NO se pierde
 *   (sin append, sin throw); un envío exitoso posterior limpia el
 *   error; limpiarErrorEnvio lo limpia a mano (R3-cobertura-hilo);
 * - vincular: ok → POST + recarga del hilo (segundo GET) + true;
 *   error → errorVinculacion + false, sin recarga.
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

/** Respuesta OUT/HUMANO del POST [id]/mensajes (pasa esMensajeCrm). */
function mensajeOut(id: number, cuerpo: string, creadoEn: string) {
  return {
    id,
    conversacionId: 7,
    direccion: 'OUT',
    emisor: 'HUMANO',
    cuerpo,
    tipo: 'TEXTO',
    canal: 'WHATSAPP',
    wamid: 'wamid.OUT',
    idempotenciaKey: null,
    estadoEnvio: 'ENVIADO',
    fuentes: null,
    score: null,
    modelo: null,
    creadoEn,
  };
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

// ---- enviarMensaje (POST [id]/mensajes) ----

describe('useHiloConversacion enviarMensaje', () => {
  it('POSTea el mensaje, lo appendea al hilo y deja errorEnvio null', async () => {
    const enviado = mensajeOut(2, 'Buenas, en qué te ayudo', '2026-10-11T10:06:00Z');
    fetchMock.mockImplementation(async (url: unknown, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return new Response(JSON.stringify({ success: true, mensaje: enviado }), { status: 201 });
      }
      expect(String(url)).toBe(buildHiloPath(7));
      return okHilo([mensaje(7, 1, 'Hola, quiero info', '2026-10-11T10:00:00Z')]);
    });

    const { result } = montar({ id: 7, version: '2026-10-11T10:00:00Z' });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    let ok = false;
    await act(async () => {
      ok = await result.current.enviarMensaje('Buenas, en qué te ayudo');
    });

    expect(ok).toBe(true);
    expect(result.current.errorEnvio).toBeNull();
    expect(result.current.hilo?.mensajes.map((m) => m.cuerpo)).toEqual([
      'Hola, quiero info',
      'Buenas, en qué te ayudo',
    ]);
    expect(result.current.enviando).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2); // GET carga + POST
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe(`${buildHiloPath(7)}/mensajes`);
    expect(init).toMatchObject({ method: 'POST' });
    expect(JSON.parse(String(init?.body))).toEqual({ cuerpo: 'Buenas, en qué te ayudo' });
  });

  it('502 KAPSO_* → errorEnvio seteado, sin append; un envío exitoso posterior limpia el error', async () => {
    let postFallido = true;
    fetchMock.mockImplementation(async (_url: unknown, init?: RequestInit) => {
      if (init?.method === 'POST') {
        if (postFallido) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'El envío por WhatsApp falló',
              code: 'KAPSO_ERROR_ENVIO',
            }),
            { status: 502 },
          );
        }
        return new Response(
          JSON.stringify({ success: true, mensaje: mensajeOut(3, 'Reintento', '2026-10-11T10:10:00Z') }),
          { status: 201 },
        );
      }
      return okHilo([mensaje(7, 1, 'Hola, quiero info', '2026-10-11T10:00:00Z')]);
    });

    const { result } = montar({ id: 7, version: '2026-10-11T10:00:00Z' });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    let ok = true;
    await act(async () => {
      ok = await result.current.enviarMensaje('Primer intento');
    });
    expect(ok).toBe(false);
    expect(result.current.errorEnvio).toBe('El envío por WhatsApp falló');
    // Sin append: el hilo queda con el mensaje original nada más.
    expect(result.current.hilo?.mensajes).toHaveLength(1);

    postFallido = false;
    let reintento = false;
    await act(async () => {
      reintento = await result.current.enviarMensaje('Reintento');
    });
    expect(reintento).toBe(true);
    expect(result.current.errorEnvio).toBeNull(); // limpiado por el envío exitoso
    expect(result.current.hilo?.mensajes.map((m) => m.cuerpo)).toEqual([
      'Hola, quiero info',
      'Reintento',
    ]);
  });

  it('fallo de red → errorEnvio sin throw (el borrador sobrevive)', async () => {
    fetchMock.mockImplementation(async (_url: unknown, init?: RequestInit) => {
      if (init?.method === 'POST') throw new Error('Falla de red');
      return okHilo([mensaje(7, 1, 'Hola, quiero info', '2026-10-11T10:00:00Z')]);
    });

    const { result } = montar({ id: 7, version: '2026-10-11T10:00:00Z' });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    let ok = true;
    await act(async () => {
      // NO revienta: el composer nunca ve el throw (contrato).
      ok = await result.current.enviarMensaje('Nunca llega');
    });
    expect(ok).toBe(false);
    expect(result.current.errorEnvio).toBe('Falla de red');
    expect(result.current.hilo?.mensajes).toHaveLength(1);
    expect(result.current.enviando).toBe(false);
  });

  it('limpiarErrorEnvio resetea el error a mano', async () => {
    fetchMock.mockImplementation(async (_url: unknown, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return new Response(
          JSON.stringify({ success: false, error: 'La conversación está cerrada', code: 'CONVERSACION_CERRADA' }),
          { status: 422 },
        );
      }
      return okHilo([mensaje(7, 1, 'Hola, quiero info', '2026-10-11T10:00:00Z')]);
    });

    const { result } = montar({ id: 7, version: '2026-10-11T10:00:00Z' });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.enviarMensaje('Intento en cerrada');
    });
    expect(result.current.errorEnvio).not.toBeNull();

    act(() => {
      result.current.limpiarErrorEnvio();
    });
    expect(result.current.errorEnvio).toBeNull();
  });
});

// ---- vincular (POST [id]/vincular) ----

describe('useHiloConversacion vincular', () => {
  it('asociar ok → POST + recarga del hilo (segundo GET) y true', async () => {
    const conversacionTomada = { ...conversacion, estado: 'TOMADA_HUMANO' };
    fetchMock
      .mockResolvedValueOnce(okHilo([mensaje(7, 1, 'Hola, quiero info', '2026-10-11T10:00:00Z')]))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, conversacion: conversacionTomada }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        okHilo([
          mensaje(7, 1, 'Hola, quiero info', '2026-10-11T10:00:00Z'),
          mensaje(7, 2, 'Ya quedó vinculada', '2026-10-11T10:08:00Z'),
        ]),
      );

    const { result } = montar({ id: 7, version: '2026-10-11T10:00:00Z' });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    let ok = false;
    await act(async () => {
      ok = await result.current.vincular({ modo: 'asociar', contactoId: 11 });
    });

    expect(ok).toBe(true);
    expect(result.current.errorVinculacion).toBeNull();
    expect(result.current.vinculando).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3); // GET + POST + recarga GET
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe(`${buildHiloPath(7)}/vincular`);
    expect(JSON.parse(String(init?.body))).toEqual({ modo: 'asociar', contactoId: 11 });
    const [urlRecarga] = fetchMock.mock.calls[2]!;
    expect(urlRecarga).toBe(buildHiloPath(7));
    // La recarga dejó el hilo fresco (mensaje nuevo visible).
    expect(result.current.hilo?.mensajes.map((m) => m.cuerpo)).toEqual([
      'Hola, quiero info',
      'Ya quedó vinculada',
    ]);
  });

  it('error → errorVinculacion seteado, false y SIN recarga del hilo', async () => {
    fetchMock
      .mockResolvedValueOnce(okHilo([mensaje(7, 1, 'Hola, quiero info', '2026-10-11T10:00:00Z')]))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            error: 'Ya existe un contacto con ese nombre',
            code: 'CONFLICT_ERROR',
          }),
          { status: 409 },
        ),
      );

    const { result } = montar({ id: 7, version: '2026-10-11T10:00:00Z' });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    let ok = true;
    await act(async () => {
      ok = await result.current.vincular({ modo: 'asociar', contactoId: 11 });
    });

    expect(ok).toBe(false);
    expect(result.current.errorVinculacion).toBe('Ya existe un contacto con ese nombre');
    expect(fetchMock).toHaveBeenCalledTimes(2); // GET + POST: sin recarga
  });
});

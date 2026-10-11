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
 *
 * E3·T5: el hook TAMBIÉN carga la columna derecha (ficha/memorias/
 * ajustes) al seleccionar — los conteos de fetch del HILO se asserts
 * sobre `llamadasHilo()` (solo los GET del propio hilo), y el stub
 * enruta por URL para que los laterales reciban sus cuerpos y no
 * coman las respuestas encadenadas del hilo.
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

/** Cuerpos válidos de los laterales (E3·T5) para que carguen ready. */
const CUERPO_FICHA = {
  success: true,
  conversacionId: 7,
  contacto: { id: 11, nombre: 'Luis Medina', telefono: '+595981234567', cargo: null },
  empresa: { id: 1, razonSocial: 'Comercio Central', cantidadTrabajadores: null },
  datos: {
    cargo: { valor: null, origen: 'IA', confirmado: false },
    trabajadores: { valor: null, origen: 'IA', confirmado: false },
    sedes: { valor: null, origen: 'IA', confirmado: false },
  },
};
const CUERPO_MEMORIAS = { success: true, memorias: [], empresaId: 1 };
const CUERPO_AJUSTES = {
  success: true,
  estado: 'TOMADA_HUMANO',
  modo: 'HUMANO',
  asignadaA: 'jperez',
  memoriaActiva: true,
  config: { umbralConfianza: 0.6, maxIntercambios: 8, horarioDesde: 8, horarioHasta: 18 },
};

function jsonResponse(json: unknown, status = 200): Response {
  return new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } });
}

/**
 * Stub enrutado por "METHOD url": el hilo sirve `hiloPara(7)`, los
 * laterales sus cuerpos — nada come respuestas ajenas (E3·T5).
 */
function enrutar(
  hiloPor: Record<number, () => unknown>,
  extra: Record<string, (init?: RequestInit) => unknown> = {},
): void {
  fetchMock.mockImplementation(async (url: unknown, init?: RequestInit) => {
    const clave = `${init?.method ?? 'GET'} ${String(url)}`;
    const match = /^GET (\/api\/crm\/conversaciones\/(\d+))$/.exec(clave);
    if (match !== null) {
      const hilo = hiloPor[Number(match[2])];
      return jsonResponse(hilo === undefined ? { success: false, error: 'sin stub' } : hilo());
    }
    if (clave.endsWith('/ficha')) return jsonResponse(CUERPO_FICHA);
    if (clave.endsWith('/memorias')) return jsonResponse(CUERPO_MEMORIAS);
    if (clave.endsWith('/ajustes')) return jsonResponse(CUERPO_AJUSTES);
    const extraRuta = extra[clave];
    if (extraRuta !== undefined) return jsonResponse(extraRuta(init));
    return jsonResponse({ success: false, error: `sin stub: ${clave}` }, 500);
  });
}

/** GETs del propio hilo (los laterales no cuentan — E3·T5). */
function llamadasHilo(id = 7): number {
  return fetchMock.mock.calls.filter(([u, i]) => String(u) === buildHiloPath(id) && (i as RequestInit | undefined)?.method !== 'POST').length;
}

function okBody(mensajes: unknown[]): unknown {
  return { success: true, conversacion, mensajes };
}

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
  it('carga el hilo al seleccionar un id (un solo fetch del hilo)', async () => {
    enrutar({ 7: () => okBody([mensaje(7, 1, 'Hola, quiero info', '2026-10-11T10:00:00Z')]) });

    const { result } = montar({ id: 7, version: '2026-10-11T10:00:00Z' });

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.hilo?.conversacion.id).toBe(7);
    expect(result.current.hilo?.mensajes.map((m) => m.cuerpo)).toEqual(['Hola, quiero info']);
    expect(result.current.error).toBeNull();
    expect(llamadasHilo()).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith(buildHiloPath(7), expect.anything());
    // E3·T5: los laterales también cargaron con la selección.
    await waitFor(() => expect(result.current.statusFicha).toBe('ready'));
    await waitFor(() => expect(result.current.statusMemorias).toBe('ready'));
    await waitFor(() => expect(result.current.statusAjustes).toBe('ready'));
  });

  it('queda idle sin fetch cuando el id es null', () => {
    const { result } = montar({ id: null, version: null });

    expect(result.current.status).toBe('idle');
    expect(result.current.hilo).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('useHiloConversacion versionActividad', () => {
  it('mismo id + misma versión → NO segundo fetch del hilo', async () => {
    enrutar({ 7: () => okBody([mensaje(7, 1, 'Hola, quiero info', '2026-10-11T10:00:00Z')]) });

    const { result, rerender } = montar({ id: 7, version: '2026-10-11T10:00:00Z' });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(llamadasHilo()).toBe(1);

    rerender({ id: 7, version: '2026-10-11T10:00:00Z' });
    expect(result.current.status).toBe('ready');
    expect(llamadasHilo()).toBe(1);
  });

  it('mismo id + versión distinta → segundo fetch con los mensajes nuevos', async () => {
    let mensajes = [mensaje(7, 1, 'Hola, quiero info', '2026-10-11T10:00:00Z')];
    enrutar({ 7: () => okBody(mensajes) });

    const { result, rerender } = montar({ id: 7, version: '2026-10-11T10:00:00Z' });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(llamadasHilo()).toBe(1);

    mensajes = [...mensajes, mensaje(7, 2, 'Sigo con la consulta', '2026-10-11T10:05:00Z')];
    await act(async () => {
      rerender({ id: 7, version: '2026-10-11T10:05:00Z' });
    });

    expect(llamadasHilo()).toBe(2);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.hilo?.mensajes.map((m) => m.cuerpo)).toEqual([
      'Hola, quiero info',
      'Sigo con la consulta',
    ]);
  });

  it('cambiar de id recarga el hilo de la nueva conversación', async () => {
    enrutar({
      7: () => okBody([mensaje(7, 1, 'Hola, quiero info', '2026-10-11T10:00:00Z')]),
      8: () => ({
        success: true,
        conversacion: { ...conversacion, id: 8 },
        mensajes: [mensaje(8, 2, 'Otra conversación', '2026-10-11T11:00:00Z')],
      }),
    });

    const { result, rerender } = montar({ id: 7, version: '2026-10-11T10:00:00Z' });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      rerender({ id: 8, version: '2026-10-11T11:00:00Z' });
    });

    expect(llamadasHilo(7)).toBe(1);
    expect(llamadasHilo(8)).toBe(1);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.hilo?.mensajes.map((m) => m.cuerpo)).toEqual(['Otra conversación']);
  });
});

// ---- enviarMensaje (POST [id]/mensajes) ----

describe('useHiloConversacion enviarMensaje', () => {
  it('POSTea el mensaje, lo appendea al hilo y deja errorEnvio null', async () => {
    const enviado = mensajeOut(2, 'Buenas, en qué te ayudo', '2026-10-11T10:06:00Z');
    enrutar(
      { 7: () => okBody([mensaje(7, 1, 'Hola, quiero info', '2026-10-11T10:00:00Z')]) },
      { 'POST /api/crm/conversaciones/7/mensajes': () => ({ success: true, mensaje: enviado }) },
    );

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
    const postMensaje = fetchMock.mock.calls.filter(
      ([u, i]) => String(u) === `${buildHiloPath(7)}/mensajes` && (i as RequestInit | undefined)?.method === 'POST',
    );
    expect(postMensaje).toHaveLength(1);
    const [url, init] = postMensaje[0]!;
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
    let mensajes = [mensaje(7, 1, 'Hola, quiero info', '2026-10-11T10:00:00Z')];
    enrutar(
      { 7: () => okBody(mensajes) },
      {
        'POST /api/crm/conversaciones/7/vincular': () => {
          mensajes = [...mensajes, mensaje(7, 2, 'Ya quedó vinculada', '2026-10-11T10:08:00Z')];
          return { success: true, conversacion: { ...conversacion, estado: 'TOMADA_HUMANO' } };
        },
      },
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
    const postVincular = fetchMock.mock.calls.filter(
      ([u, i]) => String(u) === `${buildHiloPath(7)}/vincular` && (i as RequestInit | undefined)?.method === 'POST',
    );
    expect(postVincular).toHaveLength(1);
    expect(JSON.parse(String((postVincular[0]![1] as RequestInit).body))).toEqual({
      modo: 'asociar',
      contactoId: 11,
    });
    expect(llamadasHilo()).toBe(2); // carga + recarga
    // La recarga dejó el hilo fresco (mensaje nuevo visible).
    expect(result.current.hilo?.mensajes.map((m) => m.cuerpo)).toEqual([
      'Hola, quiero info',
      'Ya quedó vinculada',
    ]);
  });

  it('error → errorVinculacion seteado, false y SIN recarga del hilo', async () => {
    fetchMock.mockImplementation(async (url: unknown, init?: RequestInit) => {
      const clave = `${init?.method ?? 'GET'} ${String(url)}`;
      if (clave === 'POST /api/crm/conversaciones/7/vincular') {
        return jsonResponse(
          { success: false, error: 'Ya existe un contacto con ese nombre', code: 'CONFLICT_ERROR' },
          409,
        );
      }
      if (/^GET \/api\/crm\/conversaciones\/7$/.test(clave)) {
        return jsonResponse(okBody([mensaje(7, 1, 'Hola, quiero info', '2026-10-11T10:00:00Z')]));
      }
      if (clave.endsWith('/ficha')) return jsonResponse(CUERPO_FICHA);
      if (clave.endsWith('/memorias')) return jsonResponse(CUERPO_MEMORIAS);
      if (clave.endsWith('/ajustes')) return jsonResponse(CUERPO_AJUSTES);
      return jsonResponse({ success: false }, 500);
    });

    const { result } = montar({ id: 7, version: '2026-10-11T10:00:00Z' });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    let ok = true;
    await act(async () => {
      ok = await result.current.vincular({ modo: 'asociar', contactoId: 11 });
    });

    expect(ok).toBe(false);
    expect(result.current.errorVinculacion).toBe('Ya existe un contacto con ese nombre');
    expect(llamadasHilo()).toBe(1); // carga solamente: sin recarga
  });
});

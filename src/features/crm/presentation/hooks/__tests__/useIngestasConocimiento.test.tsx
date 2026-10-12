import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import {
  INTERVALO_POLLING_INGESTAS_MS,
  useIngestasConocimiento,
  type IngestaConocimientoVista,
} from '../useIngestasConocimiento';

/**
 * Contract for useIngestasConocimiento (agente-ia-crm E4·T8) — the
 * client hook behind /admin/crm/conocimiento. Pinned:
 * - carga inicial GET ?limite=20 → idle/loading → populated | error;
 * - cargarTexto POSTs JSON (tipo TEXTO fijo lo decide la ruta; acá
 *   solo nombre/contenido/vigencia) y refresca la lista devolviendo
 *   la ingesta creada; sin vigencia el body NO lleva las claves;
 * - cargarArchivo POSTs multipart con el File + vigencias como
 *   campos del FormData;
 * - fallo de carga → null + errorSubida (mensaje del servidor);
 *   limpiarErrorSubida lo limpia;
 * - polling CADA 5s SOLO mientras alguna ingesta está
 *   PENDIENTE/PROCESANDO, stale-while-error (un refresco que falla
 *   conserva la lista en silencio), y se detiene cuando todo está
 *   COMPLETADA/FALLIDA;
 * - la lista jamás confía en un body con forma inesperada (guard).
 */

const COMPLETADA: IngestaConocimientoVista = {
  id: 7,
  nombre: 'Manual comercial.pdf',
  tipo: 'PDF',
  tamanoBytes: 42,
  estado: 'COMPLETADA',
  error: null,
  entradasCreadas: 3,
  creadoPor: 'Marcos Conversa',
  creadoEn: '2026-10-12T10:00:00.000Z',
  procesadoEn: '2026-10-12T10:00:05.000Z',
  vigenciaDesde: null,
  vigenciaHasta: null,
};

const PENDIENTE: IngestaConocimientoVista = {
  ...COMPLETADA,
  id: 8,
  nombre: 'Notas.txt',
  tipo: 'TXT',
  estado: 'PENDIENTE',
  entradasCreadas: 0,
  procesadoEn: null,
};

const CREADA: IngestaConocimientoVista = {
  ...PENDIENTE,
  id: 9,
  nombre: 'Políticas 2026',
  tipo: 'TEXTO',
};

const fetchMock = vi.fn();

/** Stub estilo router: "METHOD /ruta" → body (200) | status numérico | throw. */
function enrutar(rutas: Record<string, unknown | ((init?: RequestInit) => unknown)>): void {
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const clave = `${init?.method ?? 'GET'} ${url.replace('http://localhost', '')}`;
    const ruta = rutas[clave];
    if (ruta === undefined) {
      return new Response(JSON.stringify({ success: false, error: `ruta no stubbeada: ${clave}` }), {
        status: 500,
      });
    }
    if (ruta instanceof Error) throw ruta;
    const cuerpo = typeof ruta === 'function' ? (ruta as (i?: RequestInit) => unknown)(init) : ruta;
    const status = typeof cuerpo === 'number' ? cuerpo : 200;
    const json = typeof cuerpo === 'number' ? { success: false, error: `fallo ${status}` } : cuerpo;
    return new Response(JSON.stringify(json), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  });
}

function lista(filas: IngestaConocimientoVista[]): unknown {
  return { success: true, ingestas: filas };
}

/** Manifiesto vivo: los GET leen de ESTE objeto (el polling ve lo nuevo). */
function rutasBase(filas: IngestaConocimientoVista[]): Record<string, unknown> {
  return { [`GET /api/crm/conocimiento/ingestas?limite=20`]: () => lista(filas) };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useIngestasConocimiento — carga inicial', () => {
  it('idle → loading → populated con la lista y sin error', async () => {
    enrutar(rutasBase([COMPLETADA]));

    const { result } = renderHook(() => useIngestasConocimiento());

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('populated'));
    expect(result.current.ingestas).toEqual([COMPLETADA]);
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('/api/crm/conocimiento/ingestas?limite=20');
  });

  it('fallo de la carga inicial → status error con mensaje', async () => {
    enrutar({ 'GET /api/crm/conocimiento/ingestas?limite=20': 500 });

    const { result } = renderHook(() => useIngestasConocimiento());

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.ingestas).toEqual([]);
    expect(result.current.error).toBeTruthy();
  });

  it('body con forma inesperada → error (la lista jamás confía en basura)', async () => {
    enrutar({ 'GET /api/crm/conocimiento/ingestas?limite=20': { success: true, ingestas: 'nope' } });

    const { result } = renderHook(() => useIngestasConocimiento());

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.ingestas).toEqual([]);
  });
});

describe('useIngestasConocimiento — cargarTexto', () => {
  it('happy: POST JSON con vigencias → devuelve la creada y refresca la lista', async () => {
    const rutas = rutasBase([COMPLETADA]);
    rutas['POST /api/crm/conocimiento/ingestas'] = (init?: RequestInit) => {
      const cuerpo = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(cuerpo).toEqual({
        nombre: 'Políticas 2026',
        contenido: 'Todo lo que la Guía debe saber',
        vigenciaDesde: '2026-01-01',
        vigenciaHasta: '2026-12-31',
      });
      return { success: true, ingesta: CREADA };
    };
    enrutar(rutas);

    const { result } = renderHook(() => useIngestasConocimiento());
    await waitFor(() => expect(result.current.status).toBe('populated'));

    let creada: IngestaConocimientoVista | null = null;
    await act(async () => {
      creada = await result.current.cargarTexto({
        nombre: 'Políticas 2026',
        contenido: 'Todo lo que la Guía debe saber',
        vigencia: { desde: '2026-01-01', hasta: '2026-12-31' },
      });
    });

    expect(creada).toEqual(CREADA);
    expect(result.current.errorSubida).toBeNull();
    // Refetch: GET inicial + POST + GET de refresco.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const ultimaLlamada = fetchMock.mock.calls.at(-1);
    expect(ultimaLlamada?.[0]).toBe('/api/crm/conocimiento/ingestas?limite=20');
  });

  it('sin vigencia: el body no lleva las claves de vigencia', async () => {
    const rutas = rutasBase([]);
    rutas['POST /api/crm/conocimiento/ingestas'] = (init?: RequestInit) => {
      const cuerpo = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(cuerpo).toEqual({ nombre: 'Suelto', contenido: 'texto' });
      expect('vigenciaDesde' in cuerpo).toBe(false);
      expect('vigenciaHasta' in cuerpo).toBe(false);
      return { success: true, ingesta: CREADA };
    };
    enrutar(rutas);

    const { result } = renderHook(() => useIngestasConocimiento());
    await waitFor(() => expect(result.current.status).toBe('populated'));

    await act(async () => {
      await result.current.cargarTexto({ nombre: 'Suelto', contenido: 'texto' });
    });
    expect(result.current.errorSubida).toBeNull();
  });

  it('fallo 400 → null + errorSubida con el mensaje del servidor; limpiarErrorSubida lo limpia', async () => {
    const rutas = rutasBase([]);
    rutas['POST /api/crm/conocimiento/ingestas'] = {
      success: false,
      error: 'Ingesta inválida (nombre): el nombre es obligatorio',
    };
    enrutar(rutas);

    const { result } = renderHook(() => useIngestasConocimiento());
    await waitFor(() => expect(result.current.status).toBe('populated'));

    let creada: IngestaConocimientoVista | null = null;
    await act(async () => {
      creada = await result.current.cargarTexto({ nombre: '   ', contenido: 'texto' });
    });

    expect(creada).toBeNull();
    expect(result.current.errorSubida).toContain('nombre es obligatorio');
    act(() => {
      result.current.limpiarErrorSubida();
    });
    expect(result.current.errorSubida).toBeNull();
  });
});

describe('useIngestasConocimiento — cargarArchivo', () => {
  it('happy: POST multipart con el File + vigencias como campos del FormData', async () => {
    const rutas = rutasBase([COMPLETADA]);
    rutas['POST /api/crm/conocimiento/ingestas'] = (init?: RequestInit) => {
      const cuerpo = init?.body;
      expect(cuerpo).toBeInstanceOf(FormData);
      const fd = cuerpo as FormData;
      const archivo = fd.get('file');
      expect(archivo).toBeInstanceOf(File);
      expect((archivo as File).name).toBe('notas.txt');
      expect(fd.get('vigenciaDesde')).toBe('2026-02-01');
      // Vacío = sin límite: la clave se omite, nunca viaja vacía.
      expect(fd.get('vigenciaHasta')).toBeNull();
      return { success: true, ingesta: PENDIENTE };
    };
    enrutar(rutas);

    const { result } = renderHook(() => useIngestasConocimiento());
    await waitFor(() => expect(result.current.status).toBe('populated'));

    const archivo = new File(['contenido del txt'], 'notas.txt', { type: 'text/plain' });
    let creada: IngestaConocimientoVista | null = null;
    await act(async () => {
      creada = await result.current.cargarArchivo({
        file: archivo,
        vigencia: { desde: '2026-02-01', hasta: '' },
      });
    });

    expect(creada).toEqual(PENDIENTE);
    // GET inicial + POST + GET de refresco.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  });

  it('fallo 422 (documento ilegible) → null + errorSubida', async () => {
    const rutas = rutasBase([]);
    rutas['POST /api/crm/conocimiento/ingestas'] = {
      success: false,
      error: 'No se pudo extraer el texto del documento (PDF ilegible)',
    };
    enrutar(rutas);

    const { result } = renderHook(() => useIngestasConocimiento());
    await waitFor(() => expect(result.current.status).toBe('populated'));

    const archivo = new File(['%PDF basura'], 'corrupto.pdf', { type: 'application/pdf' });
    await act(async () => {
      await result.current.cargarArchivo({ file: archivo });
    });

    expect(result.current.errorSubida).toContain('No se pudo extraer');
  });
});

describe('useIngestasConocimiento — polling de estado en vivo', () => {
  it('mientras hay PENDIENTE refresca cada 5s; cuando todo está terminal, se detiene', async () => {
    vi.useFakeTimers();
    const filas: IngestaConocimientoVista[] = [PENDIENTE];
    enrutar(rutasBase(filas));

    const { result } = renderHook(() => useIngestasConocimiento());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.ingestas[0]?.estado).toBe('PENDIENTE');

    // Tick 1: sigue PENDIENTE → el polling continúa.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVALO_POLLING_INGESTAS_MS);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // El procesador de la cola cierra la ingesta → el próximo tick lo ve.
    filas[0] = COMPLETADA;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVALO_POLLING_INGESTAS_MS);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.current.ingestas[0]?.estado).toBe('COMPLETADA');

    // Nada pendiente: el timer murió — no hay más GETs.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVALO_POLLING_INGESTAS_MS * 3);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('stale-while-error: un refresco que falla conserva la lista en silencio y NO baja a error', async () => {
    vi.useFakeTimers();
    const filas: IngestaConocimientoVista[] = [PENDIENTE];
    let llamadas = 0;
    enrutar({
      'GET /api/crm/conocimiento/ingestas?limite=20': () => {
        llamadas += 1;
        if (llamadas >= 2) throw new Error('red caída');
        return lista(filas);
      },
    });

    const { result } = renderHook(() => useIngestasConocimiento());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.status).toBe('populated');
    const listaPrevias = result.current.ingestas;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVALO_POLLING_INGESTAS_MS);
    });

    expect(result.current.status).toBe('populated'); // jamás baja a error por un refresco
    expect(result.current.ingestas).toBe(listaPrevias); // dato viejo conservado
  });
});

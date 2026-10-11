import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorMemoriaCrm, MemoriaEngramHttp } from '../memoriaEngramHttp';

/**
 * Adapter contract for MemoriaEngramHttp (agente-ia-crm E2·T2) against
 * the VERIFIED Engram 3.3.2 HTTP contract (parent live probe — code
 * against exactly this):
 * - guardar: POST /sessions (idempotent ensure, BEFORE every save) →
 *   POST /observations with the exact body shape (session_id/title/
 *   content/project/type/scope 'project'/operation_id) → bounded
 *   save-result poll (404 tolerated, stops at 200 committed, exhausted
 *   → non-fatal 'guardado' logging the id ONLY — never the content).
 * - buscar: GET /search, CLIENT-side session filter
 *   [chat-<conversacionId>, 'empresa'], slice, created_at parsed as
 *   UTC "YYYY-MM-DD HH:MM:SS".
 * - contexto: GET /context, parse ONLY the "### Pinned" block
 *   (- [type] **title**: content), skip malformed lines, no section →
 *   [], missing context field → MEMORIA_RESPUESTA_INVALIDA.
 * - pinear: PUT /observations/{id}/pin.
 * - Errors: timeout (AbortController) → MEMORIA_TIMEOUT, non-2xx →
 *   MEMORIA_ERROR, garbage JSON → MEMORIA_RESPUESTA_INVALIDA.
 * - Auth: Bearer token header present when configured, absent when not.
 * All offline: fetch is stubbed at the global boundary.
 */

const URL_BASE = 'http://127.0.0.1:7438';

interface OpcionesFetch {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

interface LlamadaFetch {
  url: string;
  metodo: string;
  opciones: OpcionesFetch;
}

interface RespuestaSimulada {
  status: number;
  cuerpo?: unknown;
  jsonRoto?: boolean;
}

/** Minimal Response-shaped object (the adapter only reads ok/status/json). */
function respuestaDe(simulada: RespuestaSimulada): Response {
  return {
    ok: simulada.status >= 200 && simulada.status < 300,
    status: simulada.status,
    json: async () => {
      if (simulada.jsonRoto) throw new SyntaxError('Unexpected token < in JSON');
      return simulada.cuerpo;
    },
  } as Response;
}

/**
 * Stubs global fetch with route-keyed response queues
 * (`"<METHOD> <path>"` → responses, consumed in order). An unexpected
 * extra call exhausts its queue and rejects — tests that pin "no more
 * calls" fail loudly instead of hanging.
 */
function stubFetch(colas: Record<string, RespuestaSimulada[]>) {
  const llamadas: LlamadaFetch[] = [];
  const fetchMock = vi.fn(async (url: unknown, opciones: OpcionesFetch = {}) => {
    const urlTexto = String(url);
    const metodo = (opciones.method ?? 'GET').toUpperCase();
    const ruta = `${metodo} ${urlTexto.split('?')[0].replace(URL_BASE, '')}`;
    llamadas.push({ url: urlTexto, metodo, opciones });
    const siguiente = colas[ruta]?.shift();
    if (siguiente === undefined) {
      throw new Error(`fetch inesperado: ${ruta} (${urlTexto})`);
    }
    return respuestaDe(siguiente);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { llamadas, fetchMock };
}

/** Ruta sin query de una llamada registrada, para asserts de orden/URL. */
function rutaDe(llamada: LlamadaFetch): string {
  return `${llamada.metodo} ${llamada.url.split('?')[0].replace(URL_BASE, '')}`;
}

const ENTRADA_CHAT = {
  empresaId: 3,
  conversacionId: 7,
  nivel: 'chat' as const,
  tipo: 'hecho_cliente' as const,
  titulo: 'E2T2 probe',
  contenido: 'contrato http probe holomedic',
  operationId: 'op-abc',
};

/** Cola estándar para un guardar que llega a commit inmediato. */
function colasGuardarConCommit(id: number): Record<string, RespuestaSimulada[]> {
  return {
    'POST /sessions': [{ status: 201, cuerpo: { id: 'chat-7', status: 'created' } }],
    'POST /observations': [{ status: 201, cuerpo: { id, status: 'saved' } }],
    'GET /observations/save-result': [{ status: 200, cuerpo: { id, status: 'committed' } }],
  };
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('MemoriaEngramHttp — guardar (E2·T2)', () => {
  it('asegura la sesión ANTES del save y envía el cuerpo exacto; commit inmediato', async () => {
    const { llamadas } = stubFetch(colasGuardarConCommit(77));

    const resultado = await new MemoriaEngramHttp({ urlBase: URL_BASE }).guardar(ENTRADA_CHAT);

    expect(resultado).toEqual({ id: 77, estado: 'comprometido' });
    // Orden exacto: session ensure → save → poll del commit.
    expect(llamadas.map(rutaDe)).toEqual([
      'POST /sessions',
      'POST /observations',
      'GET /observations/save-result',
    ]);
    // Cuerpo de /sessions exacto (scoping: proyecto por empresa, sesión por conversación).
    expect(JSON.parse(llamadas[0]!.opciones.body ?? '{}')).toEqual({
      id: 'chat-7',
      project: 'crm-emp-3',
    });
    // Cuerpo de /observations exacto — ni más campos ni otros nombres.
    expect(JSON.parse(llamadas[1]!.opciones.body ?? '{}')).toEqual({
      session_id: 'chat-7',
      title: 'E2T2 probe',
      content: 'contrato http probe holomedic',
      project: 'crm-emp-3',
      type: 'hecho_cliente',
      scope: 'project',
      operation_id: 'op-abc',
    });
    // El poll consulta el operation_id.
    expect(llamadas[2]!.url).toBe(
      `${URL_BASE}/observations/save-result?operation_id=${encodeURIComponent('op-abc')}`,
    );
  });

  it("nivel 'empresa' → sesión fija 'empresa'", async () => {
    const { llamadas } = stubFetch(colasGuardarConCommit(55));

    await new MemoriaEngramHttp({ urlBase: URL_BASE }).guardar({
      ...ENTRADA_CHAT,
      nivel: 'empresa',
      operationId: 'op-emp',
    });

    expect(JSON.parse(llamadas[0]!.opciones.body ?? '{}')).toEqual({
      id: 'empresa',
      project: 'crm-emp-3',
    });
    expect(JSON.parse(llamadas[1]!.opciones.body ?? '{}')).toMatchObject({
      session_id: 'empresa',
    });
  });

  it('repetir el mismo operation_id devuelve el MISMO id (re-ensure de sesión incluido)', async () => {
    const { llamadas } = stubFetch({
      'POST /sessions': [
        { status: 201, cuerpo: { id: 'chat-7', status: 'created' } },
        { status: 201, cuerpo: { id: 'chat-7', status: 'created' } },
      ],
      'POST /observations': [
        { status: 201, cuerpo: { id: 77, status: 'saved' } },
        { status: 201, cuerpo: { id: 77, status: 'saved' } },
      ],
      'GET /observations/save-result': [
        { status: 200, cuerpo: { id: 77, status: 'committed' } },
        { status: 200, cuerpo: { id: 77, status: 'committed' } },
      ],
    });
    const memoria = new MemoriaEngramHttp({ urlBase: URL_BASE });

    const primera = await memoria.guardar(ENTRADA_CHAT);
    const segunda = await memoria.guardar(ENTRADA_CHAT);

    expect(segunda).toEqual(primera);
    expect(primera).toEqual({ id: 77, estado: 'comprometido' });
    // El operation_id viaja en ambos saves (dedup del servidor).
    expect(JSON.parse(llamadas[1]!.opciones.body ?? '{}')).toMatchObject({ operation_id: 'op-abc' });
    expect(JSON.parse(llamadas[4]!.opciones.body ?? '{}')).toMatchObject({ operation_id: 'op-abc' });
    // La sesión se re-asegura antes del SEGUNDO save (POST /sessions idempotente).
    expect(llamadas.map(rutaDe)).toEqual([
      'POST /sessions',
      'POST /observations',
      'GET /observations/save-result',
      'POST /sessions',
      'POST /observations',
      'GET /observations/save-result',
    ]);
  });

  it('el poll tolera 404-then-200 y corta en el committed', async () => {
    vi.useFakeTimers();
    const { fetchMock } = stubFetch({
      'POST /sessions': [{ status: 201, cuerpo: { id: 'chat-7', status: 'created' } }],
      'POST /observations': [{ status: 201, cuerpo: { id: 88, status: 'saved' } }],
      'GET /observations/save-result': [
        { status: 404, cuerpo: { error: 'no committed result found for operation_id' } },
        { status: 200, cuerpo: { id: 88, status: 'committed' } },
      ],
    });

    const promesa = new MemoriaEngramHttp({ urlBase: URL_BASE }).guardar(ENTRADA_CHAT);
    await vi.advanceTimersByTimeAsync(600);

    await expect(promesa).resolves.toEqual({ id: 88, estado: 'comprometido' });
    // 2 writes + 2 polls: cortó en el committed, no siguió sondeando.
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('poll agotado (8 intentos) → NO fatal: estado guardado + log con el id SOLO (nunca el contenido)', async () => {
    vi.useFakeTimers();
    const noComite = { status: 404, cuerpo: { error: 'no committed result found for operation_id' } };
    const { fetchMock } = stubFetch({
      'POST /sessions': [{ status: 201, cuerpo: { id: 'chat-7', status: 'created' } }],
      'POST /observations': [{ status: 201, cuerpo: { id: 99, status: 'saved' } }],
      'GET /observations/save-result': Array.from({ length: 8 }, () => noComite),
    });

    const promesa = new MemoriaEngramHttp({ urlBase: URL_BASE }).guardar(ENTRADA_CHAT);
    await vi.advanceTimersByTimeAsync(2500);

    await expect(promesa).resolves.toEqual({ id: 99, estado: 'guardado' });
    // 2 writes + exactamente 8 polls (bounded).
    expect(fetchMock).toHaveBeenCalledTimes(10);
    // El log lleva el id/estado — JAMÁS el contenido de la observación (PII).
    expect(console.log).toHaveBeenCalledTimes(1);
    const linea = String(vi.mocked(console.log).mock.calls[0]?.[0]);
    expect(linea).toContain('99');
    expect(linea).not.toContain(ENTRADA_CHAT.contenido);
    expect(linea).not.toContain(ENTRADA_CHAT.titulo);
  });
});

describe('MemoriaEngramHttp — buscar (E2·T2)', () => {
  const FILA = (id: number, session_id: string, created_at: string) => ({
    id,
    sync_id: `sync-${id}`,
    session_id,
    type: 'hecho_cliente',
    title: `titulo ${id}`,
    content: `contenido ${id}`,
    project: 'crm-emp-3',
    scope: 'project',
    revision_count: 1,
    duplicate_count: 0,
    last_seen_at: created_at,
    created_at,
    updated_at: created_at,
    rank: 0.5,
  });

  it('filtra session_id CLIENT-side (chat propio + empresa), mapea y parsea created_at como UTC', async () => {
    const { llamadas } = stubFetch({
      'GET /search': [
        {
          status: 200,
          cuerpo: [
            FILA(1, 'chat-7', '2026-10-11 04:04:41'),
            FILA(2, 'chat-99', '2026-10-11 04:04:41'),
            FILA(3, 'empresa', '2026-10-11 05:06:07'),
          ],
        },
      ],
    });

    const resultados = await new MemoriaEngramHttp({ urlBase: URL_BASE }).buscar(
      'probe',
      3,
      7,
      10,
    );

    // chat-99 queda fuera (aislamiento por conversación, client-side).
    expect(resultados).toEqual([
      {
        id: 1,
        nivel: 'chat',
        tipo: 'hecho_cliente',
        titulo: 'titulo 1',
        contenido: 'contenido 1',
        creadoEn: new Date('2026-10-11T04:04:41.000Z'),
      },
      {
        id: 3,
        nivel: 'empresa',
        tipo: 'hecho_cliente',
        titulo: 'titulo 3',
        contenido: 'contenido 3',
        creadoEn: new Date('2026-10-11T05:06:07.000Z'),
      },
    ]);
    // "YYYY-MM-DD HH:MM:SS" se interpreta como UTC, no hora local.
    expect(resultados[0]!.creadoEn.toISOString()).toBe('2026-10-11T04:04:41.000Z');
    expect(llamadas[0]!.url).toContain('project=crm-emp-3');
    expect(llamadas[0]!.url).toContain('limit=10');
    expect(llamadas[0]!.url.startsWith(`${URL_BASE}/search?`)).toBe(true);
  });

  it('respeta el limite tras el filtro de sesión', async () => {
    stubFetch({
      'GET /search': [
        {
          status: 200,
          cuerpo: [
            FILA(1, 'chat-7', '2026-10-11 04:04:41'),
            FILA(3, 'empresa', '2026-10-11 05:06:07'),
          ],
        },
      ],
    });

    const resultados = await new MemoriaEngramHttp({ urlBase: URL_BASE }).buscar(
      'probe',
      3,
      7,
      1,
    );

    expect(resultados).toHaveLength(1);
    expect(resultados[0]!.id).toBe(1);
  });

  it('/search sin array → MEMORIA_RESPUESTA_INVALIDA', async () => {
    stubFetch({ 'GET /search': [{ status: 200, cuerpo: { error: 'boom' } }] });

    await expect(
      new MemoriaEngramHttp({ urlBase: URL_BASE }).buscar('probe', 3, 7, 10),
    ).rejects.toMatchObject({ codigo: 'MEMORIA_RESPUESTA_INVALIDA' });
  });

  it('/search 404 unknown_project → [] (empresa nueva — mismo criterio que /context)', async () => {
    stubFetch({
      'GET /search': [
        { status: 404, cuerpo: { code: 'unknown_project', error: 'project not found' } },
      ],
    });

    await expect(
      new MemoriaEngramHttp({ urlBase: URL_BASE }).buscar('probe', 3, 7, 10),
    ).resolves.toEqual([]);
  });
});

describe('MemoriaEngramHttp — contexto (E2·T2)', () => {
  it('parsea SOLO el bloque "### Pinned": tipo/titulo/contenido, salta líneas malformadas y corta en la siguiente sección', async () => {
    const contexto = [
      '# Contexto del proyecto',
      '### Pinned',
      '- [hecho_cliente] **E2T2 probe**: contrato http probe holomedic',
      '- linea malformada sin formato de pinned',
      '- [acuerdo] (empresa) **Factura mensual**: emiten factura el día 5',
      '',
      '### Recent',
      '- [preferencia] **fuera de pinned**: no cuenta',
    ].join('\n');
    const { llamadas } = stubFetch({
      'GET /context': [{ status: 200, cuerpo: { context: contexto } }],
    });

    const observaciones = await new MemoriaEngramHttp({ urlBase: URL_BASE }).contexto(3);

    expect(observaciones).toEqual([
      {
        id: 0,
        nivel: 'chat',
        tipo: 'hecho_cliente',
        titulo: 'E2T2 probe',
        contenido: 'contrato http probe holomedic',
        creadoEn: new Date(0),
      },
      {
        id: 0,
        nivel: 'empresa',
        tipo: 'acuerdo',
        titulo: 'Factura mensual',
        contenido: 'emiten factura el día 5',
        creadoEn: new Date(0),
      },
    ]);
    expect(llamadas[0]!.url).toBe(`${URL_BASE}/context?project=crm-emp-3`);
  });

  it('sin sección Pinned (o contexto vacío) → []', async () => {
    stubFetch({
      'GET /context': [
        { status: 200, cuerpo: { context: '### Recent\n- [x] **y**: z' } },
        { status: 200, cuerpo: { context: '' } },
      ],
    });
    const memoria = new MemoriaEngramHttp({ urlBase: URL_BASE });

    await expect(memoria.contexto(3)).resolves.toEqual([]);
    await expect(memoria.contexto(3)).resolves.toEqual([]);
  });

  it('respuesta sin campo context → MEMORIA_RESPUESTA_INVALIDA', async () => {
    stubFetch({ 'GET /context': [{ status: 200, cuerpo: { status: 'ok' } }] });

    await expect(new MemoriaEngramHttp({ urlBase: URL_BASE }).contexto(3)).rejects.toMatchObject(
      { codigo: 'MEMORIA_RESPUESTA_INVALIDA' },
    );
  });

  it('404 unknown_project → memoria vacía [] (empresa nueva sin proyecto aún — regresión del ensayo live E2·T5)', async () => {
    stubFetch({
      'GET /context': [
        { status: 404, cuerpo: { code: 'unknown_project', error: 'project "crm-emp-3" not found' } },
      ],
    });

    await expect(new MemoriaEngramHttp({ urlBase: URL_BASE }).contexto(3)).resolves.toEqual([]);
  });

  it('404 con OTRO cuerpo → MEMORIA_ERROR (no todo 404 es vacío)', async () => {
    stubFetch({ 'GET /context': [{ status: 404, cuerpo: { error: 'nope' } }] });

    await expect(new MemoriaEngramHttp({ urlBase: URL_BASE }).contexto(3)).rejects.toMatchObject({
      codigo: 'MEMORIA_ERROR',
    });
  });
});

describe('MemoriaEngramHttp — pinear y auth (E2·T2)', () => {
  it('pinear → PUT /observations/{id}/pin', async () => {
    const { llamadas } = stubFetch({
      'PUT /observations/12/pin': [{ status: 200, cuerpo: { id: 12, pinned: true } }],
    });

    await expect(new MemoriaEngramHttp({ urlBase: URL_BASE }).pinear(12)).resolves.toBeUndefined();

    expect(llamadas[0]!.metodo).toBe('PUT');
    expect(llamadas[0]!.url).toBe(`${URL_BASE}/observations/12/pin`);
  });

  it('con token → Authorization Bearer en TODAS las llamadas; sin token → ausente', async () => {
    const { llamadas } = stubFetch({
      ...colasGuardarConCommit(77),
      'GET /context': [{ status: 200, cuerpo: { context: '' } }],
    });
    const conToken = new MemoriaEngramHttp({ urlBase: URL_BASE, token: 'tok-xyz' });

    await conToken.guardar(ENTRADA_CHAT);
    await conToken.contexto(3);

    expect(llamadas[0]!.opciones.headers?.Authorization).toBe('Bearer tok-xyz');
    expect(llamadas[3]!.opciones.headers?.Authorization).toBe('Bearer tok-xyz');
    expect(llamadas[0]!.opciones.headers?.['Content-Type']).toBe('application/json');

    const { llamadas: sinTokenLlamadas } = stubFetch({
      'GET /context': [{ status: 200, cuerpo: { context: '' } }],
    });

    await new MemoriaEngramHttp({ urlBase: URL_BASE }).contexto(3);

    expect(sinTokenLlamadas[0]!.opciones.headers?.Authorization).toBeUndefined();
  });
});

describe('MemoriaEngramHttp — errores tipados (E2·T2)', () => {
  it('timeout del AbortController → MEMORIA_TIMEOUT (ErrorMemoriaCrm)', async () => {
    // Nunca responde: solo rechaza cuando el adapter aborta la señal.
    const fetchMock = vi.fn(
      (_url: unknown, opciones?: OpcionesFetch) =>
        new Promise<Response>((_, reject) => {
          opciones?.signal?.addEventListener('abort', () => {
            const error = new Error('This operation was aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const memoria = new MemoriaEngramHttp({ urlBase: URL_BASE, timeoutMs: 30 });

    await expect(memoria.contexto(3)).rejects.toMatchObject({ codigo: 'MEMORIA_TIMEOUT' });
    await expect(memoria.contexto(3)).rejects.toBeInstanceOf(ErrorMemoriaCrm);
  });

  it.each([500, 404])('HTTP %i (fuera del 404 del save-result) → MEMORIA_ERROR', async (status) => {
    stubFetch({ 'GET /context': [{ status, cuerpo: { error: 'boom' } }] });

    await expect(new MemoriaEngramHttp({ urlBase: URL_BASE }).contexto(3)).rejects.toMatchObject({
      codigo: 'MEMORIA_ERROR',
    });
  });

  it('JSON basura (2xx) → MEMORIA_RESPUESTA_INVALIDA', async () => {
    stubFetch({ 'GET /context': [{ status: 200, jsonRoto: true }] });

    await expect(new MemoriaEngramHttp({ urlBase: URL_BASE }).contexto(3)).rejects.toMatchObject({
      codigo: 'MEMORIA_RESPUESTA_INVALIDA',
    });
  });

  it('fallo de red → MEMORIA_ERROR', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );

    await expect(new MemoriaEngramHttp({ urlBase: URL_BASE }).contexto(3)).rejects.toMatchObject({
      codigo: 'MEMORIA_ERROR',
    });
  });
});

describe('MemoriaEngramHttp — listarPorProyecto (E3·T3)', () => {
  const FILA_OBS = (id: number, session_id: string, created_at: string) => ({
    id,
    sync_id: `sync-${id}`,
    session_id,
    type: 'hecho_cliente',
    title: `titulo ${id}`,
    content: `contenido ${id}`,
    project: 'crm-emp-3',
    scope: 'project',
    created_at,
    updated_at: created_at,
  });

  it('GET /observations?project=<proj> con la sesion CRUDO (el caller filtra por conversación)', async () => {
    const { llamadas } = stubFetch({
      'GET /observations': [
        {
          status: 200,
          cuerpo: [
            FILA_OBS(11, 'chat-7', '2026-10-11 04:04:41'),
            FILA_OBS(12, 'empresa', '2026-10-11 05:06:07'),
          ],
        },
      ],
    });

    const filas = await new MemoriaEngramHttp({ urlBase: URL_BASE }).listarPorProyecto(3);

    // Sin filtro de sesión aquí: el use case decide el alcance
    // (chat propio + empresa) — la fila cruda lleva la sesión.
    expect(filas).toEqual([
      {
        id: 11,
        sesion: 'chat-7',
        tipo: 'hecho_cliente',
        titulo: 'titulo 11',
        contenido: 'contenido 11',
        creadoEn: new Date('2026-10-11T04:04:41.000Z'),
      },
      {
        id: 12,
        sesion: 'empresa',
        tipo: 'hecho_cliente',
        titulo: 'titulo 12',
        contenido: 'contenido 12',
        creadoEn: new Date('2026-10-11T05:06:07.000Z'),
      },
    ]);
    expect(llamadas[0]!.url).toBe(`${URL_BASE}/observations?project=crm-emp-3`);
  });

  it('404 unknown_project → [] (empresa sin proyecto Engram = memoria vacía, igual que /search)', async () => {
    stubFetch({
      'GET /observations': [{ status: 404, cuerpo: { code: 'unknown_project' } }],
    });

    await expect(new MemoriaEngramHttp({ urlBase: URL_BASE }).listarPorProyecto(3)).resolves.toEqual(
      [],
    );
  });

  it('sin array → MEMORIA_RESPUESTA_INVALIDA; fila con forma inesperada → MEMORIA_RESPUESTA_INVALIDA', async () => {
    stubFetch({ 'GET /observations': [{ status: 200, cuerpo: { error: 'boom' } }] });
    await expect(
      new MemoriaEngramHttp({ urlBase: URL_BASE }).listarPorProyecto(3),
    ).rejects.toMatchObject({ codigo: 'MEMORIA_RESPUESTA_INVALIDA' });

    stubFetch({
      'GET /observations': [{ status: 200, cuerpo: [{ id: 'x', session_id: 1 }] }],
    });
    await expect(
      new MemoriaEngramHttp({ urlBase: URL_BASE }).listarPorProyecto(3),
    ).rejects.toMatchObject({ codigo: 'MEMORIA_RESPUESTA_INVALIDA' });
  });
});

describe('MemoriaEngramHttp — eliminar (E3·T3)', () => {
  it('DELETE /observations/{id}?expected_project=<proj> — 200 {"status":"deleted"} → void', async () => {
    const { llamadas } = stubFetch({
      'DELETE /observations/11': [{ status: 200, cuerpo: { status: 'deleted' } }],
    });

    await expect(new MemoriaEngramHttp({ urlBase: URL_BASE }).eliminar(11, 3)).resolves.toBeUndefined();

    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]!.metodo).toBe('DELETE');
    expect(llamadas[0]!.url).toBe(
      `${URL_BASE}/observations/11?expected_project=crm-emp-3`,
    );
  });

  it('404 → MEMORIA_NO_ENCONTRADA (la observación no existe en ese proyecto)', async () => {
    stubFetch({
      'DELETE /observations/99': [{ status: 404, cuerpo: { error: 'not found' } }],
    });

    await expect(new MemoriaEngramHttp({ urlBase: URL_BASE }).eliminar(99, 3)).rejects.toMatchObject({
      codigo: 'MEMORIA_NO_ENCONTRADA',
    });
  });

  it('401/403 → MEMORIA_ERROR con detalle SIN token (el token viaja en header, jamás en logs)', async () => {
    const detalleToken = 'sekret-token-value';
    stubFetch({
      'DELETE /observations/11': [
        { status: 401, cuerpo: { error: 'unauthorized' } },
        { status: 403, cuerpo: { error: 'forbidden' } },
      ],
    });
    const memoria = new MemoriaEngramHttp({ urlBase: URL_BASE, token: detalleToken });

    try {
      await memoria.eliminar(11, 3);
      expect.unreachable('debió rechazar con MEMORIA_ERROR');
    } catch (error) {
      expect(error).toBeInstanceOf(ErrorMemoriaCrm);
      const detalle = (error as ErrorMemoriaCrm).detalle;
      expect(detalle).not.toContain(detalleToken);
      expect(detalle).toContain('401');
    }
    await expect(memoria.eliminar(11, 3)).rejects.toMatchObject({ codigo: 'MEMORIA_ERROR' });
  });
});

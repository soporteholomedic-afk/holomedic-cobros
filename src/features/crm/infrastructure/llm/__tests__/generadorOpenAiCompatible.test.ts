import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ErrorGeneradorCrm,
  GeneradorOpenAiCompatible,
} from '../generadorOpenAiCompatible';
import type { EntradaGenerarRespuesta } from '../../../domain/entities';

/**
 * Adapter contract for GeneradorOpenAiCompatible (agente-ia-crm E2·T3):
 * one OpenAI-compatible POST /chat/completions per call with Bearer
 * auth, AbortController timeout, temperature 0.2 and max_tokens; the
 * prompts are the adapter's (system in Spanish + labeled user
 * sections) and the output is STRICT JSON, fenced-JSON tolerant,
 * first-balanced-JSON extracted, guarded and sanitized:
 * - idsConocimiento filtered to the ids the caller PROVIDED.
 * - scoreConfianza clamped into [0, 1].
 * - texto required non-empty; missing booleans coerce to the ESCALATION
 *   pair (enScope false / requiereAyudaHumana true) — fail toward a
 *   human, never toward a fabricated answer.
 * - destilar drops items with an unknown tipo, clamps titulo (60) /
 *   contenido (300) and keeps pinear=true ONLY for acuerdo/compromiso.
 * - One JSON-validity retry with a system nudge, then
 *   GENERADOR_RESPUESTA_INVALIDA; 401/403 → GENERADOR_AUTH; abort →
 *   GENERADOR_TIMEOUT; other non-2xx / network → GENERADOR_ERROR.
 * - PII: consulta/respuesta bodies NEVER appear in console output.
 * All offline: fetch is stubbed at the global boundary.
 */

const URL_BASE = 'https://llm-falso.test/v1';

interface OpcionesFetch {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

interface LlamadaFetch {
  url: string;
  opciones: OpcionesFetch;
}

interface RespuestaSimulada {
  status: number;
  /** OpenAI-compatible body — content of choices[0].message. */
  contenido?: string;
  /** Raw body override (envelope-level garbage). */
  cuerpo?: unknown;
}

/** Minimal Response-shaped object (the adapter only reads ok/status/json). */
function respuestaDe(simulada: RespuestaSimulada): Response {
  const cuerpo =
    simulada.cuerpo !== undefined
      ? simulada.cuerpo
      : { choices: [{ message: { content: simulada.contenido ?? '' } }] };
  return {
    ok: simulada.status >= 200 && simulada.status < 300,
    status: simulada.status,
    json: async () => cuerpo,
  } as Response;
}

/**
 * Stubs global fetch with a FIFO response queue — every adapter call
 * hits the same POST {urlBase}/chat/completions, so order is enough.
 * An exhausted queue rejects so unexpected extra calls fail loudly.
 */
function stubFetch(cola: RespuestaSimulada[]) {
  const llamadas: LlamadaFetch[] = [];
  const fetchMock = vi.fn(async (url: unknown, opciones: OpcionesFetch = {}) => {
    llamadas.push({ url: String(url), opciones });
    const siguiente = cola.shift();
    if (siguiente === undefined) throw new Error('fetch inesperado: cola agotada');
    return respuestaDe(siguiente);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { llamadas, fetchMock };
}

function crearAdapter(overrides: Partial<ConstructorParameters<typeof GeneradorOpenAiCompatible>[0]> = {}) {
  return new GeneradorOpenAiCompatible({
    urlBase: URL_BASE,
    apiKey: 'k-test',
    modelo: 'glm-test',
    ...overrides,
  });
}

const ENTRADA: EntradaGenerarRespuesta = {
  consulta: '¿Qué incluye el examen médico ocupacional?',
  contactoNuevo: false,
  historial: [{ emisor: 'CLIENTE', texto: 'Hola, buenas tardes' }],
  conocimiento: [
    { id: 7, titulo: 'Examen ocupacional', contenido: 'Incluye examen médico, audiometría y espirometría.' },
    { id: 8, titulo: 'Precios', contenido: 'El precio depende del headcount.' },
  ],
  memorias: [{ tipo: 'preferencia', titulo: 'Prefiere la tarde', contenido: 'El cliente prefiere turnos de tarde.' }],
};

const JSON_LIMPIO = JSON.stringify({
  texto: 'El examen incluye examen médico, audiometría y espirometría.',
  scoreConfianza: 0.9,
  enScope: true,
  requiereAyudaHumana: false,
  idsConocimiento: [7, 999],
});

function cuerpoDe(llamada: LlamadaFetch): {
  model: string;
  messages: { role: string; content: string }[];
  temperature: number;
  max_tokens: number;
} {
  expect(llamada.opciones.body).toBeDefined();
  return JSON.parse(llamada.opciones.body ?? '{}');
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function codigoDeError(promesa: Promise<unknown>): Promise<string> {
  try {
    await promesa;
    throw new Error('la promesa debía rechazar');
  } catch (error) {
    if (error instanceof ErrorGeneradorCrm) return error.codigo;
    throw error;
  }
}

describe('GeneradorOpenAiCompatible — pedido HTTP (E2·T3)', () => {
  it('POST {urlBase}/chat/completions con Bearer, model, temperature 0.2 y max_tokens', async () => {
    const { llamadas } = stubFetch([{ status: 200, contenido: JSON_LIMPIO }]);

    await crearAdapter().generarRespuesta(ENTRADA);

    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]?.url).toBe(`${URL_BASE}/chat/completions`);
    expect(llamadas[0]?.opciones.method).toBe('POST');
    expect(llamadas[0]?.opciones.headers?.Authorization).toBe('Bearer k-test');
    expect(llamadas[0]?.opciones.headers?.['Content-Type']).toBe('application/json');

    const cuerpo = cuerpoDe(llamadas[0]!);
    expect(cuerpo.model).toBe('glm-test');
    expect(cuerpo.temperature).toBe(0.2);
    expect(cuerpo.max_tokens).toBe(700);
    expect(cuerpo.messages).toHaveLength(2);
    expect(cuerpo.messages[0]?.role).toBe('system');
    expect(cuerpo.messages[1]?.role).toBe('user');
  });

  it('urlBase con slash final se une sin doblar el path', async () => {
    const { llamadas } = stubFetch([{ status: 200, contenido: JSON_LIMPIO }]);

    await crearAdapter({ urlBase: `${URL_BASE}/` }).generarRespuesta(ENTRADA);

    expect(llamadas[0]?.url).toBe(`${URL_BASE}/chat/completions`);
  });

  it('el mensaje de usuario trae las secciones rotuladas CONSULTA/HISTORIAL/CONOCIMIENTO/MEMORIAS', async () => {
    const { llamadas } = stubFetch([{ status: 200, contenido: JSON_LIMPIO }]);

    await crearAdapter().generarRespuesta(ENTRADA);

    const usuario = cuerpoDe(llamadas[0]!).messages[1]?.content ?? '';
    expect(usuario).toContain('CONSULTA:');
    expect(usuario).toContain(ENTRADA.consulta);
    expect(usuario).toContain('HISTORIAL:');
    expect(usuario).toContain('[CLIENTE] Hola, buenas tardes');
    expect(usuario).toContain('CONOCIMIENTO:');
    expect(usuario).toContain('[id 7] Examen ocupacional');
    expect(usuario).toContain('Incluye examen médico, audiometría y espirometría.');
    expect(usuario).toContain('MEMORIAS:');
    expect(usuario).toContain('[preferencia] Prefiere la tarde');
  });

  it('el system prompt exige JSON estricto y responder solo desde lo provisto', async () => {
    const { llamadas } = stubFetch([{ status: 200, contenido: JSON_LIMPIO }]);

    await crearAdapter().generarRespuesta(ENTRADA);

    const sistema = cuerpoDe(llamadas[0]!).messages[0]?.content ?? '';
    expect(sistema).toMatch(/JSON/);
    expect(sistema).toContain('idsConocimiento');
    expect(sistema).toContain('enScope');
  });

  it('el system prompt SIEMPRE lleva la cláusula de saludos/cortesía (E2·T9)', async () => {
    const { llamadas } = stubFetch([{ status: 200, contenido: JSON_LIMPIO }]);

    await crearAdapter().generarRespuesta(ENTRADA);

    const sistema = cuerpoDe(llamadas[0]!).messages[0]?.content ?? '';
    expect(sistema).toContain(
      'Los saludos, agradecimientos y cortesía general SIEMPRE se responden',
    );
    expect(sistema).toContain(
      'solo derivás a un humano las consultas de NEGOCIO que no puedas responder',
    );
  });

  it('contactoNuevo true → sección CONTACTO NUEVO al final del mensaje de usuario (E2·T9)', async () => {
    const { llamadas } = stubFetch([{ status: 200, contenido: JSON_LIMPIO }]);

    await crearAdapter().generarRespuesta({ ...ENTRADA, contactoNuevo: true });

    const usuario = cuerpoDe(llamadas[0]!).messages[1]?.content ?? '';
    expect(usuario).toContain('CONTACTO NUEVO:');
    expect(usuario).toContain('esta persona no está registrada');
    expect(usuario).toContain('preguntá su nombre y la empresa que representa');
    expect(usuario).toContain('agradecé los datos cuando los dé');
    // Las secciones estándar siguen presentes.
    expect(usuario).toContain('CONSULTA:');
    expect(usuario).toContain('MEMORIAS:');
    // La sección va AL FINAL (después de MEMORIAS).
    expect(usuario.lastIndexOf('CONTACTO NUEVO:')).toBeGreaterThan(usuario.lastIndexOf('MEMORIAS:'));
  });

  it('contactoNuevo false → SIN sección CONTACTO NUEVO', async () => {
    const { llamadas } = stubFetch([{ status: 200, contenido: JSON_LIMPIO }]);

    await crearAdapter().generarRespuesta(ENTRADA);

    const usuario = cuerpoDe(llamadas[0]!).messages[1]?.content ?? '';
    expect(usuario).not.toContain('CONTACTO NUEVO:');
  });

  it('destilar manda CONSULTA y RESPUESTA rotuladas al mismo endpoint', async () => {
    const { llamadas } = stubFetch([{ status: 200, contenido: '[]' }]);

    await crearAdapter().destilar({ consulta: '¿Hacemos el martes?', respuesta: 'Sí, agendado.' });

    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]?.url).toBe(`${URL_BASE}/chat/completions`);
    const usuario = cuerpoDe(llamadas[0]!).messages[1]?.content ?? '';
    expect(usuario).toContain('CONSULTA:');
    expect(usuario).toContain('¿Hacemos el martes?');
    expect(usuario).toContain('RESPUESTA:');
    expect(usuario).toContain('Sí, agendado.');
  });
});

describe('GeneradorOpenAiCompatible — indicación humana (E3·T2)', () => {
  it('indicación presente → sección INDICACIÓN DEL OPERADOR al PRINCIPIO del mensaje de usuario (antes de CONSULTA)', async () => {
    const { llamadas } = stubFetch([{ status: 200, contenido: JSON_LIMPIO }]);

    await crearAdapter().generarRespuesta({
      ...ENTRADA,
      indicacionHumana: 'Confirmale el examen del viernes a las 9 y pedile el headcount.',
    });

    const usuario = cuerpoDe(llamadas[0]!).messages[1]?.content ?? '';
    expect(usuario).toContain('INDICACIÓN DEL OPERADOR');
    expect(usuario).toContain('prioridad máxima');
    expect(usuario).toContain('Confirmale el examen del viernes a las 9 y pedile el headcount.');
    // Prominencia real: la sección va ANTES de la consulta y de todo lo demás.
    expect(usuario.indexOf('INDICACIÓN DEL OPERADOR')).toBeLessThan(usuario.indexOf('CONSULTA:'));
    expect(usuario.indexOf('INDICACIÓN DEL OPERADOR')).toBe(0);
    // Las secciones estándar siguen presentes.
    expect(usuario).toContain('CONOCIMIENTO:');
    expect(usuario).toContain('MEMORIAS:');
    // El contrato de salida NO cambia: sigue siendo el JSON estricto de siempre.
    const sistema = cuerpoDe(llamadas[0]!).messages[0]?.content ?? '';
    expect(sistema).toContain('scoreConfianza');
    expect(sistema).toContain('idsConocimiento');
  });

  it('indicación ausente → SIN la sección (camino E2 intacto)', async () => {
    const { llamadas } = stubFetch([{ status: 200, contenido: JSON_LIMPIO }]);

    await crearAdapter().generarRespuesta(ENTRADA);

    const usuario = cuerpoDe(llamadas[0]!).messages[1]?.content ?? '';
    expect(usuario).not.toContain('INDICACIÓN DEL OPERADOR');
    expect(usuario.startsWith('CONSULTA:')).toBe(true);
  });

  it('indicación en blanco → SIN la sección (se ignora, camino normal)', async () => {
    const { llamadas } = stubFetch([{ status: 200, contenido: JSON_LIMPIO }]);

    await crearAdapter().generarRespuesta({ ...ENTRADA, indicacionHumana: '   ' });

    const usuario = cuerpoDe(llamadas[0]!).messages[1]?.content ?? '';
    expect(usuario).not.toContain('INDICACIÓN DEL OPERADOR');
  });
});

describe('GeneradorOpenAiCompatible — prompts modulares (E4·T1, transport-only)', () => {
  it('generar: el system proviene del builder v2 — bloques hit de KB y memoria presentes, sin fuera de cobertura', async () => {
    const { llamadas } = stubFetch([{ status: 200, contenido: JSON_LIMPIO }]);

    await crearAdapter().generarRespuesta(ENTRADA);

    const sistema = cuerpoDe(llamadas[0]!).messages[0]?.content ?? '';
    expect(sistema).toContain('La Guía');
    expect(sistema).toContain('fragmentos [id N]');
    expect(sistema).toContain('MEMORIA PREVIA');
    expect(sistema).not.toContain('FUERA DE COBERTURA');
    expect(sistema).not.toContain('PRIMERA INTERACCIÓN');
  });

  it('generar: CONOCIMIENTO vacío → el system lleva el bloque FUERA DE COBERTURA del builder', async () => {
    const { llamadas } = stubFetch([{ status: 200, contenido: JSON_LIMPIO }]);

    await crearAdapter().generarRespuesta({ ...ENTRADA, conocimiento: [] });

    const sistema = cuerpoDe(llamadas[0]!).messages[0]?.content ?? '';
    expect(sistema).toContain('FUERA DE COBERTURA');
    expect(sistema).not.toContain('fragmentos [id N]');
  });

  it('generar: indicación humana → el system lleva el bloque PRIORIDAD MÁXIMA del builder', async () => {
    const { llamadas } = stubFetch([{ status: 200, contenido: JSON_LIMPIO }]);

    await crearAdapter().generarRespuesta({
      ...ENTRADA,
      indicacionHumana: 'Confirmale el examen del viernes a las 9.',
    });

    const sistema = cuerpoDe(llamadas[0]!).messages[0]?.content ?? '';
    expect(sistema).toContain('PRIORIDAD MÁXIMA');
  });

  it('generar: contactoNuevo → el system lleva el bloque PRESENTACIÓN INICIAL del builder', async () => {
    const { llamadas } = stubFetch([{ status: 200, contenido: JSON_LIMPIO }]);

    await crearAdapter().generarRespuesta({ ...ENTRADA, contactoNuevo: true });

    const sistema = cuerpoDe(llamadas[0]!).messages[0]?.content ?? '';
    expect(sistema).toContain('PRESENTACIÓN INICIAL');
  });

  it('destilar: system v2 del módulo de prompts con la disciplina E4·T4 y el contrato JSON/ficha', async () => {
    const { llamadas } = stubFetch([{ status: 200, contenido: '[]' }]);

    await crearAdapter().destilar({ consulta: 'c', respuesta: 'r' });

    const sistema = cuerpoDe(llamadas[0]!).messages[0]?.content ?? '';
    expect(sistema).toContain('Eres el distilador de La Guía');
    expect(sistema).toContain('AUTOCONTENIDA');
    expect(sistema).toContain('máximo 8 palabras');
    expect(sistema).toContain('JAMÁS pinees hechos informativos ni preferencias');
    expect(sistema).toContain('resultados médicos, documentos, sueldos');
    expect(sistema).toContain('copialos literal del hilo');
    expect(sistema).toContain('"ficha": {"cargo": string|null, "trabajadores": string|null, "sedes": string|null}}');
  });

  it('extraerIdentificacion: system v1 verbatim del módulo de prompts (regresión)', async () => {
    const { llamadas } = stubFetch([
      { status: 200, contenido: JSON.stringify({ nombre: null, empresa: null }) },
    ]);

    await crearAdapter().extraerIdentificacion({ consulta: 'c', respuesta: 'r' });

    const sistema = cuerpoDe(llamadas[0]!).messages[0]?.content ?? '';
    expect(sistema).toContain('Eres el extractor de identificación de La Guía');
  });
});

describe('GeneradorOpenAiCompatible — parseo y saneo (E2·T3)', () => {
  it('JSON limpio → RespuestaGenerada tal cual, ids filtrados a los provistos', async () => {
    stubFetch([{ status: 200, contenido: JSON_LIMPIO }]);

    const respuesta = await crearAdapter().generarRespuesta(ENTRADA);

    expect(respuesta).toEqual({
      texto: 'El examen incluye examen médico, audiometría y espirometría.',
      scoreConfianza: 0.9,
      enScope: true,
      requiereAyudaHumana: false,
      idsConocimiento: [7],
      modelo: 'glm-test',
    });
  });

  it('modelo refleja el nombre configurado del adapter (auditoría por mensaje)', async () => {
    stubFetch([{ status: 200, contenido: JSON_LIMPIO }]);

    const respuesta = await crearAdapter({ modelo: 'glm-otro' }).generarRespuesta(ENTRADA);

    expect(respuesta.modelo).toBe('glm-otro');
  });

  it('JSON cercado con ```json se extrae igual', async () => {
    stubFetch([{ status: 200, contenido: '```json\n' + JSON_LIMPIO + '\n```' }]);

    const respuesta = await crearAdapter().generarRespuesta(ENTRADA);

    expect(respuesta.texto).toBe('El examen incluye examen médico, audiometría y espirometría.');
    expect(respuesta.idsConocimiento).toEqual([7]);
  });

  it('scoreConfianza se acota a [0, 1] por arriba y por abajo', async () => {
    const porArriba = JSON.stringify({
      texto: 'a',
      scoreConfianza: 1.7,
      enScope: true,
      requiereAyudaHumana: false,
      idsConocimiento: [],
    });
    const porAbajo = JSON.stringify({
      texto: 'b',
      scoreConfianza: -0.5,
      enScope: true,
      requiereAyudaHumana: false,
      idsConocimiento: [],
    });
    const { llamadas } = stubFetch([
      { status: 200, contenido: porArriba },
      { status: 200, contenido: porAbajo },
    ]);

    const primera = await crearAdapter().generarRespuesta(ENTRADA);
    const segunda = await crearAdapter().generarRespuesta(ENTRADA);

    expect(primera.scoreConfianza).toBe(1);
    expect(segunda.scoreConfianza).toBe(0);
    expect(llamadas).toHaveLength(2);
  });

  it('booleanos ausentes coercen al par de ESCALADO (enScope false, ayuda humana true)', async () => {
    stubFetch([
      {
        status: 200,
        contenido: JSON.stringify({ texto: 'algo', scoreConfianza: 0.5, idsConocimiento: [] }),
      },
    ]);

    const respuesta = await crearAdapter().generarRespuesta(ENTRADA);

    expect(respuesta.enScope).toBe(false);
    expect(respuesta.requiereAyudaHumana).toBe(true);
  });

  it('idsConocimiento no-array se normaliza a []', async () => {
    stubFetch([
      {
        status: 200,
        contenido: JSON.stringify({
          texto: 'algo',
          scoreConfianza: 0.5,
          enScope: true,
          requiereAyudaHumana: false,
          idsConocimiento: '7',
        }),
      },
    ]);

    const respuesta = await crearAdapter().generarRespuesta(ENTRADA);

    expect(respuesta.idsConocimiento).toEqual([]);
  });
});

describe('GeneradorOpenAiCompatible — reintentos y errores (E2·T3)', () => {
  it('JSON inválido → UN reintento con nudge de sistema y el segundo intento gana', async () => {
    const { llamadas } = stubFetch([
      { status: 200, contenido: 'Lo siento, no puedo responder eso.' },
      { status: 200, contenido: JSON_LIMPIO },
    ]);

    const respuesta = await crearAdapter().generarRespuesta(ENTRADA);

    expect(llamadas).toHaveLength(2);
    const mensajes = cuerpoDe(llamadas[1]!).messages;
    expect(mensajes).toHaveLength(3);
    expect(mensajes[2]?.role).toBe('system');
    expect(mensajes[2]?.content).toBe(
      'Respondé únicamente con JSON válido, sin texto adicional.',
    );
    expect(respuesta.idsConocimiento).toEqual([7]);
  });

  it('JSON inválido dos veces → GENERADOR_RESPUESTA_INVALIDA (exactamente 2 pedidos)', async () => {
    const { llamadas } = stubFetch([
      { status: 200, contenido: 'nope' },
      { status: 200, contenido: 'tampoco { esto' },
    ]);

    const codigo = await codigoDeError(crearAdapter().generarRespuesta(ENTRADA));

    expect(codigo).toBe('GENERADOR_RESPUESTA_INVALIDA');
    expect(llamadas).toHaveLength(2);
  });

  it('texto ausente o vacío → inválido (reintenta y falla igual)', async () => {
    const sinTexto = JSON.stringify({ scoreConfianza: 0.9, enScope: true, idsConocimiento: [] });
    const { llamadas } = stubFetch([
      { status: 200, contenido: sinTexto },
      { status: 200, contenido: sinTexto },
    ]);

    const codigo = await codigoDeError(crearAdapter().generarRespuesta(ENTRADA));

    expect(codigo).toBe('GENERADOR_RESPUESTA_INVALIDA');
    expect(llamadas).toHaveLength(2);
  });

  it('401 → GENERADOR_AUTH sin reintento', async () => {
    const { llamadas } = stubFetch([{ status: 401 }]);

    const codigo = await codigoDeError(crearAdapter().generarRespuesta(ENTRADA));

    expect(codigo).toBe('GENERADOR_AUTH');
    expect(llamadas).toHaveLength(1);
  });

  it('403 → GENERADOR_AUTH', async () => {
    stubFetch([{ status: 403 }]);

    const codigo = await codigoDeError(crearAdapter().generarRespuesta(ENTRADA));

    expect(codigo).toBe('GENERADOR_AUTH');
  });

  it('abort del AbortController → GENERADOR_TIMEOUT', async () => {
    const fetchMock = vi.fn(async () => {
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      throw error;
    });
    vi.stubGlobal('fetch', fetchMock);

    const codigo = await codigoDeError(crearAdapter().generarRespuesta(ENTRADA));

    expect(codigo).toBe('GENERADOR_TIMEOUT');
  });

  it('500 → GENERADOR_ERROR sin reintento', async () => {
    const { llamadas } = stubFetch([{ status: 500 }]);

    const codigo = await codigoDeError(crearAdapter().generarRespuesta(ENTRADA));

    expect(codigo).toBe('GENERADOR_ERROR');
    expect(llamadas).toHaveLength(1);
  });

  it('fallo de red (no abort) → GENERADOR_ERROR', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    vi.stubGlobal('fetch', fetchMock);

    const codigo = await codigoDeError(crearAdapter().generarRespuesta(ENTRADA));

    expect(codigo).toBe('GENERADOR_ERROR');
  });

  it('message.content ausente → GENERADOR_RESPUESTA_INVALIDA sin reintento', async () => {
    const { llamadas } = stubFetch([{ status: 200, cuerpo: { choices: [{ message: {} }] } }]);

    const codigo = await codigoDeError(crearAdapter().generarRespuesta(ENTRADA));

    expect(codigo).toBe('GENERADOR_RESPUESTA_INVALIDA');
    expect(llamadas).toHaveLength(1);
  });

  it('choices ausente → GENERADOR_RESPUESTA_INVALIDA', async () => {
    stubFetch([{ status: 200, cuerpo: { object: 'chat.completion' } }]);

    const codigo = await codigoDeError(crearAdapter().generarRespuesta(ENTRADA));

    expect(codigo).toBe('GENERADOR_RESPUESTA_INVALIDA');
  });
});

describe('GeneradorOpenAiCompatible — destilar (E2·T3)', () => {
  it('array limpio → observaciones tipadas; pinear true pasa para acuerdo', async () => {
    stubFetch([
      {
        status: 200,
        contenido: JSON.stringify([
          { tipo: 'acuerdo', titulo: 'Examen el martes', contenido: 'El cliente acordó examen el martes 10.', pinear: true },
          { tipo: 'preferencia', titulo: 'Turnos de tarde', contenido: 'Prefiere turnos de tarde.', pinear: false },
        ]),
      },
    ]);

    const observaciones = await crearAdapter().destilar({
      consulta: '¿Hacemos el examen el martes a la tarde?',
      respuesta: 'Sí, quedó agendado para el martes.',
    });

    expect(observaciones).toEqual([
      { tipo: 'acuerdo', titulo: 'Examen el martes', contenido: 'El cliente acordó examen el martes 10.', pinear: true },
      { tipo: 'preferencia', titulo: 'Turnos de tarde', contenido: 'Prefiere turnos de tarde.', pinear: false },
    ]);
  });

  it('items con tipo fuera del catálogo se descartan', async () => {
    stubFetch([
      {
        status: 200,
        contenido: JSON.stringify([
          { tipo: 'emocion', titulo: 'X', contenido: 'Y', pinear: true },
          { tipo: 'hecho_cliente', titulo: 'Rubro minería', contenido: 'Trabaja en minería.', pinear: false },
        ]),
      },
    ]);

    const observaciones = await crearAdapter().destilar({ consulta: 'c', respuesta: 'r' });

    expect(observaciones).toEqual([
      { tipo: 'hecho_cliente', titulo: 'Rubro minería', contenido: 'Trabaja en minería.', pinear: false },
    ]);
  });

  it('pinear true se coerce a false para tipos que no son acuerdo/compromiso', async () => {
    stubFetch([
      {
        status: 200,
        contenido: JSON.stringify([
          { tipo: 'preferencia', titulo: 'Tarde', contenido: 'Prefiere tarde.', pinear: true },
          { tipo: 'compromiso', titulo: 'Enviar nomina', contenido: 'Enviará la nómina.', pinear: true },
        ]),
      },
    ]);

    const observaciones = await crearAdapter().destilar({ consulta: 'c', respuesta: 'r' });

    expect(observaciones[0]?.pinear).toBe(false);
    expect(observaciones[1]?.pinear).toBe(true);
  });

  it('titulo y contenido se acotan a 60 y 300 caracteres', async () => {
    const largo = 'x'.repeat(500);
    stubFetch([
      {
        status: 200,
        contenido: JSON.stringify([
          { tipo: 'hecho_cliente', titulo: largo, contenido: largo, pinear: false },
        ]),
      },
    ]);

    const observaciones = await crearAdapter().destilar({ consulta: 'c', respuesta: 'r' });

    expect(observaciones[0]?.titulo).toHaveLength(60);
    expect(observaciones[0]?.contenido).toHaveLength(300);
  });

  it('array vacío (nada duradero) es válido → []', async () => {
    stubFetch([{ status: 200, contenido: '[]' }]);

    const observaciones = await crearAdapter().destilar({ consulta: 'c', respuesta: 'r' });

    expect(observaciones).toEqual([]);
  });

  it('respuesta no-array dos veces → GENERADOR_RESPUESTA_INVALIDA (con nudge en el reintento)', async () => {
    const { llamadas } = stubFetch([
      { status: 200, contenido: '{"tipo":"acuerdo"}' },
      { status: 200, contenido: '{"tipo":"acuerdo"}' },
    ]);

    const codigo = await codigoDeError(crearAdapter().destilar({ consulta: 'c', respuesta: 'r' }));

    expect(codigo).toBe('GENERADOR_RESPUESTA_INVALIDA');
    // El reintento de destilar lleva el MISMO nudge de JSON que generar.
    const reintento = cuerpoDe(llamadas[1]!).messages;
    expect(reintento).toHaveLength(3);
    expect(reintento[2]?.role).toBe('system');
    expect(reintento[2]?.content).toBe('Respondé únicamente con JSON válido, sin texto adicional.');
  });

  it('destilar: JSON en prosa → UN reintento con nudge de sistema y el segundo intento gana', async () => {
    const { llamadas } = stubFetch([
      { status: 200, contenido: 'Disculpá, no encontré nada que destilar.' },
      {
        status: 200,
        contenido: JSON.stringify([
          { tipo: 'acuerdo', titulo: 'Examen el martes', contenido: 'Examen acordado para el martes 10.', pinear: true },
        ]),
      },
    ]);

    const observaciones = await crearAdapter().destilar({ consulta: 'c', respuesta: 'r' });

    expect(llamadas).toHaveLength(2);
    const mensajes = cuerpoDe(llamadas[1]!).messages;
    expect(mensajes).toHaveLength(3);
    expect(mensajes[2]?.role).toBe('system');
    expect(mensajes[2]?.content).toBe('Respondé únicamente con JSON válido, sin texto adicional.');
    expect(observaciones[0]?.tipo).toBe('acuerdo');
    expect(observaciones[0]?.pinear).toBe(true);
  });
});

describe('GeneradorOpenAiCompatible — destilar con ficha (E3·T4)', () => {
  it('objeto {observaciones, ficha} → ambas partes cruzan; el prompt pide la ficha en la MISMA llamada', async () => {
    const { llamadas } = stubFetch([
      {
        status: 200,
        contenido: JSON.stringify({
          observaciones: [
            { tipo: 'hecho_cliente', titulo: 'Rubro minería', contenido: 'Trabaja en minería.', pinear: false },
          ],
          ficha: { cargo: 'Jefe de Compras', trabajadores: '120', sedes: '3' },
        }),
      },
    ]);

    const resultado = await crearAdapter().destilar({ consulta: 'c', respuesta: 'r' });

    expect([...resultado]).toEqual([
      { tipo: 'hecho_cliente', titulo: 'Rubro minería', contenido: 'Trabaja en minería.', pinear: false },
    ]);
    expect(resultado.ficha).toEqual({ cargo: 'Jefe de Compras', trabajadores: '120', sedes: '3' });
    // El contrato JSON del prompt pide la ficha en el mismo pedido.
    const cuerpo = cuerpoDe(llamadas[0] as LlamadaFetch);
    const sistema = cuerpo.messages.find((m) => m.role === 'system')?.content ?? '';
    expect(sistema).toContain('ficha');
    expect(sistema).toContain('cargo');
    expect(sistema).toContain('trabajadores');
    expect(sistema).toContain('sedes');
  });

  it('ficha null o ausente → observaciones solas, propiedad ficha ausente', async () => {
    stubFetch([
      { status: 200, contenido: JSON.stringify({ observaciones: [], ficha: null }) },
    ]);
    const conNull = await crearAdapter().destilar({ consulta: 'c', respuesta: 'r' });
    expect([...conNull]).toEqual([]);
    expect('ficha' in conNull).toBe(false);

    stubFetch([{ status: 200, contenido: JSON.stringify({ observaciones: [] }) }]);
    const sinClave = await crearAdapter().destilar({ consulta: 'c', respuesta: 'r' });
    expect('ficha' in sinClave).toBe(false);
  });

  it('forma legacy (array puro) sigue válida → observaciones sin ficha (retrocompatibilidad)', async () => {
    stubFetch([
      {
        status: 200,
        contenido: JSON.stringify([
          { tipo: 'acuerdo', titulo: 'Examen el martes', contenido: 'Acordado.', pinear: true },
        ]),
      },
    ]);

    const resultado = await crearAdapter().destilar({ consulta: 'c', respuesta: 'r' });

    expect(resultado).toHaveLength(1);
    expect('ficha' in resultado).toBe(false);
  });

  it('ficha malformada NUNCA tira ni reintenta: campos inválidos se descartan, el resto sobrevive', async () => {
    const { fetchMock } = stubFetch([
      {
        status: 200,
        contenido: JSON.stringify({
          observaciones: [],
          ficha: { cargo: 42, trabajadores: '  ', sedes: 'dos', extra: 'ignorado' },
        }),
      },
    ]);

    const resultado = await crearAdapter().destilar({ consulta: 'c', respuesta: 'r' });

    // cargo numérico y trabajadores vacío se descartan; sedes textual sobrevive.
    expect(resultado.ficha).toEqual({ sedes: 'dos' });
    // Sin reintento: la ficha es best-effort, solo la invalidez de JSON reintenta.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ficha no-objeto (string) → tolerada como ausente, sin reintento', async () => {
    const { fetchMock } = stubFetch([
      { status: 200, contenido: JSON.stringify({ observaciones: [], ficha: 'nada' }) },
    ]);

    const resultado = await crearAdapter().destilar({ consulta: 'c', respuesta: 'r' });

    expect('ficha' in resultado).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('observaciones no-array dentro del objeto → invalidéz de JSON: reintenta y luego tira', async () => {
    stubFetch([
      { status: 200, contenido: JSON.stringify({ observaciones: 'no-array', ficha: { cargo: 'x' } }) },
      { status: 200, contenido: JSON.stringify({ observaciones: 'no-array' }) },
    ]);

    const codigo = await codigoDeError(crearAdapter().destilar({ consulta: 'c', respuesta: 'r' }));

    expect(codigo).toBe('GENERADOR_RESPUESTA_INVALIDA');
  });

  it('valores de ficha se recortan a 500 caracteres (columna NVARCHAR(500))', async () => {
    const largo = 'x'.repeat(600);
    stubFetch([
      {
        status: 200,
        contenido: JSON.stringify({ observaciones: [], ficha: { cargo: largo } }),
      },
    ]);

    const resultado = await crearAdapter().destilar({ consulta: 'c', respuesta: 'r' });

    expect(resultado.ficha?.cargo).toHaveLength(500);
  });
});

describe('GeneradorOpenAiCompatible — extraerIdentificacion (E2·T9)', () => {
  it('JSON limpio → {nombre, empresa} tipados con UN solo pedido; CONSULTA/RESPUESTA rotuladas', async () => {
    const { llamadas } = stubFetch([
      { status: 200, contenido: JSON.stringify({ nombre: '  Ana Giménez ', empresa: 'Constructora X S.A.' }) },
    ]);

    const identificacion = await crearAdapter().extraerIdentificacion({
      consulta: 'Hola, soy Ana de Constructora X',
      respuesta: '¡Gracias Ana!',
    });

    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]?.url).toBe(`${URL_BASE}/chat/completions`);
    const mensajes = cuerpoDe(llamadas[0]!).messages;
    expect(mensajes).toHaveLength(2);
    expect(mensajes[0]?.role).toBe('system');
    expect(mensajes[1]?.content).toContain('CONSULTA:');
    expect(mensajes[1]?.content).toContain('Hola, soy Ana de Constructora X');
    expect(mensajes[1]?.content).toContain('RESPUESTA:');
    expect(mensajes[1]?.content).toContain('¡Gracias Ana!');
    // Trim de ambos campos.
    expect(identificacion).toEqual({ nombre: 'Ana Giménez', empresa: 'Constructora X S.A.' });
  });

  it('campos null → {nombre: null, empresa: null} válido, sin reintento', async () => {
    const { llamadas } = stubFetch([
      { status: 200, contenido: JSON.stringify({ nombre: null, empresa: null }) },
    ]);

    const identificacion = await crearAdapter().extraerIdentificacion({ consulta: 'Hola', respuesta: '¡Hola!' });

    expect(identificacion).toEqual({ nombre: null, empresa: null });
    expect(llamadas).toHaveLength(1);
  });

  it('JSON inválido → UN reintento con nudge y el segundo intento gana', async () => {
    const { llamadas } = stubFetch([
      { status: 200, contenido: 'La persona no dijo su nombre todavía.' },
      { status: 200, contenido: JSON.stringify({ nombre: 'Beto', empresa: null }) },
    ]);

    const identificacion = await crearAdapter().extraerIdentificacion({ consulta: 'c', respuesta: 'r' });

    expect(llamadas).toHaveLength(2);
    expect(cuerpoDe(llamadas[1]!).messages).toHaveLength(3);
    expect(cuerpoDe(llamadas[1]!).messages[2]?.content).toBe(
      'Respondé únicamente con JSON válido, sin texto adicional.',
    );
    expect(identificacion).toEqual({ nombre: 'Beto', empresa: null });
  });

  it('JSON inválido dos veces → GENERADOR_RESPUESTA_INVALIDA (exactamente 2 pedidos)', async () => {
    const { llamadas } = stubFetch([
      { status: 200, contenido: 'nope' },
      { status: 200, contenido: 'tampoco { esto' },
    ]);

    const codigo = await codigoDeError(crearAdapter().extraerIdentificacion({ consulta: 'c', respuesta: 'r' }));

    expect(codigo).toBe('GENERADOR_RESPUESTA_INVALIDA');
    expect(llamadas).toHaveLength(2);
  });

  it('nombre y empresa se recortan a 120 caracteres tras el trim', async () => {
    const largo = 'x'.repeat(300);
    stubFetch([
      { status: 200, contenido: JSON.stringify({ nombre: largo, empresa: largo }) },
    ]);

    const identificacion = await crearAdapter().extraerIdentificacion({ consulta: 'c', respuesta: 'r' });

    expect(identificacion?.nombre).toHaveLength(120);
    expect(identificacion?.empresa).toHaveLength(120);
  });

  it('tipos no-string se coercen a null por campo (sin inventar)', async () => {
    stubFetch([
      { status: 200, contenido: JSON.stringify({ nombre: 42, empresa: ['Constructora'] }) },
    ]);

    const identificacion = await crearAdapter().extraerIdentificacion({ consulta: 'c', respuesta: 'r' });

    expect(identificacion).toEqual({ nombre: null, empresa: null });
  });

  it('array en vez de objeto → inválido (reintenta y falla igual)', async () => {
    const { llamadas } = stubFetch([
      { status: 200, contenido: '["Ana"]' },
      { status: 200, contenido: '["Ana"]' },
    ]);

    const codigo = await codigoDeError(crearAdapter().extraerIdentificacion({ consulta: 'c', respuesta: 'r' }));

    expect(codigo).toBe('GENERADOR_RESPUESTA_INVALIDA');
    expect(llamadas).toHaveLength(2);
  });
});

describe('GeneradorOpenAiCompatible — PII (E2·T3)', () => {
  it('ninguna salida de consola contiene la consulta ni la respuesta', async () => {
    stubFetch([{ status: 500 }, { status: 200, contenido: 'basura' }]);
    const espias = [
      vi.spyOn(console, 'log'),
      vi.spyOn(console, 'warn'),
      vi.spyOn(console, 'error'),
    ];

    const consultaMarcadora = 'consulta-secreta-datos-personales-9911';
    const respuestaMarcadora = 'respuesta-secreta-datos-personales-8822';
    await crearAdapter()
      .generarRespuesta({ ...ENTRADA, consulta: consultaMarcadora })
      .catch(() => undefined);
    await crearAdapter()
      .destilar({ consulta: consultaMarcadora, respuesta: respuestaMarcadora })
      .catch(() => undefined);

    const salidas: string[] = [];
    for (const espia of espias) {
      for (const llamada of espia.mock.calls) {
        salidas.push(llamada.map((argumento) => String(argumento)).join(' '));
      }
    }
    expect(salidas.every((linea) => !linea.includes(consultaMarcadora))).toBe(true);
    expect(salidas.every((linea) => !linea.includes(respuestaMarcadora))).toBe(true);
  });
});

describe('GeneradorOpenAiCompatible — senalCierre tolerante (E5·T8)', () => {
  const ENTRADA_CIERRE: EntradaGenerarRespuesta = {
    ...ENTRADA,
    cierresPosibles: ['ACEPTACION', 'CONVERSION_CLIENTE'],
  };
  const conSenal = (senalCierre: unknown) =>
    JSON.stringify({ ...JSON.parse(JSON_LIMPIO), senalCierre });

  it('señal válida y permitida cruza; la confianza se acota a [0, 1]', async () => {
    stubFetch([
      { status: 200, contenido: conSenal({ tipo: 'ACEPTACION', confianza: 0.85 }) },
      { status: 200, contenido: conSenal({ tipo: 'CONVERSION_CLIENTE', confianza: 1.8 }) },
      { status: 200, contenido: conSenal({ tipo: 'ACEPTACION', confianza: -0.4 }) },
    ]);

    const normal = await crearAdapter().generarRespuesta(ENTRADA_CIERRE);
    const alta = await crearAdapter().generarRespuesta(ENTRADA_CIERRE);
    const baja = await crearAdapter().generarRespuesta(ENTRADA_CIERRE);

    expect(normal.senalCierre).toEqual({ tipo: 'ACEPTACION', confianza: 0.85 });
    expect(alta.senalCierre).toEqual({ tipo: 'CONVERSION_CLIENTE', confianza: 1 });
    expect(baja.senalCierre).toEqual({ tipo: 'ACEPTACION', confianza: 0 });
  });

  it('tipo conocido pero FUERA de los cierresPosibles de este request → descartada', async () => {
    stubFetch([{ status: 200, contenido: conSenal({ tipo: 'CONFIRMACION_PRESENTACION', confianza: 0.9 }) }]);

    const respuesta = await crearAdapter().generarRespuesta(ENTRADA_CIERRE);

    expect(respuesta.senalCierre).toBeUndefined();
    expect('senalCierre' in respuesta).toBe(false);
  });

  it('sin cierresPosibles en la entrada, cualquier señal se descarta', async () => {
    stubFetch([{ status: 200, contenido: conSenal({ tipo: 'ACEPTACION', confianza: 0.9 }) }]);

    const respuesta = await crearAdapter().generarRespuesta(ENTRADA);

    expect(respuesta.senalCierre).toBeUndefined();
  });

  it('tipo desconocido, no-objeto, array, null o confianza inválida → descartada sin reintento ni error', async () => {
    const { fetchMock } = stubFetch([
      { status: 200, contenido: conSenal({ tipo: 'VENTA', confianza: 0.9 }) },
      { status: 200, contenido: conSenal('ACEPTACION') },
      { status: 200, contenido: conSenal(['ACEPTACION']) },
      { status: 200, contenido: conSenal(null) },
      { status: 200, contenido: conSenal({ tipo: 'ACEPTACION', confianza: 'alta' }) },
      { status: 200, contenido: conSenal({ tipo: 'ACEPTACION' }) },
      { status: 200, contenido: conSenal({ tipo: 'ACEPTACION', confianza: null }) },
    ]);

    for (let i = 0; i < 7; i += 1) {
      const respuesta = await crearAdapter().generarRespuesta(ENTRADA_CIERRE);
      expect(respuesta.senalCierre).toBeUndefined();
      expect(respuesta.texto).toBe('El examen incluye examen médico, audiometría y espirometría.');
      expect(respuesta.enScope).toBe(true);
    }
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });

  it('clave senalCierre ausente es normal: respuesta válida sin señal', async () => {
    const { fetchMock } = stubFetch([{ status: 200, contenido: JSON_LIMPIO }]);

    const respuesta = await crearAdapter().generarRespuesta(ENTRADA_CIERRE);

    expect(respuesta.senalCierre).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('GeneradorOpenAiCompatible — fidelidad autoevaluada (E4·T5)', () => {
  it('fidelidad ausente (modelo viejo) → undefined: NO invalida la respuesta (tolerante)', async () => {
    stubFetch([{ status: 200, contenido: JSON_LIMPIO }]);

    const respuesta = await crearAdapter().generarRespuesta(ENTRADA);

    expect(respuesta.fidelidad).toBeUndefined();
  });

  it('fidelidad presente → se acota a [0, 1] y cruza con el resto intacto', async () => {
    stubFetch([
      {
        status: 200,
        contenido: JSON.stringify({ ...JSON.parse(JSON_LIMPIO), fidelidad: 0.92 }),
      },
    ]);

    const respuesta = await crearAdapter().generarRespuesta(ENTRADA);

    expect(respuesta.fidelidad).toBe(0.92);
    expect(respuesta.texto).toBe('El examen incluye examen médico, audiometría y espirometría.');
  });

  it('fidelidad fuera de rango se acota: 1.7 → 1, -0.2 → 0', async () => {
    stubFetch([
      { status: 200, contenido: JSON.stringify({ ...JSON.parse(JSON_LIMPIO), fidelidad: 1.7 }) },
      { status: 200, contenido: JSON.stringify({ ...JSON.parse(JSON_LIMPIO), fidelidad: -0.2 }) },
    ]);

    const alta = await crearAdapter().generarRespuesta(ENTRADA);
    const baja = await crearAdapter().generarRespuesta(ENTRADA);

    expect(alta.fidelidad).toBe(1);
    expect(baja.fidelidad).toBe(0);
  });

  it('fidelidad no-numérica o no-finita se trata como AUSENTE (sin invalidar la respuesta)', async () => {
    stubFetch([
      { status: 200, contenido: JSON.stringify({ ...JSON.parse(JSON_LIMPIO), fidelidad: 'alta' }) },
      { status: 200, contenido: JSON.stringify({ ...JSON.parse(JSON_LIMPIO), fidelidad: null }) },
      { status: 200, contenido: JSON.stringify({ ...JSON.parse(JSON_LIMPIO), fidelidad: Number.NaN }) },
    ]);

    const porCadena = await crearAdapter().generarRespuesta(ENTRADA);
    const porNulo = await crearAdapter().generarRespuesta(ENTRADA);
    const porNaN = await crearAdapter().generarRespuesta(ENTRADA);

    expect(porCadena.fidelidad).toBeUndefined();
    expect(porNulo.fidelidad).toBeUndefined();
    expect(porNaN.fidelidad).toBeUndefined();
  });

  it('texto vacío sigue invalidando AUN con fidelidad presente (el guard no se relaja)', async () => {
    stubFetch([
      {
        status: 200,
        contenido: JSON.stringify({ ...JSON.parse(JSON_LIMPIO), texto: '   ', fidelidad: 0.9 }),
      },
      {
        status: 200,
        contenido: JSON.stringify({ ...JSON.parse(JSON_LIMPIO), texto: '   ', fidelidad: 0.9 }),
      },
    ]);

    await expect(crearAdapter().generarRespuesta(ENTRADA)).rejects.toMatchObject({
      codigo: 'GENERADOR_RESPUESTA_INVALIDA',
    });
  });
});

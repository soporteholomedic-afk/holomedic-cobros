import type {
  EntradaDestilacion,
  EntradaGenerarRespuesta,
  ObservacionDestilada,
  RespuestaGenerada,
  TipoObservacionDestilada,
} from '../../domain/entities';
import type { GeneradorRespuestaPort } from '../../domain/ports';

/**
 * OpenAI-compatible LLM adapter for GeneradorRespuestaPort
 * (agente-ia-crm E2·T3) — the ONE locked adapter behind every
 * provider (Z.ai GLM now, Gemini later via E4 platform config): one
 * POST {urlBase}/chat/completions per call with Bearer auth, an
 * AbortController deadline, temperature 0.2 and max_tokens. This
 * adapter owns ALL prompt engineering; the prompts are in SPANISH
 * because their outputs are client-facing Spanish WhatsApp answers.
 *
 * Output handling: read choices[0].message.content (manually
 * narrowed), strip Markdown code fences, extract the FIRST balanced
 * JSON object/array, then guard-and-sanitize:
 * - generarRespuesta: texto required non-empty; scoreConfianza must
 *   be a finite number, clamped into [0, 1]; missing booleans coerce
 *   to the ESCALATION pair (enScope false / requiereAyudaHumana
 *   true — fail toward a human, never toward a fabricated answer);
 *   idsConocimiento filtered to the ids the caller provided.
 * - destilar: items with a tipo outside the 5-value catalog are
 *   DROPPED (not fatal — the model losing one item must not lose the
 *   exchange), titulo/contenido clamped to 60/300 chars, pinear kept
 *   true ONLY for acuerdo/compromiso.
 * - A JSON-validity failure retries ONCE with a system nudge; the
 *   second failure throws GENERADOR_RESPUESTA_INVALIDA.
 *
 * Errors (typed ErrorGeneradorCrm, mirroring ErrorMemoriaCrm):
 * GENERADOR_AUTH (HTTP 401/403), GENERADOR_TIMEOUT (abort),
 * GENERADOR_ERROR (other non-2xx / network), GENERADOR_RESPUESTA_
 * INVALIDA (malformed envelope or unparseable/unguardable JSON —
 * after the retry). GENERADOR_NO_CONFIGURADA is raised by the
 * factory's fail-closed adapter, never here.
 *
 * Security: consulta/respuesta bodies are PII and are NEVER logged;
 * the typed error `detalle` carries only modelo/HTTP status/codigo.
 */

/** Typed error surface of every GeneradorRespuestaPort adapter. */
export type CodigoErrorGenerador =
  | 'GENERADOR_NO_CONFIGURADA'
  | 'GENERADOR_AUTH'
  | 'GENERADOR_TIMEOUT'
  | 'GENERADOR_ERROR'
  | 'GENERADOR_RESPUESTA_INVALIDA';

/** One typed generator failure: `codigo` drives the caller's handling. */
export class ErrorGeneradorCrm extends Error {
  readonly codigo: CodigoErrorGenerador;
  readonly detalle: string;

  constructor(codigo: CodigoErrorGenerador, detalle: string) {
    super(`${codigo}: ${detalle}`);
    this.name = 'ErrorGeneradorCrm';
    this.codigo = codigo;
    this.detalle = detalle;
  }
}

/** Constructor config: endpoint, credentials, model and budgets. */
export interface ConfigGeneradorOpenAiCompatible {
  urlBase: string;
  apiKey: string;
  modelo: string;
  timeoutMs?: number;
  maxTokens?: number;
}

/** One chat message crossing to the endpoint (the nudge is a system role). */
interface MensajeChat {
  role: 'system' | 'user';
  content: string;
}

const TIMEOUT_POR_DEFECTO_MS = 30000;
const MAX_TOKENS_POR_DEFECTO = 700;
const TEMPERATURA = 0.2;

/** Distillation catalog (mirrors TipoObservacionDestilada). */
const TIPOS_DESTILACION: readonly TipoObservacionDestilada[] = [
  'hecho_cliente',
  'acuerdo',
  'compromiso',
  'preferencia',
  'objecion',
];

const TITULO_DESTILACION_MAX = 60;
const CONTENIDO_DESTILACION_MAX = 300;

/** System nudge appended on the ONE JSON-validity retry. */
const NUDGE_JSON = 'Respondé únicamente con JSON válido, sin texto adicional.';

const PROMPT_SISTEMA_GENERAR = [
  'Eres La Guía, la asistente de WhatsApp de Holomedic.',
  'Respondes ÚNICAMENTE con la información de los bloques CONOCIMIENTO y MEMORIAS provistos en el mensaje del usuario;',
  'si usas un fragmento de conocimiento, incluís su id en idsConocimiento.',
  'Tono cálido y cercano, respuesta concisa (máximo 120 palabras), texto plano apto para WhatsApp, sin markdown.',
  'Si la consulta no está cubierta por el CONOCIMIENTO ni las MEMORIAS, poné enScope=false y requiereAyudaHumana=true,',
  'y en texto una derivación corta y segura a una persona del equipo de Holomedic; nunca inventes información.',
  'scoreConfianza es tu confianza (entre 0 y 1) en que la respuesta está respaldada por lo provisto.',
  'Respondé ÚNICAMENTE con JSON válido, sin texto adicional, con esta forma exacta:',
  '{"texto": string, "scoreConfianza": number, "enScope": boolean, "requiereAyudaHumana": boolean, "idsConocimiento": number[]}',
  'y nada más.',
].join(' ');

const PROMPT_SISTEMA_DESTILAR = [
  'Eres el distilador de La Guía, la asistente de WhatsApp de Holomedic.',
  'Extraé del intercambio únicamente hechos duraderos: datos del cliente, acuerdos, compromisos, preferencias u objeciones;',
  'ignorá saludos y charla pasajera.',
  'Respondé ÚNICAMENTE con un array JSON válido, sin texto adicional, con esta forma exacta:',
  '[{"tipo": "hecho_cliente"|"acuerdo"|"compromiso"|"preferencia"|"objecion", "titulo": string (máximo 60 caracteres),',
  '"contenido": string (máximo 300 caracteres), "pinear": boolean}]',
  '— pinear=true solo para acuerdos y compromisos.',
  'Si no hay nada duradero, respondé [].',
].join(' ');

/** Redacted, user-safe rendering of an unknown thrown value. */
function detalleDe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function esAborto(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

function acotar(valor: number, minimo: number, maximo: number): number {
  return Math.min(maximo, Math.max(minimo, valor));
}

function esTipoDestilado(valor: unknown): valor is TipoObservacionDestilada {
  return typeof valor === 'string' && (TIPOS_DESTILACION as readonly string[]).includes(valor);
}

/** Labeled user message for generarRespuesta (PII-scrubbed upstream). */
function mensajeUsuarioGenerar(entrada: EntradaGenerarRespuesta): string {
  const historial =
    entrada.historial.length === 0
      ? '(vacío)'
      : entrada.historial.map((mensaje) => `[${mensaje.emisor}] ${mensaje.texto}`).join('\n');
  const conocimiento =
    entrada.conocimiento.length === 0
      ? '(vacío)'
      : entrada.conocimiento
          .map((fragmento) => `[id ${fragmento.id}] ${fragmento.titulo}\n${fragmento.contenido}`)
          .join('\n\n');
  const memorias =
    entrada.memorias.length === 0
      ? '(vacío)'
      : entrada.memorias
          .map((fragmento) => `[${fragmento.tipo}] ${fragmento.titulo}\n${fragmento.contenido}`)
          .join('\n\n');
  return [
    `CONSULTA:\n${entrada.consulta}`,
    `HISTORIAL:\n${historial}`,
    `CONOCIMIENTO:\n${conocimiento}`,
    `MEMORIAS:\n${memorias}`,
  ].join('\n\n');
}

/** Labeled user message for destilar (one exchange). */
function mensajeUsuarioDestilar(entrada: EntradaDestilacion): string {
  return `CONSULTA:\n${entrada.consulta}\n\nRESPUESTA:\n${entrada.respuesta}`;
}

/**
 * Strip Markdown code fences (```json … ``` / ``` … ```) so the JSON
 * scanner below sees the payload; fence markers can never be part of
 * the strict-JSON grammar.
 */
function quitarCercadosJson(contenido: string): string {
  return contenido.replace(/```[a-zA-Z]*\s*/g, '');
}

/**
 * Extract the FIRST balanced JSON object or array: string-aware depth
 * scan (escapes honored) from the first '{' or '[' to its matching
 * close — prose before/after (incl. fences) is ignored. Returns null
 * when no balanced value exists.
 */
function extraerPrimerJson(contenido: string): string | null {
  const inicio = contenido.search(/[{[]/);
  if (inicio === -1) return null;
  let profundidad = 0;
  let enCadena = false;
  let escapado = false;
  for (let i = inicio; i < contenido.length; i += 1) {
    const caracter = contenido[i] as string;
    if (enCadena) {
      if (escapado) escapado = false;
      else if (caracter === '\\') escapado = true;
      else if (caracter === '"') enCadena = false;
      continue;
    }
    if (caracter === '"') {
      enCadena = true;
    } else if (caracter === '{' || caracter === '[') {
      profundidad += 1;
    } else if (caracter === '}' || caracter === ']') {
      profundidad -= 1;
      if (profundidad === 0) return contenido.slice(inicio, i + 1);
    }
  }
  return null;
}

/**
 * Guard RespuestaGenerada: texto must be a non-empty string,
 * scoreConfianza a finite number (clamped); missing booleans coerce
 * to the ESCALATION defaults; idsConocimiento keeps only provided
 * ids. Returns null when the value cannot be salvaged (→ retry).
 */
function validarRespuestaGenerada(
  valor: unknown,
  idsValidos: Set<number>,
): RespuestaGenerada | null {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) return null;
  const crudo = valor as Record<string, unknown>;
  if (typeof crudo.texto !== 'string' || crudo.texto.trim() === '') return null;
  if (typeof crudo.scoreConfianza !== 'number' || !Number.isFinite(crudo.scoreConfianza)) {
    return null;
  }
  // Fail-safe coercion: an omitted boolean escalates, never answers blind.
  const enScope = typeof crudo.enScope === 'boolean' ? crudo.enScope : false;
  const requiereAyudaHumana =
    typeof crudo.requiereAyudaHumana === 'boolean' ? crudo.requiereAyudaHumana : true;
  const idsConocimiento = Array.isArray(crudo.idsConocimiento)
    ? crudo.idsConocimiento.filter(
        (id): id is number => typeof id === 'number' && Number.isFinite(id) && idsValidos.has(id),
      )
    : [];
  return {
    texto: crudo.texto.trim(),
    scoreConfianza: acotar(crudo.scoreConfianza, 0, 1),
    enScope,
    requiereAyudaHumana,
    idsConocimiento,
  };
}

/**
 * Guard ObservacionDestilada[]: a non-array is unsalvageable (null →
 * retry); inside the array, items with an unknown tipo, a non-object
 * shape or no titulo/contenido are DROPPED, lengths clamp, and pinear
 * survives only for acuerdo/compromiso.
 */
function validarObservacionesDestiladas(valor: unknown): ObservacionDestilada[] | null {
  if (Array.isArray(valor) === false) return null;
  const observaciones: ObservacionDestilada[] = [];
  for (const item of valor) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue;
    const crudo = item as Record<string, unknown>;
    if (esTipoDestilado(crudo.tipo) === false) continue;
    const titulo = typeof crudo.titulo === 'string' ? crudo.titulo.trim() : '';
    const contenido = typeof crudo.contenido === 'string' ? crudo.contenido.trim() : '';
    if (titulo === '' || contenido === '') continue;
    const tipo = crudo.tipo;
    observaciones.push({
      tipo,
      titulo: titulo.slice(0, TITULO_DESTILACION_MAX),
      contenido: contenido.slice(0, CONTENIDO_DESTILACION_MAX),
      pinear: crudo.pinear === true && (tipo === 'acuerdo' || tipo === 'compromiso'),
    });
  }
  return observaciones;
}

export class GeneradorOpenAiCompatible implements GeneradorRespuestaPort {
  private readonly urlBase: string;
  private readonly apiKey: string;
  private readonly modelo: string;
  private readonly timeoutMs: number;
  private readonly maxTokens: number;

  constructor(config: ConfigGeneradorOpenAiCompatible) {
    this.urlBase = config.urlBase.trim().replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.modelo = config.modelo;
    this.timeoutMs =
      config.timeoutMs !== undefined && Number.isFinite(config.timeoutMs) && config.timeoutMs > 0
        ? config.timeoutMs
        : TIMEOUT_POR_DEFECTO_MS;
    this.maxTokens =
      config.maxTokens !== undefined && Number.isFinite(config.maxTokens) && config.maxTokens > 0
        ? Math.round(config.maxTokens)
        : MAX_TOKENS_POR_DEFECTO;
  }

  async generarRespuesta(entrada: EntradaGenerarRespuesta): Promise<RespuestaGenerada> {
    const idsValidos = new Set(entrada.conocimiento.map((fragmento) => fragmento.id));
    return this.pedirJson(
      [
        { role: 'system', content: PROMPT_SISTEMA_GENERAR },
        { role: 'user', content: mensajeUsuarioGenerar(entrada) },
      ],
      (valor) => validarRespuestaGenerada(valor, idsValidos),
      'una respuesta',
    );
  }

  async destilar(entrada: EntradaDestilacion): Promise<ObservacionDestilada[]> {
    return this.pedirJson(
      [
        { role: 'system', content: PROMPT_SISTEMA_DESTILAR },
        { role: 'user', content: mensajeUsuarioDestilar(entrada) },
      ],
      validarObservacionesDestiladas,
      'observaciones destiladas',
    );
  }

  /**
   * One strict-JSON request with the single retry: `intentar` returns
   * null ONLY for a JSON-validity failure (parse or guard), which
   * retries once with the system nudge appended; every other failure
   * (auth/timeout/network/malformed envelope) throws immediately.
   */
  private async pedirJson<T>(
    mensajes: MensajeChat[],
    validar: (valor: unknown) => T | null,
    etiqueta: string,
  ): Promise<T> {
    let resultado = await this.intentar(mensajes, validar);
    if (resultado !== null) return resultado;
    resultado = await this.intentar([...mensajes, { role: 'system', content: NUDGE_JSON }], validar);
    if (resultado !== null) return resultado;
    throw new ErrorGeneradorCrm(
      'GENERADOR_RESPUESTA_INVALIDA',
      `el modelo ${this.modelo} no devolvió ${etiqueta} en JSON válido ni tras el reintento`,
    );
  }

  /** One HTTP round-trip: null ⇔ JSON-validity failure (retryable). */
  private async intentar<T>(
    mensajes: MensajeChat[],
    validar: (valor: unknown) => T | null,
  ): Promise<T | null> {
    const respuesta = await this.llamar(mensajes);
    if (respuesta.status === 401 || respuesta.status === 403) {
      throw new ErrorGeneradorCrm(
        'GENERADOR_AUTH',
        `el endpoint LLM respondió HTTP ${respuesta.status} (modelo ${this.modelo})`,
      );
    }
    if (respuesta.ok === false) {
      throw new ErrorGeneradorCrm(
        'GENERADOR_ERROR',
        `el endpoint LLM respondió HTTP ${respuesta.status} (modelo ${this.modelo})`,
      );
    }
    const contenido = await this.leerContenido(respuesta);
    const json = extraerPrimerJson(quitarCercadosJson(contenido));
    if (json === null) return null;
    let valor: unknown;
    try {
      valor = JSON.parse(json);
    } catch {
      return null;
    }
    return validar(valor);
  }

  /**
   * Narrow choices[0].message.content manually (no zod in this repo):
   * a malformed envelope (broken body JSON, no choices, no string
   * content) is NOT retryable — the reply cannot contain valid JSON.
   */
  private async leerContenido(respuesta: Response): Promise<string> {
    let datos: unknown;
    try {
      datos = await respuesta.json();
    } catch (error: unknown) {
      throw new ErrorGeneradorCrm(
        'GENERADOR_RESPUESTA_INVALIDA',
        `cuerpo no-JSON del endpoint LLM (modelo ${this.modelo}): ${detalleDe(error)}`,
      );
    }
    if (datos === null || typeof datos !== 'object') {
      throw new ErrorGeneradorCrm(
        'GENERADOR_RESPUESTA_INVALIDA',
        `la respuesta del modelo ${this.modelo} no es un objeto`,
      );
    }
    const choices = (datos as Record<string, unknown>).choices;
    if (Array.isArray(choices) === false || choices.length === 0) {
      throw new ErrorGeneradorCrm(
        'GENERADOR_RESPUESTA_INVALIDA',
        `la respuesta del modelo ${this.modelo} no trae choices`,
      );
    }
    const primera = choices[0];
    if (primera === null || typeof primera !== 'object') {
      throw new ErrorGeneradorCrm(
        'GENERADOR_RESPUESTA_INVALIDA',
        `la primera choice del modelo ${this.modelo} no es un objeto`,
      );
    }
    const mensaje = (primera as Record<string, unknown>).message;
    if (mensaje === null || typeof mensaje !== 'object') {
      throw new ErrorGeneradorCrm(
        'GENERADOR_RESPUESTA_INVALIDA',
        `la primera choice del modelo ${this.modelo} no trae message`,
      );
    }
    const contenido = (mensaje as Record<string, unknown>).content;
    if (typeof contenido !== 'string' || contenido.trim() === '') {
      throw new ErrorGeneradorCrm(
        'GENERADOR_RESPUESTA_INVALIDA',
        `la respuesta del modelo ${this.modelo} no trae message.content`,
      );
    }
    return contenido;
  }

  /** One HTTP call with its own AbortController deadline + Bearer auth. */
  private async llamar(mensajes: MensajeChat[]): Promise<Response> {
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), this.timeoutMs);
    try {
      return await fetch(`${this.urlBase}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.modelo,
          messages: mensajes,
          temperature: TEMPERATURA,
          max_tokens: this.maxTokens,
        }),
        signal: controlador.signal,
      });
    } catch (error: unknown) {
      if (esAborto(error)) {
        throw new ErrorGeneradorCrm(
          'GENERADOR_TIMEOUT',
          `el modelo ${this.modelo} no respondió en ${this.timeoutMs} ms`,
        );
      }
      throw new ErrorGeneradorCrm(
        'GENERADOR_ERROR',
        `fallo de red contra el endpoint LLM (modelo ${this.modelo}): ${detalleDe(error)}`,
      );
    } finally {
      clearTimeout(temporizador);
    }
  }
}

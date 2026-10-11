import type { GeneradorRespuestaPort } from '../../domain/ports';

import { ErrorGeneradorCrm, GeneradorOpenAiCompatible } from './generadorOpenAiCompatible';
import { GeneradorSimulado } from './generadorSimulado';

/**
 * Adapter factory for the LLM response-generator port (agente-ia-crm
 * E2·T3) — mirrors crearMemoriaConversacion EXACTLY, with LLM_API_KEY
 * as the single selector (no MODO knob: a key is either configured or
 * it is not). Env bootstrap only (E4 moves provider/model/key to DB +
 * admin UI); locked decision: one OpenAI-compatible adapter, Z.ai
 * glm-5.3-flash in dev AND prod, Gemini later via platform config:
 * - LLM_API_KEY set → GeneradorOpenAiCompatible, in ANY environment
 *   (development included — a reachable LLM is the real thing, not
 *   something to simulate around), configured from LLM_BASE_URL
 *   (default https://api.z.ai/api/paas/v4/), LLM_MODELO (default
 *   glm-5.3-flash), LLM_TIMEOUT_MS (default 30000) and LLM_MAX_TOKENS
 *   (default 700).
 * - unset (or empty) + development → simulator + ONE console.warn per
 *   process.
 * - unset (or empty) + production → FAILS CLOSED — an adapter whose
 *   every method rejects ErrorGeneradorCrm GENERADOR_NO_CONFIGURADA +
 *   ONE console.error per process explaining how to configure.
 *   Production never simulates silently: without an LLM key the
 *   generator errors visibly instead of faking answers.
 */

/**
 * Fail-closed adapter (production without LLM_API_KEY): every method
 * rejects with the same typed code — the E2 motor turns the rejection
 * into a safe deferral/escalation instead of a fabricated answer
 * (extraerIdentificacion included: E2·T9 identification fails closed
 * too — no auto-vinculación on a fabricated name).
 */
class GeneradorFailClosed implements GeneradorRespuestaPort {
  async generarRespuesta(): Promise<never> {
    throw this.error();
  }

  async destilar(): Promise<never> {
    throw this.error();
  }

  async extraerIdentificacion(): Promise<never> {
    throw this.error();
  }

  private error(): ErrorGeneradorCrm {
    return new ErrorGeneradorCrm(
      'GENERADOR_NO_CONFIGURADA',
      'Producción sin LLM_API_KEY: generación de respuestas deshabilitada (fail closed). ' +
        'Configurá LLM_API_KEY (y opcionalmente LLM_BASE_URL / LLM_MODELO) para conectar el LLM.',
    );
  }
}

/** Locked defaults (decision LLM E2): Z.ai GLM endpoint + model. */
const URL_BASE_POR_DEFECTO = 'https://api.z.ai/api/paas/v4/';
const MODELO_POR_DEFECTO = 'glm-5.3-flash';
const TIMEOUT_MS_POR_DEFECTO = 30000;
const MAX_TOKENS_POR_DEFECTO = 700;

function leerEnteroPositivo(crudo: string | undefined, porDefecto: number): number {
  if (crudo === undefined || crudo === '') return porDefecto;
  const parseado = Number(crudo);
  if (!Number.isFinite(parseado) || parseado <= 0) return porDefecto;
  return Math.round(parseado);
}

/** Non-empty string override or the locked default (empty → default). */
function leerTextoConDefault(crudo: string | undefined, porDefecto: string): string {
  return crudo !== undefined && crudo.trim() !== '' ? crudo : porDefecto;
}

/** Avisa el default UNA vez por proceso (la factory se llama por request). */
let avisoGeneradorDefaultMostrado = false;

function avisarGeneradorDefaultUnaVez(esProduccion: boolean): void {
  if (avisoGeneradorDefaultMostrado) return;
  avisoGeneradorDefaultMostrado = true;
  if (esProduccion) {
    console.error(
      '[crm-llm] PRODUCCIÓN sin LLM_API_KEY: la generación de respuestas está DESHABILITADA ' +
        '(fail closed, GENERADOR_NO_CONFIGURADA). Configurá LLM_API_KEY (+ LLM_BASE_URL / ' +
        'LLM_MODELO opcionales) para conectar el LLM.',
    );
    return;
  }
  console.warn('[crm-llm] generador simulado por defecto — seteá LLM_API_KEY al conectar el LLM');
}

export function crearGeneradorRespuesta(): GeneradorRespuestaPort {
  const apiKey = process.env.LLM_API_KEY;
  if (apiKey !== undefined && apiKey !== '') {
    return new GeneradorOpenAiCompatible({
      urlBase: leerTextoConDefault(process.env.LLM_BASE_URL, URL_BASE_POR_DEFECTO),
      apiKey,
      modelo: leerTextoConDefault(process.env.LLM_MODELO, MODELO_POR_DEFECTO),
      timeoutMs: leerEnteroPositivo(process.env.LLM_TIMEOUT_MS, TIMEOUT_MS_POR_DEFECTO),
      maxTokens: leerEnteroPositivo(process.env.LLM_MAX_TOKENS, MAX_TOKENS_POR_DEFECTO),
    });
  }
  if (process.env.NODE_ENV === 'production') {
    avisarGeneradorDefaultUnaVez(true);
    return new GeneradorFailClosed();
  }
  avisarGeneradorDefaultUnaVez(false);
  return new GeneradorSimulado();
}

/** Test-only: resetea el flag de aviso-una-vez entre tests. */
export function __resetAvisosGeneradorForTests(): void {
  avisoGeneradorDefaultMostrado = false;
}

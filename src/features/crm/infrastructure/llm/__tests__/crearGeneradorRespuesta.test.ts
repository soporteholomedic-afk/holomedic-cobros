import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetAvisosGeneradorForTests, crearGeneradorRespuesta } from '../crearGeneradorRespuesta';
import { GeneradorOpenAiCompatible } from '../generadorOpenAiCompatible';
import { GeneradorSimulado } from '../generadorSimulado';
import { ErrorGeneradorCrm } from '../generadorOpenAiCompatible';
import type { EntradaGenerarRespuesta } from '../../../domain/entities';

/**
 * Factory contract (agente-ia-crm E2·T3) — mirrors crearMemoriaConversacion
 * EXACTLY with LLM_API_KEY as the single selector:
 * - key present → GeneradorOpenAiCompatible in ANY environment, with the
 *   env-derived config (LLM_BASE_URL default https://api.z.ai/api/paas/v4/,
 *   LLM_MODELO default glm-5.3-flash, LLM_TIMEOUT_MS default 30000,
 *   LLM_MAX_TOKENS default 700).
 * - no key + development → GeneradorSimulado + ONE console.warn per process.
 * - no key + production → FAILS CLOSED — an adapter whose every method
 *   rejects ErrorGeneradorCrm GENERADOR_NO_CONFIGURADA + ONE console.error
 *   per process explaining how to configure. Production never simulates
 *   silently.
 */

const ENTRADA: EntradaGenerarRespuesta = {
  consulta: 'c',
  contactoNuevo: false,
  historial: [],
  conocimiento: [],
  memorias: [],
};

const JSON_OK = JSON.stringify({
  texto: 'ok',
  scoreConfianza: 0.5,
  enScope: true,
  requiereAyudaHumana: false,
  idsConocimiento: [],
});

interface LlamadaFetch {
  url: string;
  opciones: { headers?: Record<string, string>; body?: string };
}

/** Stubs global fetch capturing calls, always answering a valid body. */
function stubFetchExitoso() {
  const llamadas: LlamadaFetch[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown, opciones: { headers?: Record<string, string>; body?: string }) => {
      llamadas.push({ url: String(url), opciones });
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: JSON_OK } }] }),
      } as Response;
    }),
  );
  return llamadas;
}

beforeEach(() => {
  __resetAvisosGeneradorForTests();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('crearGeneradorRespuesta — selección de adapter (E2·T3)', () => {
  it('LLM_API_KEY presente → adapter real TAMBIÉN en producción, sin avisos', async () => {
    vi.stubEnv('LLM_API_KEY', 'k-real');
    vi.stubEnv('NODE_ENV', 'production');

    const generador = crearGeneradorRespuesta();

    expect(generador).toBeInstanceOf(GeneradorOpenAiCompatible);
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('la config por defecto llega al adapter: base Z.ai, modelo glm-5.3-flash, 700 tokens, Bearer', async () => {
    vi.stubEnv('LLM_API_KEY', 'k-real');
    vi.stubEnv('NODE_ENV', 'development');
    const llamadas = stubFetchExitoso();

    await crearGeneradorRespuesta().generarRespuesta(ENTRADA);

    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]?.url).toBe('https://api.z.ai/api/paas/v4/chat/completions');
    const cuerpo = JSON.parse(llamadas[0]?.opciones.body ?? '{}');
    expect(cuerpo.model).toBe('glm-5.3-flash');
    expect(cuerpo.max_tokens).toBe(700);
    expect(llamadas[0]?.opciones.headers?.Authorization).toBe('Bearer k-real');
  });

  it('LLM_BASE_URL / LLM_MODELO / LLM_MAX_TOKENS override la config por defecto', async () => {
    vi.stubEnv('LLM_API_KEY', 'k-real');
    vi.stubEnv('LLM_BASE_URL', 'https://otro.test/api/');
    vi.stubEnv('LLM_MODELO', 'modelo-probe');
    vi.stubEnv('LLM_MAX_TOKENS', '250');
    const llamadas = stubFetchExitoso();

    await crearGeneradorRespuesta().generarRespuesta(ENTRADA);

    expect(llamadas[0]?.url).toBe('https://otro.test/api/chat/completions');
    const cuerpo = JSON.parse(llamadas[0]?.opciones.body ?? '{}');
    expect(cuerpo.model).toBe('modelo-probe');
    expect(cuerpo.max_tokens).toBe(250);
  });

  it('sin key en development → simulado + console.warn UNA vez por proceso', () => {
    vi.stubEnv('LLM_API_KEY', '');
    vi.stubEnv('NODE_ENV', 'development');

    const generador = crearGeneradorRespuesta();

    expect(generador).toBeInstanceOf(GeneradorSimulado);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/LLM_API_KEY/));
    expect(console.error).not.toHaveBeenCalled();

    // Una segunda construcción NO repite el aviso (spam-free).
    crearGeneradorRespuesta();
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('sin key en production → FAIL CLOSED: ambos métodos rechazan GENERADOR_NO_CONFIGURADA + console.error una vez', async () => {
    vi.stubEnv('LLM_API_KEY', '');
    vi.stubEnv('NODE_ENV', 'production');

    const generador = crearGeneradorRespuesta();

    expect(generador).not.toBeInstanceOf(GeneradorSimulado);
    expect(generador).not.toBeInstanceOf(GeneradorOpenAiCompatible);
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/LLM_API_KEY/));
    expect(console.warn).not.toHaveBeenCalled();

    await expect(generador.generarRespuesta(ENTRADA)).rejects.toMatchObject({
      codigo: 'GENERADOR_NO_CONFIGURADA',
    });
    await expect(generador.destilar({ consulta: 'c', respuesta: 'r' })).rejects.toBeInstanceOf(
      ErrorGeneradorCrm,
    );
    await expect(generador.destilar({ consulta: 'c', respuesta: 'r' })).rejects.toMatchObject({
      codigo: 'GENERADOR_NO_CONFIGURADA',
    });
    // E2·T9: la identificación también falla cerrada.
    await expect(
      generador.extraerIdentificacion({ consulta: 'c', respuesta: 'r' }),
    ).rejects.toBeInstanceOf(ErrorGeneradorCrm);
    await expect(
      generador.extraerIdentificacion({ consulta: 'c', respuesta: 'r' }),
    ).rejects.toMatchObject({ codigo: 'GENERADOR_NO_CONFIGURADA' });

    // Una segunda construcción NO repite el error.
    crearGeneradorRespuesta();
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});

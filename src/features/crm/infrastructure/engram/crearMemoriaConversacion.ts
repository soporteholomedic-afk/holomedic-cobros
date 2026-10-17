import { resolverConfigMemoria } from '../../application/configMemoria';
import type { ConfigCrmRepository, MemoriaConversacionPort } from '../../domain/ports';

import { ErrorMemoriaCrm, MemoriaEngramHttp } from './memoriaEngramHttp';
import { MemoriaSimulada } from './memoriaSimulada';

/**
 * Adapter factory for the conversation-memory port (agente-ia-crm
 * E2·T2) — mirrors crearEnviadorWhatsapp EXACTLY, with ENGRAM_CRM_URL
 * as the single selector (no MODO knob: a memory URL is either
 * configured or it is not):
 * - ENGRAM_CRM_URL set → MemoriaEngramHttp, in ANY environment
 *   (development included — a locally reachable Engram is the real
 *   thing, not something to simulate around).
 * - unset (or empty) + development → simulator + ONE console.warn per
 *   process.
 * - unset (or empty) + production → FAILS CLOSED — an adapter whose
 *   every method rejects ErrorMemoriaCrm MEMORIA_NO_CONFIGURADA + ONE
 *   console.error per process explaining how to configure. Production
 *   never simulates silently: without Engram the memory errors
 *   visibly instead of faking a working memory.
 */

/**
 * Fail-closed adapter (production without ENGRAM_CRM_URL): every
 * method rejects with the same typed code — the E2 motor turns the
 * rejection into a no-memory degradation instead of a fake recall.
 */
class MemoriaFailClosed implements MemoriaConversacionPort {
  async contexto(): Promise<never> {
    throw this.error();
  }

  async buscar(): Promise<never> {
    throw this.error();
  }

  async guardar(): Promise<never> {
    throw this.error();
  }

  async pinear(): Promise<never> {
    throw this.error();
  }

  private error(): ErrorMemoriaCrm {
    return new ErrorMemoriaCrm(
      'MEMORIA_NO_CONFIGURADA',
      'Producción sin ENGRAM_CRM_URL: memoria de conversación deshabilitada (fail closed). ' +
        'Configurá ENGRAM_CRM_URL (y opcionalmente ENGRAM_CRM_TOKEN) para conectar Engram.',
    );
  }
}

/** Per-call HTTP timeout (ms); ENGRAM_CRM_TIMEOUT_MS overrides, default 5 s. */
const ENGRAM_CRM_TIMEOUT_MS_DEFAULT = 5000;

function leerEngramTimeoutMs(): number {
  const crudo = process.env.ENGRAM_CRM_TIMEOUT_MS;
  if (crudo === undefined || crudo === '') return ENGRAM_CRM_TIMEOUT_MS_DEFAULT;
  const parseado = Number(crudo);
  if (!Number.isFinite(parseado) || parseado <= 0) return ENGRAM_CRM_TIMEOUT_MS_DEFAULT;
  return parseado;
}

/** Avisa el default UNA vez por proceso (la factory se llama por request). */
let avisoMemoriaDefaultMostrado = false;

function avisarMemoriaDefaultUnaVez(esProduccion: boolean): void {
  if (avisoMemoriaDefaultMostrado) return;
  avisoMemoriaDefaultMostrado = true;
  if (esProduccion) {
    console.error(
      '[crm-memoria] PRODUCCIÓN sin ENGRAM_CRM_URL: la memoria de conversación está ' +
        'DESHABILITADA (fail closed, MEMORIA_NO_CONFIGURADA). Configurá ENGRAM_CRM_URL ' +
        '(+ ENGRAM_CRM_TOKEN opcional) para conectar Engram.',
    );
    return;
  }
  console.warn('[crm-memoria] memoria simulada por defecto — seteá ENGRAM_CRM_URL al conectar Engram');
}

export function crearMemoriaConversacion(): MemoriaConversacionPort {
  const urlBase = process.env.ENGRAM_CRM_URL;
  if (urlBase !== undefined && urlBase !== '') {
    return new MemoriaEngramHttp({
      urlBase,
      token: process.env.ENGRAM_CRM_TOKEN,
      timeoutMs: leerEngramTimeoutMs(),
    });
  }
  if (process.env.NODE_ENV === 'production') {
    avisarMemoriaDefaultUnaVez(true);
    return new MemoriaFailClosed();
  }
  avisarMemoriaDefaultUnaVez(false);
  return new MemoriaSimulada();
}

export interface DepsMemoriaConfigurable {
  /** Runtime config repo; when undefined the env behavior applies. */
  config?: Pick<ConfigCrmRepository, 'listar'>;
}

/**
 * Same selection rules as crearMemoriaConversacion over the effective
 * runtime config (DB over env, resolved per call — no cache).
 */
export async function crearMemoriaConversacionConfigurable(
  deps: DepsMemoriaConfigurable,
): Promise<MemoriaConversacionPort> {
  if (deps.config === undefined) return crearMemoriaConversacion();
  const config = await resolverConfigMemoria({ config: deps.config });
  if (config.url !== null && config.url !== '') {
    return new MemoriaEngramHttp({
      urlBase: config.url,
      token: config.token ?? undefined,
      timeoutMs: config.timeoutMs,
    });
  }
  if (process.env.NODE_ENV === 'production') {
    avisarMemoriaDefaultUnaVez(true);
    return new MemoriaFailClosed();
  }
  avisarMemoriaDefaultUnaVez(false);
  return new MemoriaSimulada();
}

/** Test-only: resetea el flag de aviso-una-vez entre tests. */
export function __resetAvisosMemoriaForTests(): void {
  avisoMemoriaDefaultMostrado = false;
}

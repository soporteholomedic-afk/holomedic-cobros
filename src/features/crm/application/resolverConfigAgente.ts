import type { ConfigCrmRepository } from '../domain/ports';
import { crearConfigAgente, type ConfigAgente } from './configAgente';

/**
 * Hot agent config (agente-ia-crm E5·T3): CRM_Config rows with the
 * `agente.` prefix override the AGENTE_* env per key, with env as the
 * fallback. The DB values are overlaid onto a synthetic env map and
 * parsed by `crearConfigAgente`, so an invalid DB value falls back to
 * env/default exactly like an invalid env var does today (and the
 * kill-switch semantics are identical). NOT cached on purpose: the
 * kill switch must bite on the very next run.
 */

/** DB keys of the editable agent config (shared with the admin API). */
export const CLAVES_CONFIG_AGENTE = {
  habilitado: 'agente.habilitado',
  umbralConfianza: 'agente.umbralConfianza',
  maxIntercambios: 'agente.maxIntercambios',
  horarioDesde: 'agente.horarioDesde',
  horarioHasta: 'agente.horarioHasta',
  textoEscalado: 'agente.textoEscalado',
} as const;

/** Prefix used to list every agent config row. */
export const PREFIJO_CONFIG_AGENTE = 'agente.';

/** DB key → AGENTE_* env name consumed by crearConfigAgente. */
const VARIABLE_POR_CLAVE: Record<string, string> = {
  [CLAVES_CONFIG_AGENTE.habilitado]: 'AGENTE_HABILITADO',
  [CLAVES_CONFIG_AGENTE.umbralConfianza]: 'AGENTE_UMBRAL_CONF',
  [CLAVES_CONFIG_AGENTE.maxIntercambios]: 'AGENTE_MAX_INTERCAMBIOS',
  [CLAVES_CONFIG_AGENTE.horarioDesde]: 'AGENTE_HORARIO_DESDE',
  [CLAVES_CONFIG_AGENTE.horarioHasta]: 'AGENTE_HORARIO_HASTA',
  [CLAVES_CONFIG_AGENTE.textoEscalado]: 'AGENTE_TEXTO_ESCALADO',
};

export interface ResolverConfigAgenteDeps {
  config: Pick<ConfigCrmRepository, 'listar'>;
}

type VariablesEntorno = Record<string, string | undefined>;

export async function resolverConfigAgente(
  deps: ResolverConfigAgenteDeps,
  env: VariablesEntorno = process.env,
): Promise<ConfigAgente> {
  try {
    const filas = await deps.config.listar(PREFIJO_CONFIG_AGENTE);
    const sintetico: VariablesEntorno = { ...env };
    for (const fila of filas) {
      const variable = VARIABLE_POR_CLAVE[fila.clave];
      if (variable === undefined || fila.esSecreto) continue;
      sintetico[variable] = fila.valor;
    }
    return crearConfigAgente(sintetico);
  } catch (error) {
    console.warn('[resolverConfigAgente] lectura de config en DB falló; se usa env', {
      error: error instanceof Error ? error.name : 'ERROR_DESCONOCIDO',
    });
    return crearConfigAgente(env);
  }
}

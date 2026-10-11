/**
 * Agent engine configuration (agente-ia-crm E2·T4) — the guardrail
 * knobs `generarRespuestaAgente` enforces. Every AGENTE_* env var is
 * OPTIONAL with a documented default; an invalid value never crashes
 * the process (a typo must not take the CRM down) — it falls back to
 * the default, EXCEPT AGENTE_HABILITADO which parses a closed truthy
 * set with kill-switch semantics: unset/empty keeps the agent ON,
 * 1/true/si/yes (case-insensitive) turn it ON and ANY other value
 * (0/false/no/garbage) turns it OFF — failing toward "a human
 * answers", never toward an unsupervised agent.
 *
 * `horarioDesde`/`horarioHasta` are LOCAL hours 0-23 (the server TZ —
 * the Lima wall clock, America/Lima). `hasta < desde` is NOT
 * "corrected" here: it is the overnight window (e.g. 20→06) and the
 * use case interprets the wrap.
 */

/** Env shape consumed by `crearConfigAgente` (process.env-compatible). */
type VariablesEntorno = Record<string, string | undefined>;

/** Resolved engine configuration — immutable value object. */
export interface ConfigAgente {
  /** Global kill switch (AGENTE_HABILITADO; default true). */
  habilitado: boolean;
  /** Minimum scoreConfianza to answer (AGENTE_UMBRAL_CONF; default 0.60, clamped into (0, 1]). */
  umbralConfianza: number;
  /** Max IA answers in ONE conversation before escalating (AGENTE_MAX_INTERCAMBIOS; default 8, >= 1). */
  maxIntercambios: number;
  /** Local hour the answer window opens (AGENTE_HORARIO_DESDE; default 8, 0-23). */
  horarioDesde: number;
  /** Local hour the window closes, exclusive (AGENTE_HORARIO_HASTA; default 18, 0-23; < desde = overnight wrap). */
  horarioHasta: number;
  /** Safe deferral text sent on every escalation (AGENTE_TEXTO_ESCALADO; default below). */
  textoEscalado: string;
}

/** KB fragments loaded into the prompt per answer (T1 ranker top-k). */
export const TOP_K_CONOCIMIENTO = 4;
/** Memory fragments loaded into the prompt per answer (contexto + buscar). */
export const TOP_K_MEMORIA = 5;
/** Max thread messages projected into the prompt (oldest→newest tail). */
export const MAX_HISTORIAL = 10;

const HABILITADO_POR_DEFECTO = true;
const UMBRAL_CONFIANZA_POR_DEFECTO = 0.6;
const MAX_INTERCAMBIOS_POR_DEFECTO = 8;
const HORARIO_DESDE_POR_DEFECTO = 8;
const HORARIO_HASTA_POR_DEFECTO = 18;
export const TEXTO_ESCALADO_POR_DEFECTO =
  'Gracias por tu consulta. En breve se comunica con vos una persona del equipo de Holomedic.';

/** Truthy spellings of AGENTE_HABILITADO (lowercased, trimmed). */
const VERDADEROS = new Set(['1', 'true', 'si', 'yes']);

/** Kill-switch parse: unset/empty → default ON; else only the closed truthy set is ON. */
function leerHabilitado(crudo: string | undefined): boolean {
  if (crudo === undefined || crudo === '') return HABILITADO_POR_DEFECTO;
  return VERDADEROS.has(crudo.trim().toLowerCase());
}

/** Confidence threshold in (0, 1]: garbage/<= 0 → default, > 1 → clamp to 1. */
function leerUmbralConfianza(crudo: string | undefined): number {
  if (crudo === undefined || crudo === '') return UMBRAL_CONFIANZA_POR_DEFECTO;
  const valor = Number(crudo);
  if (!Number.isFinite(valor) || valor <= 0) return UMBRAL_CONFIANZA_POR_DEFECTO;
  return Math.min(valor, 1);
}

/** Integer in [minimo, maximo]: garbage or out of range → default, decimals rounded. */
function leerEnteroEnRango(
  crudo: string | undefined,
  porDefecto: number,
  minimo: number,
  maximo: number,
): number {
  if (crudo === undefined || crudo === '') return porDefecto;
  const valor = Number(crudo);
  if (!Number.isFinite(valor) || valor < minimo || valor > maximo) return porDefecto;
  return Math.round(valor);
}

/** Non-empty string override or the default (empty/whitespace → default). */
function leerTextoConDefault(crudo: string | undefined, porDefecto: string): string {
  return crudo !== undefined && crudo.trim() !== '' ? crudo : porDefecto;
}

/**
 * Build the engine config from env (defaults + validation as documented
 * above). `env` is injectable so tests stay deterministic; the default
 * reads the live process env.
 */
export function crearConfigAgente(env: VariablesEntorno = process.env): ConfigAgente {
  return {
    habilitado: leerHabilitado(env.AGENTE_HABILITADO),
    umbralConfianza: leerUmbralConfianza(env.AGENTE_UMBRAL_CONF),
    maxIntercambios: leerEnteroEnRango(
      env.AGENTE_MAX_INTERCAMBIOS,
      MAX_INTERCAMBIOS_POR_DEFECTO,
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    horarioDesde: leerEnteroEnRango(env.AGENTE_HORARIO_DESDE, HORARIO_DESDE_POR_DEFECTO, 0, 23),
    horarioHasta: leerEnteroEnRango(env.AGENTE_HORARIO_HASTA, HORARIO_HASTA_POR_DEFECTO, 0, 23),
    textoEscalado: leerTextoConDefault(env.AGENTE_TEXTO_ESCALADO, TEXTO_ESCALADO_POR_DEFECTO),
  };
}

import type { EntradaConfigCrm, FuenteConfig, VistaSecretoConfig } from '../domain/entities';
import type { ConfigCrmRepository } from '../domain/ports';
import { cifrarSecreto } from '../infrastructure/config/cifradoSecretos';

import {
  codigoErrorConfig,
  leerSecretoDb,
  vistaDeSecreto,
  type DepsProbe,
  type ResultadoProbe,
} from './configCanalKapso';

/**
 * Runtime-editable conversation-memory (Engram) config (agente-ia-crm
 * E5·T5a): CRM_Config rows with the `memoria.` prefix override the
 * ENGRAM_CRM_* env per key. Same contract as the Kapso channel config:
 * the token is encrypted before reaching the repo and only exposed to the
 * admin as presence + mask.
 */

export const CLAVES_CONFIG_MEMORIA = {
  url: 'memoria.url',
  token: 'memoria.token',
  timeoutMs: 'memoria.timeoutMs',
  retencionMeses: 'memoria.retencionMeses',
} as const;

export const PREFIJO_CONFIG_MEMORIA = 'memoria.';

export type CampoMemoria = keyof typeof CLAVES_CONFIG_MEMORIA;

const VARIABLE_ENTORNO = {
  url: 'ENGRAM_CRM_URL',
  token: 'ENGRAM_CRM_TOKEN',
  timeoutMs: 'ENGRAM_CRM_TIMEOUT_MS',
} as const;

const ORDEN_CAMPOS: readonly CampoMemoria[] = ['url', 'timeoutMs', 'retencionMeses', 'token'];

const TIMEOUT_MS_POR_DEFECTO = 5000;
const TIMEOUT_MS_MINIMO = 1000;
const TIMEOUT_MS_MAXIMO = 60000;
const RETENCION_MESES_POR_DEFECTO = 12;
const RETENCION_MESES_MINIMA = 1;
const RETENCION_MESES_MAXIMA = 120;
const LARGO_MAXIMO_TOKEN = 500;
const LARGO_MAXIMO_URL = 500;
const PROBE_TIMEOUT_MS = 5000;

type VariablesEntorno = Record<string, string | undefined>;

/** Effective (plain) memory config. NEVER serialize this to the admin. */
export interface ConfigMemoria {
  url: string | null;
  token: string | null;
  timeoutMs: number;
  retencionMeses: number;
}

export interface VistaMemoria {
  config: {
    url: string | null;
    timeoutMs: number;
    retencionMeses: number;
    token: VistaSecretoConfig;
  };
  fuentes: Record<CampoMemoria, FuenteConfig>;
}

export interface CambiosConfigMemoria {
  url?: string;
  timeoutMs?: number;
  retencionMeses?: number;
  /** '' or omitted keeps the current value; null deletes it. */
  token?: string | null;
}

export class ErrorConfigMemoriaInvalida extends Error {
  constructor(
    readonly campo: CampoMemoria,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorConfigMemoriaInvalida';
  }
}

function textoEnv(env: VariablesEntorno, nombre: string): string | null {
  const valor = env[nombre]?.trim();
  return valor ? valor : null;
}

function enteroPositivo(crudo: string | undefined): number | null {
  if (crudo === undefined || crudo.trim() === '') return null;
  const parseado = Number(crudo);
  return Number.isFinite(parseado) && parseado > 0 ? parseado : null;
}

function retencionValida(crudo: string | undefined): number | null {
  const parseado = enteroPositivo(crudo);
  return parseado !== null &&
    Number.isInteger(parseado) &&
    parseado >= RETENCION_MESES_MINIMA &&
    parseado <= RETENCION_MESES_MAXIMA
    ? parseado
    : null;
}

function filaPlana(
  porClave: Map<string, EntradaConfigCrm>,
  campo: CampoMemoria,
): string | null {
  const fila = porClave.get(CLAVES_CONFIG_MEMORIA[campo]);
  return fila && !fila.esSecreto ? fila.valor : null;
}

function resolverDesdeFilas(filas: EntradaConfigCrm[], env: VariablesEntorno) {
  const porClave = new Map(filas.map((fila) => [fila.clave, fila]));
  const token = leerSecretoDb(porClave.get(CLAVES_CONFIG_MEMORIA.token), env);

  const urlDb = filaPlana(porClave, 'url')?.trim() || null;
  const urlEnv = textoEnv(env, VARIABLE_ENTORNO.url);
  const timeoutDb = enteroPositivo(filaPlana(porClave, 'timeoutMs') ?? undefined);
  const timeoutEnv = enteroPositivo(env[VARIABLE_ENTORNO.timeoutMs]);
  const retencionDb = retencionValida(filaPlana(porClave, 'retencionMeses') ?? undefined);
  const tokenEnv = textoEnv(env, VARIABLE_ENTORNO.token);

  const config: ConfigMemoria = {
    url: urlDb ?? urlEnv,
    token: token.valor ?? tokenEnv,
    timeoutMs: timeoutDb ?? timeoutEnv ?? TIMEOUT_MS_POR_DEFECTO,
    retencionMeses: retencionDb ?? RETENCION_MESES_POR_DEFECTO,
  };
  const fuentes: Record<CampoMemoria, FuenteConfig> = {
    url: urlDb !== null ? 'db' : urlEnv !== null ? 'env' : 'default',
    timeoutMs: timeoutDb !== null ? 'db' : timeoutEnv !== null ? 'env' : 'default',
    retencionMeses: retencionDb !== null ? 'db' : 'default',
    token: token.enDb ? 'db' : tokenEnv !== null ? 'env' : 'default',
  };
  return { config, token, tokenEnv, fuentes };
}

export interface ResolverConfigMemoriaDeps {
  config: Pick<ConfigCrmRepository, 'listar'>;
}

/** Effective config: DB over env; DB or decrypt failures fall back to env (code-only warn). */
export async function resolverConfigMemoria(
  deps: ResolverConfigMemoriaDeps,
  env: VariablesEntorno = process.env,
): Promise<ConfigMemoria> {
  let filas: EntradaConfigCrm[];
  try {
    filas = await deps.config.listar(PREFIJO_CONFIG_MEMORIA);
  } catch (error) {
    console.warn('[resolverConfigMemoria] lectura de config en DB falló; se usa env', {
      error: codigoErrorConfig(error),
    });
    filas = [];
  }
  const resolucion = resolverDesdeFilas(filas, env);
  if (resolucion.token.codigoError !== undefined) {
    console.warn('[resolverConfigMemoria] secreto ilegible en DB; se usa env', {
      clave: CLAVES_CONFIG_MEMORIA.token,
      error: resolucion.token.codigoError,
    });
  }
  return resolucion.config;
}

/** Admin view: plain fields + masked token + per-key source. */
export async function leerVistaMemoria(
  deps: ResolverConfigMemoriaDeps,
  env: VariablesEntorno = process.env,
): Promise<VistaMemoria> {
  const filas = await deps.config.listar(PREFIJO_CONFIG_MEMORIA);
  const { config, token, tokenEnv, fuentes } = resolverDesdeFilas(filas, env);
  return {
    config: {
      url: config.url,
      timeoutMs: config.timeoutMs,
      retencionMeses: config.retencionMeses,
      token: vistaDeSecreto(token, tokenEnv),
    },
    fuentes,
  };
}

function validarUrl(valor: unknown): string {
  const invalida = (mensaje: string): ErrorConfigMemoriaInvalida =>
    new ErrorConfigMemoriaInvalida('url', mensaje);
  if (typeof valor !== 'string' || valor.trim() === '') throw invalida('url no puede estar vacía');
  const recortada = valor.trim();
  if (recortada.length > LARGO_MAXIMO_URL) {
    throw invalida(`url excede ${LARGO_MAXIMO_URL} caracteres`);
  }
  let analizada: URL;
  try {
    analizada = new URL(recortada);
  } catch {
    throw invalida('url no es válida');
  }
  if (analizada.protocol !== 'http:' && analizada.protocol !== 'https:') {
    throw invalida('url debe usar http o https');
  }
  if (analizada.username !== '' || analizada.password !== '') {
    throw invalida('url no puede incluir credenciales');
  }
  return recortada;
}

export interface GuardarConfigMemoriaDeps {
  config: Pick<ConfigCrmRepository, 'guardarVarios' | 'eliminar'>;
  env?: VariablesEntorno;
}

export class GuardarConfigMemoriaUseCase {
  constructor(private readonly deps: GuardarConfigMemoriaDeps) {}

  async guardar(cambios: CambiosConfigMemoria, usuario: string): Promise<void> {
    const env = this.deps.env ?? process.env;
    const lote: Array<{ clave: string; valor: string; esSecreto: boolean }> = [];
    const eliminar: string[] = [];

    for (const campo of ORDEN_CAMPOS) {
      if (campo === 'url' && cambios.url !== undefined) {
        lote.push({ clave: CLAVES_CONFIG_MEMORIA.url, valor: validarUrl(cambios.url), esSecreto: false });
      }
      if (campo === 'timeoutMs' && cambios.timeoutMs !== undefined) {
        const valor: unknown = cambios.timeoutMs;
        if (
          typeof valor !== 'number' ||
          !Number.isInteger(valor) ||
          valor < TIMEOUT_MS_MINIMO ||
          valor > TIMEOUT_MS_MAXIMO
        ) {
          throw new ErrorConfigMemoriaInvalida(
            'timeoutMs',
            `timeoutMs debe ser un entero entre ${TIMEOUT_MS_MINIMO} y ${TIMEOUT_MS_MAXIMO}`,
          );
        }
        lote.push({ clave: CLAVES_CONFIG_MEMORIA.timeoutMs, valor: String(valor), esSecreto: false });
      }
      if (campo === 'retencionMeses' && cambios.retencionMeses !== undefined) {
        const valor: unknown = cambios.retencionMeses;
        if (
          typeof valor !== 'number' ||
          !Number.isInteger(valor) ||
          valor < RETENCION_MESES_MINIMA ||
          valor > RETENCION_MESES_MAXIMA
        ) {
          throw new ErrorConfigMemoriaInvalida(
            'retencionMeses',
            `retencionMeses debe ser un entero entre ${RETENCION_MESES_MINIMA} y ${RETENCION_MESES_MAXIMA}`,
          );
        }
        lote.push({
          clave: CLAVES_CONFIG_MEMORIA.retencionMeses,
          valor: String(valor),
          esSecreto: false,
        });
      }
      if (campo === 'token') {
        const valor: unknown = cambios.token;
        if (valor === null) {
          eliminar.push(CLAVES_CONFIG_MEMORIA.token);
        } else if (valor !== undefined && valor !== '') {
          if (typeof valor !== 'string' || valor.trim() === '') {
            throw new ErrorConfigMemoriaInvalida('token', 'token no puede estar en blanco');
          }
          const recortado = valor.trim();
          if (recortado.length > LARGO_MAXIMO_TOKEN) {
            throw new ErrorConfigMemoriaInvalida(
              'token',
              `token excede ${LARGO_MAXIMO_TOKEN} caracteres`,
            );
          }
          // Encrypt BEFORE any write: a missing key aborts with nothing persisted.
          lote.push({
            clave: CLAVES_CONFIG_MEMORIA.token,
            valor: cifrarSecreto(recortado, env),
            esSecreto: true,
          });
        }
      }
    }

    if (lote.length > 0) await this.deps.config.guardarVarios(lote, usuario);
    for (const clave of eliminar) await this.deps.config.eliminar({ clave, usuario });
  }
}

/** Engram answers 404 {code:'unknown_project'} for a project with no data yet: reachable. */
async function esProyectoDesconocido(respuesta: Response): Promise<boolean> {
  if (respuesta.status !== 404) return false;
  try {
    const cuerpo = (await respuesta.json()) as { code?: unknown };
    return cuerpo.code === 'unknown_project';
  } catch {
    return false;
  }
}

/**
 * Probe Engram with the lightest real read the adapter uses: `GET /context`
 * for a throwaway project (404 unknown_project is the normal
 * "reachable" answer). Messages are generic: no token, no provider body.
 */
export async function probarMemoria(
  config: ConfigMemoria,
  deps: DepsProbe = {},
): Promise<ResultadoProbe> {
  if (config.url === null) {
    return { ok: false, detalle: 'Falta la URL de Engram' };
  }
  const fetchBase = deps.fetch ?? globalThis.fetch;
  const timeoutMs = Math.min(deps.timeoutMs ?? PROBE_TIMEOUT_MS, PROBE_TIMEOUT_MS);
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), timeoutMs);
  const headers: Record<string, string> = {};
  if (config.token !== null) headers.Authorization = `Bearer ${config.token}`;
  try {
    const base = config.url.replace(/\/+$/, '');
    const respuesta = await fetchBase(`${base}/context?project=crm-probe`, {
      method: 'GET',
      headers,
      signal: controlador.signal,
    });
    if (respuesta.status === 401 || respuesta.status === 403) {
      return { ok: false, detalle: 'Engram rechazó las credenciales (revisá el token)' };
    }
    if (respuesta.ok || (await esProyectoDesconocido(respuesta))) {
      return { ok: true, detalle: 'Conexión con Engram verificada' };
    }
    return { ok: false, detalle: 'Engram respondió con un error' };
  } catch (error) {
    if (controlador.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
      return { ok: false, detalle: 'Engram no respondió a tiempo' };
    }
    return { ok: false, detalle: 'No se pudo conectar con Engram' };
  } finally {
    clearTimeout(temporizador);
  }
}

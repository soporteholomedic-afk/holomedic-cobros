import { randomBytes } from 'node:crypto';

import { GraphApiError, WhatsAppClient } from '@kapso/whatsapp-cloud-api';

import type { EntradaConfigCrm, FuenteConfig, VistaSecretoConfig } from '../domain/entities';
import type { ConfigCrmRepository } from '../domain/ports';
import {
  cifrarSecreto,
  descifrarSecreto,
  enmascararSecreto,
  ErrorCifradoConfig,
} from '../infrastructure/config/cifradoSecretos';

/**
 * Runtime-editable Kapso channel config (agente-ia-crm E5·T5a): CRM_Config
 * rows with the `canal.kapso.` prefix override the KAPSO_* env per key, with
 * env as the fallback. Secrets (`apiKey`, `webhookSecret`) are stored
 * ENCRYPTED by `cifrarSecreto` BEFORE reaching the repo, are decrypted only
 * inside `resolverConfigCanalKapso` (server-side effective config) and are
 * never exposed to the admin: the view only carries presence + mask. Error
 * logs carry the error CODE only.
 */

export const CLAVES_CONFIG_CANAL_KAPSO = {
  modo: 'canal.kapso.modo',
  apiKey: 'canal.kapso.apiKey',
  phoneNumberId: 'canal.kapso.phoneNumberId',
  webhookSecret: 'canal.kapso.webhookSecret',
  timeoutMs: 'canal.kapso.timeoutMs',
} as const;

export const PREFIJO_CONFIG_CANAL_KAPSO = 'canal.kapso.';

export type CampoCanalKapso = keyof typeof CLAVES_CONFIG_CANAL_KAPSO;
export type ModoKapso = 'real' | 'simulado';

const CAMPOS_SECRETOS: ReadonlyArray<'apiKey' | 'webhookSecret'> = ['apiKey', 'webhookSecret'];

const VARIABLE_ENTORNO: Record<CampoCanalKapso, string> = {
  modo: 'KAPSO_MODO',
  apiKey: 'KAPSO_API_KEY',
  phoneNumberId: 'KAPSO_PHONE_NUMBER_ID',
  webhookSecret: 'KAPSO_WEBHOOK_SECRET',
  timeoutMs: 'KAPSO_TIMEOUT_MS',
};

const ORDEN_CAMPOS: readonly CampoCanalKapso[] = [
  'modo',
  'phoneNumberId',
  'timeoutMs',
  'apiKey',
  'webhookSecret',
];

const TIMEOUT_MS_POR_DEFECTO = 15000;
const TIMEOUT_MS_MINIMO = 1000;
const TIMEOUT_MS_MAXIMO = 60000;
const LARGO_MAXIMO_SECRETO = 500;
const BYTES_WEBHOOK_SECRET = 32;
const KAPSO_BASE_URL = 'https://api.kapso.ai/meta/whatsapp';
const PROBE_TIMEOUT_MS = 5000;
const RE_PHONE_NUMBER_ID = /^\d{5,32}$/;

type VariablesEntorno = Record<string, string | undefined>;

/** Effective (plain) Kapso config. NEVER serialize this to the admin. */
export interface ConfigCanalKapso {
  /** null = unset: the adapter factory decides by environment. */
  modo: ModoKapso | null;
  apiKey: string | null;
  phoneNumberId: string | null;
  webhookSecret: string | null;
  timeoutMs: number;
}

export interface VistaCanalKapso {
  config: {
    modo: ModoKapso | null;
    phoneNumberId: string | null;
    timeoutMs: number;
    apiKey: VistaSecretoConfig;
    webhookSecret: VistaSecretoConfig;
  };
  fuentes: Record<CampoCanalKapso, FuenteConfig>;
}

export interface CambiosConfigCanalKapso {
  modo?: ModoKapso;
  phoneNumberId?: string;
  timeoutMs?: number;
  /** '' or omitted keeps the current value; null deletes it. */
  apiKey?: string | null;
  webhookSecret?: string | null;
  /** Generate a fresh webhook secret (exclusive with `webhookSecret`). */
  regenerarWebhookSecret?: boolean;
}

export interface ResultadoGuardarCanalKapso {
  /** Plaintext of a regenerated webhook secret: returned ONCE, never again. */
  webhookSecretGenerado?: string;
}

export class ErrorConfigCanalInvalida extends Error {
  constructor(
    readonly campo: CampoCanalKapso,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorConfigCanalInvalida';
  }
}

/** Safe-to-log code of any thrown value (never the message). */
export function codigoErrorConfig(error: unknown): string {
  if (error instanceof ErrorCifradoConfig) return error.codigo;
  return error instanceof Error ? error.name : 'ERROR_DESCONOCIDO';
}

export interface LecturaSecretoDb {
  enDb: boolean;
  /** Decrypted value; only when the row exists and decrypts. */
  valor?: string;
  ilegible: boolean;
  codigoError?: string;
}

/** Decrypt one secret row without ever throwing or logging. */
export function leerSecretoDb(
  fila: EntradaConfigCrm | undefined,
  env: VariablesEntorno,
): LecturaSecretoDb {
  if (fila === undefined || !fila.esSecreto) return { enDb: false, ilegible: false };
  try {
    return { enDb: true, valor: descifrarSecreto(fila.valor, env), ilegible: false };
  } catch (error) {
    return { enDb: true, ilegible: true, codigoError: codigoErrorConfig(error) };
  }
}

/** Admin view of one secret: presence + mask, never the value. */
export function vistaDeSecreto(
  lectura: LecturaSecretoDb,
  valorEnv: string | null,
): VistaSecretoConfig {
  if (lectura.enDb) {
    return lectura.ilegible
      ? { configurado: true, mascara: '', ilegible: true }
      : { configurado: true, mascara: enmascararSecreto(lectura.valor) };
  }
  if (valorEnv !== null) return { configurado: true, mascara: enmascararSecreto(valorEnv) };
  return { configurado: false, mascara: '' };
}

function textoEnv(env: VariablesEntorno, nombre: string): string | null {
  const valor = env[nombre]?.trim();
  return valor ? valor : null;
}

function esModo(valor: unknown): valor is ModoKapso {
  return valor === 'real' || valor === 'simulado';
}

function timeoutValido(crudo: string | undefined): number | null {
  if (crudo === undefined || crudo.trim() === '') return null;
  const parseado = Number(crudo);
  return Number.isFinite(parseado) && parseado > 0 ? parseado : null;
}

interface Resolucion {
  config: ConfigCanalKapso;
  secretos: Record<'apiKey' | 'webhookSecret', LecturaSecretoDb>;
  fuentes: Record<CampoCanalKapso, FuenteConfig>;
}

function resolverDesdeFilas(filas: EntradaConfigCrm[], env: VariablesEntorno): Resolucion {
  const porClave = new Map(filas.map((fila) => [fila.clave, fila]));
  const fila = (campo: CampoCanalKapso): EntradaConfigCrm | undefined =>
    porClave.get(CLAVES_CONFIG_CANAL_KAPSO[campo]);
  const secretos = {
    apiKey: leerSecretoDb(fila('apiKey'), env),
    webhookSecret: leerSecretoDb(fila('webhookSecret'), env),
  };

  const modoEnv = textoEnv(env, VARIABLE_ENTORNO.modo);
  const filaModo = fila('modo');
  const modoDb = filaModo && !filaModo.esSecreto && esModo(filaModo.valor) ? filaModo.valor : null;
  const filaFono = fila('phoneNumberId');
  const fonoDb = filaFono && !filaFono.esSecreto && filaFono.valor.trim() !== '' ? filaFono.valor.trim() : null;
  const filaTimeout = fila('timeoutMs');
  const timeoutDb = filaTimeout && !filaTimeout.esSecreto ? timeoutValido(filaTimeout.valor) : null;
  const timeoutEnv = timeoutValido(env[VARIABLE_ENTORNO.timeoutMs]);

  const config: ConfigCanalKapso = {
    modo: modoDb ?? (esModo(modoEnv) ? modoEnv : null),
    apiKey: secretos.apiKey.valor ?? textoEnv(env, VARIABLE_ENTORNO.apiKey),
    phoneNumberId: fonoDb ?? textoEnv(env, VARIABLE_ENTORNO.phoneNumberId),
    webhookSecret: secretos.webhookSecret.valor ?? textoEnv(env, VARIABLE_ENTORNO.webhookSecret),
    timeoutMs: timeoutDb ?? timeoutEnv ?? TIMEOUT_MS_POR_DEFECTO,
  };

  const enDb: Record<CampoCanalKapso, boolean> = {
    modo: modoDb !== null,
    phoneNumberId: fonoDb !== null,
    timeoutMs: timeoutDb !== null,
    apiKey: secretos.apiKey.enDb,
    webhookSecret: secretos.webhookSecret.enDb,
  };
  const enEnv: Record<CampoCanalKapso, boolean> = {
    modo: esModo(modoEnv),
    phoneNumberId: textoEnv(env, VARIABLE_ENTORNO.phoneNumberId) !== null,
    timeoutMs: timeoutEnv !== null,
    apiKey: textoEnv(env, VARIABLE_ENTORNO.apiKey) !== null,
    webhookSecret: textoEnv(env, VARIABLE_ENTORNO.webhookSecret) !== null,
  };
  const fuentes = {} as Record<CampoCanalKapso, FuenteConfig>;
  for (const campo of ORDEN_CAMPOS) {
    fuentes[campo] = enDb[campo] ? 'db' : enEnv[campo] ? 'env' : 'default';
  }
  return { config, secretos, fuentes };
}

export interface ResolverConfigCanalKapsoDeps {
  config: Pick<ConfigCrmRepository, 'listar'>;
}

function envCanalKapso(env: VariablesEntorno): ConfigCanalKapso {
  return resolverDesdeFilas([], env).config;
}

/**
 * Effective config: DB over env, env as the fallback per key. A DB read
 * failure or an undecryptable secret falls back to env (code-only warn).
 */
export async function resolverConfigCanalKapso(
  deps: ResolverConfigCanalKapsoDeps,
  env: VariablesEntorno = process.env,
): Promise<ConfigCanalKapso> {
  let filas: EntradaConfigCrm[];
  try {
    filas = await deps.config.listar(PREFIJO_CONFIG_CANAL_KAPSO);
  } catch (error) {
    console.warn('[resolverConfigCanalKapso] lectura de config en DB falló; se usa env', {
      error: codigoErrorConfig(error),
    });
    return envCanalKapso(env);
  }
  const resolucion = resolverDesdeFilas(filas, env);
  for (const campo of CAMPOS_SECRETOS) {
    const codigo = resolucion.secretos[campo].codigoError;
    if (codigo !== undefined) {
      console.warn('[resolverConfigCanalKapso] secreto ilegible en DB; se usa env', {
        clave: CLAVES_CONFIG_CANAL_KAPSO[campo],
        error: codigo,
      });
    }
  }
  return resolucion.config;
}

/** Admin view: plain fields + masked secrets + per-key source. */
export async function leerVistaCanalKapso(
  deps: ResolverConfigCanalKapsoDeps,
  env: VariablesEntorno = process.env,
): Promise<VistaCanalKapso> {
  const filas = await deps.config.listar(PREFIJO_CONFIG_CANAL_KAPSO);
  const { config, secretos, fuentes } = resolverDesdeFilas(filas, env);
  return {
    config: {
      modo: config.modo,
      phoneNumberId: config.phoneNumberId,
      timeoutMs: config.timeoutMs,
      apiKey: vistaDeSecreto(secretos.apiKey, textoEnv(env, VARIABLE_ENTORNO.apiKey)),
      webhookSecret: vistaDeSecreto(
        secretos.webhookSecret,
        textoEnv(env, VARIABLE_ENTORNO.webhookSecret),
      ),
    },
    fuentes,
  };
}

/** 32 random bytes, hex encoded (64 chars). */
export function generarWebhookSecret(): string {
  return randomBytes(BYTES_WEBHOOK_SECRET).toString('hex');
}

export interface GuardarConfigCanalKapsoDeps {
  config: Pick<ConfigCrmRepository, 'guardarVarios' | 'eliminar'>;
  env?: VariablesEntorno;
  generarSecreto?: () => string;
}

type AccionSecreto = { tipo: 'guardar'; valor: string } | { tipo: 'eliminar' } | { tipo: 'mantener' };

function validarSecreto(campo: 'apiKey' | 'webhookSecret', valor: unknown): AccionSecreto {
  if (valor === undefined || valor === '') return { tipo: 'mantener' };
  if (valor === null) return { tipo: 'eliminar' };
  if (typeof valor !== 'string' || valor.trim() === '') {
    throw new ErrorConfigCanalInvalida(campo, `${campo} no puede estar en blanco`);
  }
  const recortado = valor.trim();
  if (recortado.length > LARGO_MAXIMO_SECRETO) {
    throw new ErrorConfigCanalInvalida(campo, `${campo} excede ${LARGO_MAXIMO_SECRETO} caracteres`);
  }
  return { tipo: 'guardar', valor: recortado };
}

export class GuardarConfigCanalKapsoUseCase {
  constructor(private readonly deps: GuardarConfigCanalKapsoDeps) {}

  async guardar(
    cambios: CambiosConfigCanalKapso,
    usuario: string,
  ): Promise<ResultadoGuardarCanalKapso> {
    const env = this.deps.env ?? process.env;
    const noSecretos: Array<{ clave: string; valor: string }> = [];

    if (cambios.modo !== undefined) {
      const modo: unknown = cambios.modo;
      if (!esModo(modo)) throw new ErrorConfigCanalInvalida('modo', "modo debe ser 'real' o 'simulado'");
      noSecretos.push({ clave: CLAVES_CONFIG_CANAL_KAPSO.modo, valor: modo });
    }
    if (cambios.phoneNumberId !== undefined) {
      const valor: unknown = cambios.phoneNumberId;
      if (typeof valor !== 'string' || !RE_PHONE_NUMBER_ID.test(valor.trim())) {
        throw new ErrorConfigCanalInvalida(
          'phoneNumberId',
          'phoneNumberId debe contener solo dígitos (5 a 32)',
        );
      }
      noSecretos.push({ clave: CLAVES_CONFIG_CANAL_KAPSO.phoneNumberId, valor: valor.trim() });
    }
    if (cambios.timeoutMs !== undefined) {
      const valor: unknown = cambios.timeoutMs;
      if (
        typeof valor !== 'number' ||
        !Number.isInteger(valor) ||
        valor < TIMEOUT_MS_MINIMO ||
        valor > TIMEOUT_MS_MAXIMO
      ) {
        throw new ErrorConfigCanalInvalida(
          'timeoutMs',
          `timeoutMs debe ser un entero entre ${TIMEOUT_MS_MINIMO} y ${TIMEOUT_MS_MAXIMO}`,
        );
      }
      noSecretos.push({ clave: CLAVES_CONFIG_CANAL_KAPSO.timeoutMs, valor: String(valor) });
    }

    const apiKey = validarSecreto('apiKey', cambios.apiKey);
    let webhook = validarSecreto('webhookSecret', cambios.webhookSecret);
    let webhookSecretGenerado: string | undefined;
    if (cambios.regenerarWebhookSecret === true) {
      if (webhook.tipo !== 'mantener') {
        throw new ErrorConfigCanalInvalida(
          'webhookSecret',
          'webhookSecret no puede enviarse junto con regenerarWebhookSecret',
        );
      }
      webhookSecretGenerado = (this.deps.generarSecreto ?? generarWebhookSecret)();
      webhook = { tipo: 'guardar', valor: webhookSecretGenerado };
    }

    // Encrypt BEFORE any write: a missing/invalid key aborts with nothing persisted.
    const secretos: Array<{ clave: string; valor: string; esSecreto: true }> = [];
    const eliminar: string[] = [];
    const procesar = (campo: 'apiKey' | 'webhookSecret', accion: AccionSecreto): void => {
      if (accion.tipo === 'guardar') {
        secretos.push({
          clave: CLAVES_CONFIG_CANAL_KAPSO[campo],
          valor: cifrarSecreto(accion.valor, env),
          esSecreto: true,
        });
      } else if (accion.tipo === 'eliminar') {
        eliminar.push(CLAVES_CONFIG_CANAL_KAPSO[campo]);
      }
    };
    procesar('apiKey', apiKey);
    procesar('webhookSecret', webhook);

    const lote = [
      ...noSecretos.map((cambio) => ({ ...cambio, esSecreto: false })),
      ...secretos,
    ];
    if (lote.length > 0) await this.deps.config.guardarVarios(lote, usuario);
    for (const clave of eliminar) await this.deps.config.eliminar({ clave, usuario });

    return webhookSecretGenerado === undefined ? {} : { webhookSecretGenerado };
  }
}

export interface ResultadoProbe {
  ok: boolean;
  detalle: string;
}

export interface DepsProbe {
  fetch?: typeof fetch;
  /** Capped at 5 s: the probe never waits longer. */
  timeoutMs?: number;
}

function esTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

/**
 * Lightest authenticated Kapso call in the SDK: phone number settings
 * (`GET {phoneNumberId}/settings` through the Kapso proxy). Uses the
 * effective config only; messages are generic (no secret, no provider body).
 */
export async function probarKapso(
  config: ConfigCanalKapso,
  deps: DepsProbe = {},
): Promise<ResultadoProbe> {
  if (config.modo === 'simulado') {
    return { ok: true, detalle: 'Modo simulado: no se contacta a Kapso' };
  }
  if (config.apiKey === null || config.phoneNumberId === null) {
    return { ok: false, detalle: 'Falta la API key o el Phone Number ID de Kapso' };
  }

  const fetchBase = deps.fetch ?? globalThis.fetch;
  const timeoutMs = Math.min(deps.timeoutMs ?? PROBE_TIMEOUT_MS, PROBE_TIMEOUT_MS);
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), timeoutMs);
  try {
    const cliente = new WhatsAppClient({
      kapsoApiKey: config.apiKey,
      baseUrl: KAPSO_BASE_URL,
      fetch: (entrada, init) => fetchBase(entrada, { ...init, signal: controlador.signal }),
    });
    await cliente.phoneNumbers.settings.get({ phoneNumberId: config.phoneNumberId });
    return { ok: true, detalle: 'Conexión con Kapso verificada' };
  } catch (error) {
    if (error instanceof GraphApiError) {
      if (error.httpStatus === 401 || error.httpStatus === 403) {
        return { ok: false, detalle: 'Kapso rechazó las credenciales (revisá la API key)' };
      }
      if (error.httpStatus === 404) {
        return { ok: false, detalle: 'Kapso no encontró el Phone Number ID configurado' };
      }
      return { ok: false, detalle: 'Kapso respondió con un error' };
    }
    if (esTimeout(error) || controlador.signal.aborted) {
      return { ok: false, detalle: 'Kapso no respondió a tiempo' };
    }
    return { ok: false, detalle: 'No se pudo conectar con Kapso' };
  } finally {
    clearTimeout(temporizador);
  }
}

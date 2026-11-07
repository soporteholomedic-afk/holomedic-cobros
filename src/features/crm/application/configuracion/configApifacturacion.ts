import type { EntradaConfigCrm } from '../../domain/entities';
import type { ConfigCrmRepository } from '../../domain/ports';

import {
  cifrarSecreto,
  descifrarSecreto,
  enmascararSecreto,
} from '../../infrastructure/config/cifradoSecretos';

/**
 * Runtime-editable apifacturacion.com (SUNAT lookup) config
 * (crm-consulta-sunat T2, specs S2/S5). CrmConfig rows with the
 * `apifacturacion.` prefix override the APIFACTURACION_TOKEN env var —
 * the DB token wins; the env var is a fallback ONLY for the token (the
 * URL has no env fallback). The token is encrypted BEFORE reaching the
 * repo and is never exposed: the view carries presence + mask only.
 * Absence of a token is a normal state (fuente `ninguna`), never an
 * error; only an UNDECRYPTABLE stored token degrades to unconfigured
 * (strict: a rotated-away env secret never revives).
 */

export const PREFIJO_CONFIG_APIFACTURACION = 'apifacturacion.';

export const CLAVE_CONFIG_APIFACTURACION_TOKEN = 'apifacturacion.token';
export const CLAVE_CONFIG_APIFACTURACION_URL = 'apifacturacion.url';

export const URL_APIFACTURACION_POR_DEFECTO = 'https://api.apifacturacion.com';

const VARIABLE_ENTORNO_TOKEN = 'APIFACTURACION_TOKEN';

const LARGO_MAXIMO_TOKEN = 500;
const LARGO_MAXIMO_URL = 500;

/** RUC de prueba for the connection probe (one real, paid lookup). */
export const RUC_DE_PRUEBA = '20525426778';

export type FuenteApifacturacion = 'db' | 'env' | 'ninguna';

type VariablesEntorno = Record<string, string | undefined>;

/** Effective (plain) config. NEVER serialize the token to the admin. */
export interface ConfigApifacturacion {
  /** null = not configured (absence is NOT an error). */
  token: string | null;
  /** Always resolved: DB value or the default. */
  url: string;
  /** Where the effective TOKEN comes from. */
  fuente: FuenteApifacturacion;
}

/** Admin-safe view: presence + mask, never the value. */
export interface VistaApifacturacion {
  configurado: boolean;
  tokenMascarado: string | null;
  url: string;
  fuente: FuenteApifacturacion;
}

/** Safe-to-log code of any thrown value (never the message). */
export function codigoErrorConfig(error: unknown): string {
  return error instanceof Error ? error.name : 'ERROR_DESCONOCIDO';
}

function textoEnv(env: VariablesEntorno, nombre: string): string | null {
  const valor = env[nombre]?.trim();
  return valor ? valor : null;
}

/**
 * DB over env for the token; DB-or-default for the URL. An existing but
 * undecryptable token row resolves to null WITHOUT consulting env
 * (strict), warning with the error code only.
 */
function resolverDesdeFilas(filas: EntradaConfigCrm[], env: VariablesEntorno): ConfigApifacturacion {
  const porClave = new Map(filas.map((fila) => [fila.clave, fila]));
  const filaToken = porClave.get(CLAVE_CONFIG_APIFACTURACION_TOKEN);
  const filaUrl = porClave.get(CLAVE_CONFIG_APIFACTURACION_URL);

  let token: string | null = null;
  let fuente: FuenteApifacturacion = 'ninguna';
  if (filaToken !== undefined && filaToken.esSecreto) {
    try {
      token = descifrarSecreto(filaToken.valor, env);
      fuente = 'db';
    } catch (error) {
      console.warn('[configApifacturacion] token en DB ilegible; queda sin configurar', {
        error: codigoErrorConfig(error),
      });
    }
  }
  if (token === null && (filaToken === undefined || !filaToken.esSecreto)) {
    const tokenEnv = textoEnv(env, VARIABLE_ENTORNO_TOKEN);
    if (tokenEnv !== null) {
      token = tokenEnv;
      fuente = 'env';
    }
  }

  const urlDb =
    filaUrl !== undefined && !filaUrl.esSecreto && filaUrl.valor.trim() !== ''
      ? filaUrl.valor.trim()
      : null;
  return { token, url: urlDb ?? URL_APIFACTURACION_POR_DEFECTO, fuente };
}

export interface ResolverConfigApifacturacionDeps {
  config: Pick<ConfigCrmRepository, 'listar'>;
}

/**
 * Effective config: a DB read failure falls back to env-only (code-only
 * warn); missing rows fall through to env/default. Never throws for an
 * absent token.
 */
export async function resolverConfigApifacturacion(
  deps: ResolverConfigApifacturacionDeps,
  env: VariablesEntorno = process.env,
): Promise<ConfigApifacturacion> {
  let filas: EntradaConfigCrm[];
  try {
    filas = await deps.config.listar(PREFIJO_CONFIG_APIFACTURACION);
  } catch (error) {
    console.warn('[configApifacturacion] lectura de config en DB falló; se usa env', {
      error: codigoErrorConfig(error),
    });
    return resolverDesdeFilas([], env);
  }
  return resolverDesdeFilas(filas, env);
}

/** Admin view derived from the effective config: presence + mask only. */
export function vistaDeConfigApifacturacion(config: ConfigApifacturacion): VistaApifacturacion {
  return {
    configurado: config.token !== null,
    tokenMascarado: config.token === null ? null : enmascararSecreto(config.token),
    url: config.url,
    fuente: config.fuente,
  };
}

export async function leerVistaApifacturacion(
  deps: ResolverConfigApifacturacionDeps,
  env: VariablesEntorno = process.env,
): Promise<VistaApifacturacion> {
  return vistaDeConfigApifacturacion(await resolverConfigApifacturacion(deps, env));
}

// ---------------------------------------------------------------------------
// Guardar (E5 pattern): '' or omitted keeps the current value, explicit
// null deletes the key. EVERY field is validated and every secret is
// encrypted BEFORE any write, so an invalid field or a missing master key
// (fail-closed) persists nothing.
// ---------------------------------------------------------------------------

export type CampoApifacturacion = 'url' | 'token';

export class ErrorConfigApifacturacionInvalida extends Error {
  constructor(
    readonly campo: CampoApifacturacion,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorConfigApifacturacionInvalida';
  }
}

export interface CambiosConfigApifacturacion {
  /** `undefined` keeps the current URL; blank applies the default. */
  url?: string;
  /** '' or omitted keeps the current token; explicit null deletes it. */
  token?: string | null;
}

export interface GuardarConfigApifacturacionDeps {
  config: Pick<ConfigCrmRepository, 'guardar' | 'eliminar'>;
  env?: VariablesEntorno;
}

export function esUrlHttpValida(valor: string): boolean {
  try {
    const url = new URL(valor);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export class GuardarConfigApifacturacionUseCase {
  constructor(private readonly deps: GuardarConfigApifacturacionDeps) {}

  async guardar(cambios: CambiosConfigApifacturacion, usuario: string): Promise<void> {
    const env = this.deps.env ?? process.env;

    let urlAGuardar: string | null = null;
    if (cambios.url !== undefined) {
      const crudo: unknown = cambios.url;
      if (typeof crudo !== 'string') {
        throw new ErrorConfigApifacturacionInvalida('url', 'La URL debe ser texto');
      }
      const limpio = crudo.trim();
      if (limpio.length > LARGO_MAXIMO_URL) {
        throw new ErrorConfigApifacturacionInvalida('url', `La URL excede ${LARGO_MAXIMO_URL} caracteres`);
      }
      const valor = limpio === '' ? URL_APIFACTURACION_POR_DEFECTO : limpio;
      if (!esUrlHttpValida(valor)) {
        throw new ErrorConfigApifacturacionInvalida('url', 'La URL debe ser una URL http(s) válida');
      }
      urlAGuardar = valor;
    }

    type AccionToken =
      | { tipo: 'guardar'; valor: string }
      | { tipo: 'eliminar' }
      | { tipo: 'mantener' };
    let accionToken: AccionToken = { tipo: 'mantener' };
    if (cambios.token !== undefined) {
      const crudo: unknown = cambios.token;
      if (crudo === null) {
        accionToken = { tipo: 'eliminar' };
      } else if (crudo === '') {
        // E5 pattern: '' (or omitted) keeps the current token.
        accionToken = { tipo: 'mantener' };
      } else if (typeof crudo !== 'string' || crudo.trim() === '') {
        throw new ErrorConfigApifacturacionInvalida('token', 'El token no puede estar en blanco');
      } else {
        const valor = crudo.trim();
        if (valor.length > LARGO_MAXIMO_TOKEN) {
          throw new ErrorConfigApifacturacionInvalida(
            'token',
            `El token excede ${LARGO_MAXIMO_TOKEN} caracteres`,
          );
        }
        accionToken = { tipo: 'guardar', valor };
      }
    }

    // Encrypt BEFORE any write: a missing/invalid master key aborts with
    // nothing persisted (fail-closed).
    const tokenCifrado =
      accionToken.tipo === 'guardar' ? cifrarSecreto(accionToken.valor, env) : null;

    if (urlAGuardar !== null) {
      await this.deps.config.guardar({
        clave: CLAVE_CONFIG_APIFACTURACION_URL,
        valor: urlAGuardar,
        esSecreto: false,
        usuario,
      });
    }
    if (tokenCifrado !== null) {
      await this.deps.config.guardar({
        clave: CLAVE_CONFIG_APIFACTURACION_TOKEN,
        valor: tokenCifrado,
        esSecreto: true,
        usuario,
      });
    }
    if (accionToken.tipo === 'eliminar') {
      await this.deps.config.eliminar({ clave: CLAVE_CONFIG_APIFACTURACION_TOKEN, usuario });
    }
  }
}

// ---------------------------------------------------------------------------
// Probar conexión: ONE real lookup against apifacturacion (a paid query).
// Messages are generic on failure; the token is never logged and never
// reaches the response.
// ---------------------------------------------------------------------------

export interface ResultadoPruebaApifacturacion {
  ok: boolean;
  mensaje: string;
}

export interface DepsPruebaApifacturacion {
  fetch?: typeof fetch;
  /** Capped at 10 s: the probe never waits longer. */
  timeoutMs?: number;
}

const PROBE_TIMEOUT_MS = 10_000;

function esTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

function esObjetoCrudo(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export async function probarApifacturacion(
  config: ConfigApifacturacion,
  deps: DepsPruebaApifacturacion = {},
): Promise<ResultadoPruebaApifacturacion> {
  if (config.token === null) {
    return { ok: false, mensaje: 'El token de apifacturacion no está configurado' };
  }

  const fetchBase = deps.fetch ?? globalThis.fetch;
  const timeoutMs = Math.min(deps.timeoutMs ?? PROBE_TIMEOUT_MS, PROBE_TIMEOUT_MS);
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), timeoutMs);
  const url = `${config.url.replace(/\/+$/, '')}/ruc/${RUC_DE_PRUEBA}`;
  try {
    const respuesta = await fetchBase(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: config.token }).toString(),
      signal: controlador.signal,
    });
    if (!respuesta.ok) {
      if (respuesta.status === 401 || respuesta.status === 403) {
        return { ok: false, mensaje: 'apifacturacion rechazó el token' };
      }
      return { ok: false, mensaje: `apifacturacion respondió con un error (HTTP ${respuesta.status})` };
    }
    const datos: unknown = await respuesta.json().catch(() => undefined);
    if (!esObjetoCrudo(datos) || typeof datos.razon_social !== 'string') {
      return {
        ok: false,
        mensaje: 'apifacturacion no devolvió datos del RUC de prueba (revisá el token)',
      };
    }
    const estado = typeof datos.estado === 'string' ? datos.estado : null;
    const condicion = typeof datos.condicion === 'string' ? datos.condicion : null;
    const detalle =
      estado !== null || condicion !== null
        ? ` (estado ${estado ?? '—'}, condición ${condicion ?? '—'})`
        : '';
    return { ok: true, mensaje: `Consulta de prueba correcta: "${datos.razon_social}"${detalle}` };
  } catch (error) {
    if (esTimeout(error) || controlador.signal.aborted) {
      return { ok: false, mensaje: 'apifacturacion no respondió a tiempo' };
    }
    return { ok: false, mensaje: 'No se pudo conectar con apifacturacion' };
  } finally {
    clearTimeout(temporizador);
  }
}

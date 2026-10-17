import { GraphApiError, WhatsAppClient } from '@kapso/whatsapp-cloud-api';

import type {
  EnviadorWhatsappCrmPort,
  EnvioWhatsappCrm,
  ResultadoEnvioWhatsapp,
} from '../../domain/ports';

/**
 * Kapso REAL adapter for EnviadorWhatsappCrmPort (agente-ia-crm E1):
 * one outbound text through the Kapso proxy. SDK config (verified in
 * node_modules/@kapso/whatsapp-cloud-api WhatsAppClientConfig):
 * `kapsoApiKey` + `baseUrl` is the complete proxy setup — the Meta
 * `accessToken` is NOT needed when routing through Kapso. The client
 * is built lazily per instance from the env; every failure maps to
 * ONE typed ResultadoEnvioWhatsapp code so the responder use case
 * never sees an exception:
 * - KAPSO_API_KEY / KAPSO_PHONE_NUMBER_ID missing → KAPSO_NO_CONFIGURADO
 * - HTTP 401/403 (GraphApiError) → KAPSO_AUTH_ERROR
 * - AbortError / ETIMEDOUT → KAPSO_TIMEOUT
 * - anything else (incl. a response without a wamid) → KAPSO_ERROR
 *
 * Security: the API key NEVER appears in logs nor in `detalle` (the
 * Graph/Kapso error messages describe the response, not the request
 * auth).
 */

/** Kapso proxy endpoint (docs.kapso.ai — WhatsApp via Kapso, ~2 min setup). */
const KAPSO_BASE_URL = 'https://api.kapso.ai/meta/whatsapp';

/** Per-send timeout (ms); KAPSO_TIMEOUT_MS overrides, default 15 s. */
const KAPSO_TIMEOUT_MS_DEFAULT = 15000;

function leerKapsoTimeoutMs(): number {
  const crudo = process.env.KAPSO_TIMEOUT_MS;
  if (crudo === undefined || crudo === '') return KAPSO_TIMEOUT_MS_DEFAULT;
  const parseado = Number(crudo);
  if (!Number.isFinite(parseado) || parseado <= 0) return KAPSO_TIMEOUT_MS_DEFAULT;
  return parseado;
}

/**
 * Timeout mechanism (R4-kapso-no-timeout): the SDK v0.3.0 exposes NO
 * signal/timeout/requestTimeout option (WhatsAppClientConfig and
 * RequestOptions, verified in node_modules/@kapso/whatsapp-cloud-api/
 * dist/index.d.ts), so each send races the SDK promise against a
 * private timer. When the timer wins it rejects with a TimeoutError
 * that esTimeout() maps to KAPSO_TIMEOUT. The underlying fetch keeps
 * running (this SDK cannot be aborted), but the operator's request no
 * longer blocks on a hung API. The late SDK rejection is swallowed
 * with a no-op catch so it never surfaces as unhandled.

/** Redacted, user-safe rendering of an unknown thrown value. */
function detalleDe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function esTimeout(error: unknown): boolean {
  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') return true;
    const causa = (error as { cause?: unknown }).cause;
    if (causa instanceof Error && /ETIMEDOUT|ECONNTIMEOUT/i.test(causa.message)) return true;
  }
  return false;
}

async function conTimeout<T>(promesa: Promise<T>, timeoutMs: number): Promise<T> {
  // El perdedor del race nunca queda como unhandled rejection.
  promesa.catch(() => undefined);
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const vencimiento = new Promise<never>((_, reject) => {
    temporizador = setTimeout(() => {
      const error = new Error(`Kapso no respondió en ${timeoutMs} ms (KAPSO_TIMEOUT_MS)`);
      error.name = 'TimeoutError';
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([promesa, vencimiento]);
  } finally {
    clearTimeout(temporizador);
  }
}

/**
 * Explicit adapter config (E5·T5b). When omitted, the adapter reads the
 * KAPSO_* env exactly as before; the configurable factory passes the
 * resolved runtime config (DB over env) instead.
 */
export interface ConfigEnviadorKapso {
  apiKey: string | null;
  phoneNumberId: string | null;
  timeoutMs: number;
}

export class EnviadorKapsoWhatsapp implements EnviadorWhatsappCrmPort {
  private readonly client: WhatsAppClient | null;

  constructor(private readonly config?: ConfigEnviadorKapso) {
    const apiKey = config ? config.apiKey : process.env.KAPSO_API_KEY;
    this.client = apiKey ? new WhatsAppClient({ kapsoApiKey: apiKey, baseUrl: KAPSO_BASE_URL }) : null;
  }

  async enviar(datos: EnvioWhatsappCrm): Promise<ResultadoEnvioWhatsapp> {
    const phoneNumberId = this.config ? this.config.phoneNumberId : process.env.KAPSO_PHONE_NUMBER_ID;
    const timeoutMs = this.config ? this.config.timeoutMs : leerKapsoTimeoutMs();
    if (this.client === null || phoneNumberId === undefined || phoneNumberId === null || phoneNumberId === '') {
      return {
        ok: false,
        error: 'KAPSO_NO_CONFIGURADO',
        detalle: 'Falta KAPSO_API_KEY o KAPSO_PHONE_NUMBER_ID en el entorno',
      };
    }

    try {
      const respuesta = await conTimeout(
        this.client.messages.sendText({
          phoneNumberId,
          to: datos.telefonoE164,
          body: datos.cuerpo,
        }),
        timeoutMs,
      );
      const wamid = respuesta.messages[0]?.id;
      if (wamid === undefined || wamid === '') {
        return {
          ok: false,
          error: 'KAPSO_ERROR',
          detalle: 'La respuesta de Kapso no trajo wamid',
        };
      }
      return { ok: true, wamid };
    } catch (error: unknown) {
      if (error instanceof GraphApiError && (error.httpStatus === 401 || error.httpStatus === 403)) {
        return { ok: false, error: 'KAPSO_AUTH_ERROR', detalle: detalleDe(error) };
      }
      if (esTimeout(error)) {
        return { ok: false, error: 'KAPSO_TIMEOUT', detalle: detalleDe(error) };
      }
      return { ok: false, error: 'KAPSO_ERROR', detalle: detalleDe(error) };
    }
  }
}

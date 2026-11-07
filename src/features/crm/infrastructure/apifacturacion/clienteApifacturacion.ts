import type { ConfigApifacturacion } from '../../application/configuracion/configApifacturacion';
import type { DatosSunat } from '../../domain/entities';
import {
  ConsultaNoConfiguradaError,
  RucNoEncontradoError,
  ServicioConsultaError,
} from '../../domain/errors';
import type { IConsultaRucServicio } from '../../domain/ports';

/**
 * Adapter of `IConsultaRucServicio` against apifacturacion.com
 * (crm-consulta-sunat T4, S1): `POST {url}/ruc/{ruc}` with the token as
 * the form-urlencoded body, capped at 10 s. The config arrives already
 * resolved (DB > env is the T2 resolver's job) via an async provider,
 * so an invalid RUC never reaches neither the DB config read nor the
 * paid external call (validation happens first in the use case).
 *
 * The external payload is NEVER trusted: a missing/blank `razon_social`
 * is "not found"; a body that is not JSON at all, a failed HTTP status,
 * a network failure or a timeout are service failures (502). The token
 * only travels in the request body — it is never logged.
 */

const TIMEOUT_MS = 10_000;

/** Effective config per consulta; the route wires it to the T2 resolver. */
export type ProveedorConfigApifacturacion = () => Promise<ConfigApifacturacion>;

export interface ApiFacturacionClienteDeps {
  config: ProveedorConfigApifacturacion;
  /** Injectable for tests; defaults to globalThis.fetch. */
  fetch?: typeof fetch;
}

function esTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

function esObjetoCrudo(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function textoOpcional(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

export class ApiFacturacionCliente implements IConsultaRucServicio {
  private readonly fetchBase: typeof fetch;

  constructor(private readonly deps: ApiFacturacionClienteDeps) {
    this.fetchBase = deps.fetch ?? globalThis.fetch;
  }

  async consultar(ruc: string): Promise<DatosSunat> {
    const config = await this.deps.config();
    if (config.token === null) throw new ConsultaNoConfiguradaError();

    const url = `${config.url.replace(/\/+$/, '')}/ruc/${encodeURIComponent(ruc)}`;
    let respuesta: Response;
    try {
      respuesta = await this.fetchBase(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: config.token }).toString(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new ServicioConsultaError(
        esTimeout(error)
          ? 'apifacturacion no respondió a tiempo'
          : 'No se pudo conectar con apifacturacion',
      );
    }
    if (!respuesta.ok) {
      throw new ServicioConsultaError(`apifacturacion respondió con un error (HTTP ${respuesta.status})`);
    }

    let datos: unknown;
    try {
      datos = await respuesta.json();
    } catch {
      // Un cuerpo que ni siquiera es JSON es un servicio caído, no un RUC inexistente.
      throw new ServicioConsultaError('apifacturacion respondió con un cuerpo que no es JSON');
    }
    if (
      !esObjetoCrudo(datos) ||
      typeof datos.razon_social !== 'string' ||
      datos.razon_social.trim() === ''
    ) {
      throw new RucNoEncontradoError(ruc);
    }
    return {
      razonSocial: datos.razon_social,
      direccion: textoOpcional(datos.direccion),
      estado: textoOpcional(datos.estado),
      condicion: textoOpcional(datos.condicion),
    };
  }
}

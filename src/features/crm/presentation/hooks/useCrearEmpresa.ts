'use client';

import { useCallback, useState } from 'react';

import type { CrearEmpresaInput, Empresa, Origen, TipoEmpresa } from '../../domain/entities';
import { normalizarCorreo } from '../../domain/normalizar';
import { isEmpresa } from './useEmpresas';

/**
 * useCrearEmpresa — client hook that registers a new empresa through
 * the existing `POST /api/crm/empresas` endpoint (spec G1; the route
 * is crm_admin-gated in-route and maps the adapter's ConflictError to
 * HTTP 409). Post-verify UX remediation: the inbound flow's first step
 * ("registramos los datos de contacto") had NO manual UI.
 *
 * Mirrors the useTransicion mutation model: fetch lives here (never in
 * the component), the result is a plain discriminated result — never a
 * thrown promise — so the caller can navigate on success (it carries
 * the created empresa) or surface the error message and keep the form
 * open. The API's typed error body drives the mapping: CONFLICT_ERROR
 * → the friendly RUC duplicado message, everything else verbatim.
 */

/** Single source of the request URL for both hook and tests. */
export const RUTA_API_EMPRESAS = '/api/crm/empresas';

/** UI message for the 409 RUC conflict (mapped from the API's CONFLICT_ERROR code). */
export const MENSAJE_RUC_DUPLICADO = 'Ya existe una empresa con ese RUC.';

/** Raw form fields exactly as typed by the operator (pre-normalization). */
export interface FormularioEmpresaState {
  razonSocial: string;
  ruc: string;
  /** '' = not chosen yet; the form validates it as required. */
  tipo: '' | TipoEmpresa;
  /** '' = "Sin clasificar" → null (spec: origen is optional). */
  origen: '' | Origen;
  proyectoObra: string;
  destinoComun: string;
  notas: string;
  /** First (and only) contacto created by the registration form. */
  encargado: string;
  /** ";"-separated raw text — split/normalized by partirCorreosFormulario. */
  correos: string;
  telefono: string;
  /** Default true: the first/only contacto is the empresa's principal. */
  principal: boolean;
}

export type ResultadoCrearEmpresaUi =
  | { ok: true; empresa: Empresa }
  | { ok: false; empresa: null; error: string };

/**
 * Split the ";"-separated field into normalized deduped correos
 * (first-seen order). Mirrors validarImportacion's module-private
 * `partirCorreos` over the SHARED domain normalizer (normalizarCorreo)
 — the import domain file is untouchable for this UI-only remediation,
 * so the 6-line mirror lives here instead of duplicating the domain.
 */
export function partirCorreosFormulario(crudo: string): string[] {
  const vistas = new Set<string>();
  for (const parte of crudo.split(';')) {
    const correo = normalizarCorreo(parte);
    if (correo !== '') vistas.add(correo);
  }
  return [...vistas];
}

const textoOpcional = (valor: string): string | null => {
  const recortado = valor.trim();
  return recortado === '' ? null : recortado;
};

/**
 * Pure form-state → CrearEmpresaInput (the API's documented contract).
 * The RUC travels trimmed-raw: normalization to rucNormalizado is the
 * server adapter's job (single source of the dedup key). Throws only
 * on the tipo invariant that validarFormularioEmpresa guards first.
 */
export function buildCrearEmpresaInput(estado: FormularioEmpresaState): CrearEmpresaInput {
  const { tipo } = estado;
  if (tipo === '') {
    throw new Error('Selecciona el tipo de empresa.');
  }
  return {
    ruc: estado.ruc.trim(),
    razonSocial: estado.razonSocial.trim(),
    tipo,
    origen: estado.origen === '' ? null : estado.origen,
    proyectoObra: textoOpcional(estado.proyectoObra),
    destinoComun: textoOpcional(estado.destinoComun),
    notas: textoOpcional(estado.notas),
    responsable: null,
    contactos: [
      {
        nombre: estado.encargado.trim(),
        telefono: textoOpcional(estado.telefono),
        esPrincipal: estado.principal,
        correos: partirCorreosFormulario(estado.correos),
      },
    ],
  };
}

interface ApiErrorBody {
  success?: unknown;
  error?: unknown;
  code?: unknown;
}

/**
 * Pure — maps the API's typed error body to the operator-facing
 * message: the 409 RUC conflict reads as a friendly sentence, any
 * other typed error surfaces verbatim (Spanish per repo convention),
 * and a body without a usable error falls back to the HTTP status.
 */
export function mapearErrorCreacion(json: unknown, status: number): string {
  const body = (typeof json === 'object' && json !== null ? json : {}) as ApiErrorBody;
  if (body.code === 'CONFLICT_ERROR') return MENSAJE_RUC_DUPLICADO;
  if (typeof body.error === 'string' && body.error !== '') return body.error;
  return `HTTP ${status}`;
}

export function useCrearEmpresa(): {
  crear: (input: CrearEmpresaInput) => Promise<ResultadoCrearEmpresaUi>;
  enCurso: boolean;
} {
  const [enCurso, setEnCurso] = useState(false);

  const crear = useCallback(
    async (input: CrearEmpresaInput): Promise<ResultadoCrearEmpresaUi> => {
      setEnCurso(true);
      try {
        const response = await fetch(RUTA_API_EMPRESAS, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
        });
        const json: unknown = await response.json().catch(() => ({}));
        if (!response.ok) {
          return {
            ok: false,
            empresa: null,
            error: mapearErrorCreacion(json, response.status),
          };
        }
        const body = (typeof json === 'object' && json !== null ? json : {}) as {
          success?: unknown;
          empresa?: unknown;
        };
        if (body.success !== true || !isEmpresa(body.empresa)) {
          return {
            ok: false,
            empresa: null,
            error: 'Respuesta inesperada del servidor',
          };
        }
        return { ok: true, empresa: body.empresa };
      } catch (err: unknown) {
        return {
          ok: false,
          empresa: null,
          error: err instanceof Error ? err.message : 'Error de red',
        };
      } finally {
        setEnCurso(false);
      }
    },
    [],
  );

  return { crear, enCurso };
}

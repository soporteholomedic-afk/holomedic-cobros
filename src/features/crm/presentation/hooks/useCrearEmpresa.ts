'use client';

import { useCallback, useState } from 'react';

import type { CrearEmpresaInput, Empresa, Origen, SectorCrm, TipoEmpresa } from '../../domain/entities';
import { normalizarCorreo } from '../../domain/normalizar';
import { isEmpresa } from './useEmpresas';
import { enviarCorreoEmpresa } from '../accionesFila';

/**
 * useCrearEmpresa — client hook that registers a new empresa through
 * the existing `POST /api/crm/empresas` endpoint (spec G1; the route
 * is crm-gated in-route and maps the adapter's ConflictError to
 * HTTP 409). Post-verify UX remediation: the inbound flow's first step
 * ("registramos los datos de contacto") had NO manual UI.
 *
 * Mirrors the useTransicion mutation model: fetch lives here (never in
 * the component), the result is a plain discriminated result — never a
 * thrown promise — so the caller can navigate on success (it carries
 * the created empresa) or surface the error message and keep the form
 * open. The API's typed error body drives the mapping: CONFLICT_ERROR
 * → the friendly RUC duplicado message, everything else verbatim.
 *
 * `crearEnPanel` (task 10.2, rediseno-crm-panel): the alta modal's
 * persist-FIRST contract — after the empresa lands, the optional
 * "Enviar la Carta de Presentación de inmediato" dispatch rides the
 * SAME shared seam the row buttons use (accionesFila.enviarCorreoEmpresa
 * → POST /api/crm/empresas/[id]/envios), so there is exactly one send
 * path. An SMTP failure never rolls the alta back: the result stays
 * `ok` and carries `advertenciaCarta` — the empresa persists in
 * sin_carta and the row's "Enviar carta" button is the built-in retry
 * (spec crm-email-sequencing, persist-before-dispatch).
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

/** Result of the panel alta: a persisted empresa (always `ok` when the
 * POST landed) plus the carta warning when the immediate dispatch
 * failed — the alta itself NEVER fails because of SMTP. */
export type ResultadoAltaPanel =
  | { ok: true; empresa: Empresa; advertenciaCarta: string | null }
  | { ok: false; empresa: null; error: string };

/** The alta modal's radio labels — verbatim from the design mock. */
export type TipoRegistroAlta = 'Cliente Nuevo' | 'Posible Cliente';

/**
 * Pure — the mock radio maps BOTH domain doors at once (design D5):
 * "Cliente Nuevo" already asked for reports/quotes → Cliente + Inbound;
 * "Posible Cliente" is outbound prospecting → Prospecto + Outbound.
 */
export function mapearTipoRegistro(seleccion: TipoRegistroAlta): {
  tipo: TipoEmpresa;
  origen: Origen;
} {
  return seleccion === 'Cliente Nuevo'
    ? { tipo: 'Cliente', origen: 'Inbound' }
    : { tipo: 'Prospecto', origen: 'Outbound' };
}

/** Raw alta-modal fields exactly as typed by the operator (pre-trim). */
export interface CamposAltaEmpresa {
  tipoRegistro: TipoRegistroAlta;
  razonSocial: string;
  ruc: string;
  contacto: string;
  /** Defaults to "Recursos Humanos / Seguridad" in the modal (decision 5). */
  cargo: string;
  correo: string;
  telefono: string;
  /** Rubro label from SECTORES_CRM (modal preselects the first). */
  sector: SectorCrm;
  /** null = the operator cleared the field (route stores NULL). */
  cantidadTrabajadores: number | null;
}

/**
 * Pure — alta-modal fields → CrearEmpresaInput (buildCrearEmpresaInput
 * pattern; the modal form is a DIFFERENT, smaller contract than the
 * legacy registration page, so it gets its own builder). Exactly one
 * principal contacto is created. Throws only on the correo invariant
 * the modal's `required` guards first.
 */
export function buildAltaEmpresaInput(campos: CamposAltaEmpresa): CrearEmpresaInput {
  const { tipo, origen } = mapearTipoRegistro(campos.tipoRegistro);
  const correo = normalizarCorreo(campos.correo);
  if (correo === '') {
    throw new Error('Ingresa el correo electrónico del contacto.');
  }
  return {
    ruc: campos.ruc.trim(),
    razonSocial: campos.razonSocial.trim(),
    tipo,
    origen,
    sector: campos.sector,
    cantidadTrabajadores: campos.cantidadTrabajadores,
    contactos: [
      {
        nombre: campos.contacto.trim(),
        cargo: textoOpcional(campos.cargo),
        telefono: textoOpcional(campos.telefono),
        esPrincipal: true,
        correos: [correo],
      },
    ],
  };
}

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
 *
 * `responsable` (crm-ux redesign): optional self-assignment for the
 * Cola de hoy quick-capture — the page form keeps the default null
 * (admin decides later), the board modal passes the session user.
 */
export function buildCrearEmpresaInput(
  estado: FormularioEmpresaState,
  responsable: string | null = null,
): CrearEmpresaInput {
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
    responsable,
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

/** The persist step ONLY (no React state) — shared verbatim by `crear`
 * (legacy forms) and `crearEnPanel` (panel alta), so the in-flight
 * flag of each covers exactly its own steps. */
async function enviarCreacion(input: CrearEmpresaInput): Promise<ResultadoCrearEmpresaUi> {
  let json: unknown = {};
  try {
    const response = await fetch(RUTA_API_EMPRESAS, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    json = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        empresa: null,
        error: mapearErrorCreacion(json, response.status),
      };
    }
  } catch (err: unknown) {
    return {
      ok: false,
      empresa: null,
      error: err instanceof Error ? err.message : 'Error de red',
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
}

export function useCrearEmpresa(): {
  crear: (input: CrearEmpresaInput) => Promise<ResultadoCrearEmpresaUi>;
  crearEnPanel: (
    input: CrearEmpresaInput,
    opciones: { enviarCarta: boolean },
  ) => Promise<ResultadoAltaPanel>;
  enCurso: boolean;
} {
  const [enCurso, setEnCurso] = useState(false);

  const crear = useCallback(async (input: CrearEmpresaInput): Promise<ResultadoCrearEmpresaUi> => {
    setEnCurso(true);
    try {
      return await enviarCreacion(input);
    } finally {
      setEnCurso(false);
    }
  }, []);

  const crearEnPanel = useCallback(
    async (
      input: CrearEmpresaInput,
      opciones: { enviarCarta: boolean },
    ): Promise<ResultadoAltaPanel> => {
      setEnCurso(true);
      try {
        const base = await enviarCreacion(input);
        if (!base.ok) return base;
        if (!opciones.enviarCarta) {
          return { ok: true, empresa: base.empresa, advertenciaCarta: null };
        }
        // The SAME seam the row buttons use — one send path, no
        // duplication (batch-15 brief). Failure ≠ alta failure.
        const envio = await enviarCorreoEmpresa(base.empresa.id, 'carta_presentacion');
        return envio.ok
          ? { ok: true, empresa: base.empresa, advertenciaCarta: null }
          : { ok: true, empresa: base.empresa, advertenciaCarta: envio.error };
      } finally {
        setEnCurso(false);
      }
    },
    [],
  );

  return { crear, crearEnPanel, enCurso };
}

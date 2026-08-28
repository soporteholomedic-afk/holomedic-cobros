import type { CampoFirma, FirmaCorreo } from '../../domain/entities';

/**
 * The payload `saveFirmaApi` PUTs to `/api/plantillas/firma`: the five
 * plain signature fields — no HTML, no ids (the route rejects bodies
 * carrying `firma`/`firmaHtml`, threat TM5, and forces
 * `ownerId = session.sub` server-side, TM4).
 */
export interface SaveFirmaApiPayload {
  nombre: string;
  area: string;
  correo: string;
  telefono: string;
  anexo: string;
}

/** The persisted (trimmed) signature + the SERVER-composed email block. */
export interface SaveFirmaApiSuccess {
  ok: true;
  firma: FirmaCorreo;
  firmaHtml: string;
}

export interface SaveFirmaApiFailure {
  ok: false;
  error: string;
  fields?: Partial<Record<CampoFirma, string>>;
}

/**
 * Typed result union (saveTemplateApi's throw style would conflate
 * per-field validation errors with transport failures; the form needs
 * BOTH cases as data to render its two feedback surfaces).
 */
export type SaveFirmaApiResult = SaveFirmaApiSuccess | SaveFirmaApiFailure;

const CAMPOS: readonly CampoFirma[] = ['nombre', 'area', 'correo', 'telefono', 'anexo'];

/** Runtime guard for a `FirmaCorreo` coming back over the wire. */
function isFirmaCorreo(v: unknown): v is FirmaCorreo {
  if (typeof v !== 'object' || v === null) return false;
  const record = v as Record<string, unknown>;
  return CAMPOS.every((campo) => typeof record[campo] === 'string');
}

/** Narrow an untyped `fields` bag to the known signature fields. */
function narrowFields(v: unknown): Partial<Record<CampoFirma, string>> | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const record = v as Record<string, unknown>;
  const fields: Partial<Record<CampoFirma, string>> = {};
  for (const campo of CAMPOS) {
    const value = record[campo];
    if (typeof value === 'string' && value.length > 0) {
      fields[campo] = value;
    }
  }
  return Object.keys(fields).length > 0 ? fields : undefined;
}

/**
 * PUT the signature to `/api/plantillas/firma` and return a typed
 * result (never throws — network failures are a result, so the form
 * hook can render every outcome from one shape; saveTemplateApi
 * precedent for the transport details: JSON headers, API `error`
 * message surfacing).
 */
export async function saveFirmaApi(payload: SaveFirmaApiPayload): Promise<SaveFirmaApiResult> {
  let response: Response;
  try {
    response = await fetch('/api/plantillas/firma', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    return { ok: false, error: 'No se pudo conectar con el servidor' };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (response.ok) {
    const record = (body ?? {}) as Record<string, unknown>;
    if (isFirmaCorreo(record.firma) && typeof record.firmaHtml === 'string') {
      return { ok: true, firma: record.firma, firmaHtml: record.firmaHtml };
    }
    return { ok: false, error: 'Respuesta inválida del servidor' };
  }

  const record = (body ?? {}) as Record<string, unknown>;
  const error =
    typeof record.error === 'string' && record.error.length > 0
      ? record.error
      : 'No se pudo guardar la firma';
  const fields = narrowFields(record.fields);
  return fields ? { ok: false, error, fields } : { ok: false, error };
}

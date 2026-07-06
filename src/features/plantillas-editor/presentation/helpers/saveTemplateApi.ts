import type { SpitchType } from '../../domain/entities';

/**
 * The payload `saveTemplateApi` POSTs to `/api/plantillas`. Mirrors the
 * route's `SaveTemplateInput` (PR 2): `id` is omitted on create, present on
 * update; `isDefault` is optional either way.
 */
export interface SaveTemplateApiPayload {
  area: string;
  type: SpitchType;
  name: string;
  subject: string;
  bodyHtml: string;
  id?: string;
  isDefault?: boolean;
}

/** The success response body from `POST /api/plantillas` (PR 2 route). */
export interface SaveTemplateApiResponse {
  id: string;
  currentVersionId: string | null;
}

/**
 * POST a template to `/api/plantillas` and return `{ id, currentVersionId }`.
 *
 * Extracted from `TemplateEditor` so the component does not contain raw
 * fetch logic (AGENTS.md). The route (PR 2) handles create-vs-update via the
 * presence of `id` and appends a version row on every save; this wrapper is
 * a thin transport layer.
 *
 * Errors:
 *  - Non-OK response → throws with the API's `error` message (or a generic
 *    fallback if the body is unparseable). The route returns 400/404/500
 *    with a typed `{success, error, code}` body.
 *  - Network error (fetch rejects) → rethrown without swallowing.
 */
export async function saveTemplateApi(
  payload: SaveTemplateApiPayload,
): Promise<SaveTemplateApiResponse> {
  let response: Response;
  try {
    response = await fetch('/api/plantillas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (cause) {
    // Network error — rethrow so the caller can surface "Error de conexión".
    throw cause instanceof Error
      ? cause
      : new Error('No se pudo conectar con el servidor');
  }

  if (!response.ok) {
    let apiError = 'No se pudo guardar la plantilla';
    try {
      const body = (await response.json()) as { error?: string };
      if (typeof body.error === 'string' && body.error.length > 0) {
        apiError = body.error;
      }
    } catch {
      // Body wasn't JSON — keep the generic message.
    }
    throw new Error(apiError);
  }

  const data = (await response.json()) as SaveTemplateApiResponse;
  return data;
}

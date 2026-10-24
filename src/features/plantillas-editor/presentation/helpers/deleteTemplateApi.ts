/** The success response body from `DELETE /api/plantillas/:id`. */
export interface DeleteTemplateApiResponse {
  id: string;
  deletedAt: string | null;
}

/**
 * Soft-delete a template via `DELETE /api/plantillas/:id` and return
 * `{ id, deletedAt }`.
 *
 * Extracted from `TemplateEditor` so the component does not contain raw
 * fetch logic (AGENTS.md). The route sets `deletedAt=now` (and clears
 * `isDefault` when the deleted template was the default); the template is
 * recoverable via `POST /api/plantillas/:id/restore`, so this is a
 * recoverable trash move, not a purge.
 *
 * Errors:
 *  - Non-OK response → throws with the API's `error` message (or a generic
 *    fallback if the body is unparseable). The route returns 404/500 with a
 *    typed `{success, error, code}` body.
 *  - Network error (fetch rejects) → rethrown without swallowing.
 */
export async function deleteTemplateApi(id: string): Promise<DeleteTemplateApiResponse> {
  let response: Response;
  try {
    response = await fetch(`/api/plantillas/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  } catch (cause) {
    // Network error — rethrow so the caller can surface a connection error.
    throw cause instanceof Error
      ? cause
      : new Error('No se pudo conectar con el servidor');
  }

  if (!response.ok) {
    let apiError = 'No se pudo eliminar la plantilla';
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

  const data = (await response.json()) as DeleteTemplateApiResponse;
  return data;
}

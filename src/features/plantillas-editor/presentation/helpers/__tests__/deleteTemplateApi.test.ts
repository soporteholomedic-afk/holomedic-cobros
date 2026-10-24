import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { deleteTemplateApi } from '../deleteTemplateApi';

/**
 * Unit tests for `deleteTemplateApi` — the thin fetch wrapper that soft-deletes
 * a template via `DELETE /api/plantillas/:id` (route: sets deletedAt, template
 * is recoverable via `POST /api/plantillas/:id/restore`).
 *
 * Mirrors `saveTemplateApi.test.ts`: a single `global.fetch` mock and error
 * mapping from the API's typed `{success, error, code}` body. Extracted from
 * `TemplateEditor` so the component contains no raw fetch logic (AGENTS.md).
 */
interface MockResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

function mockFetchResponse(resp: MockResponse): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue(resp);
}

describe('deleteTemplateApi', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('DELETEs /api/plantillas/:id and returns {id, deletedAt} on success', async () => {
    const fetchMock = mockFetchResponse({
      ok: true,
      status: 200,
      json: async () => ({ id: 'tpl-1', deletedAt: '2026-01-02T00:00:00.000Z' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await deleteTemplateApi('tpl-1');

    expect(result).toEqual({ id: 'tpl-1', deletedAt: '2026-01-02T00:00:00.000Z' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/plantillas/tpl-1');
    expect(init.method).toBe('DELETE');
  });

  it('throws the API error message on a non-OK response', async () => {
    global.fetch = mockFetchResponse({
      ok: false,
      status: 404,
      json: async () => ({ success: false, error: 'Template not found', code: 'VALIDATION_ERROR' }),
    }) as unknown as typeof fetch;

    await expect(deleteTemplateApi('missing')).rejects.toThrow('Template not found');
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    global.fetch = mockFetchResponse({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json');
      },
    }) as unknown as typeof fetch;

    await expect(deleteTemplateApi('tpl-1')).rejects.toThrow('No se pudo eliminar la plantilla');
  });

  it('rethrows network errors', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network failure')) as unknown as typeof fetch;

    await expect(deleteTemplateApi('tpl-1')).rejects.toThrow('Network failure');
  });
});

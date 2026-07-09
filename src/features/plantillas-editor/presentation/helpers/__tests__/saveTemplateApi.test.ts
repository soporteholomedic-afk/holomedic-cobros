import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { saveTemplateApi } from '../saveTemplateApi';
import type { SaveTemplateApiPayload } from '../saveTemplateApi';

/**
 * Unit tests for `saveTemplateApi` — the thin fetch wrapper that POSTs a
 * template to `/api/plantillas`.
 *
 * Spec `email-template-editor` / "Save flow with versioning":
 *  - "Save new template": on success a new template id is returned.
 *  - "Save existing template appends version": the same endpoint handles
 *    updates (id present) — the adapter appends a version row.
 *
 * Extracted from `TemplateEditor` so the component does not contain raw
 * fetch logic (AGENTS.md). Tested with a single `global.fetch` mock — the
 * pure helpers (`encodeToken`, `postProcessTokenBlocks`, `buildPreviewHtml`)
 * are tested independently.
 */
const validPayload: SaveTemplateApiPayload = {
  area: 'consolidados',
  type: 'company',
  name: 'Welcome',
  subject: 'Hello {{empresa}}',
  bodyHtml: '<p>{{empresa}}</p>',
};

/** A minimal Response-shaped object for the mock. */
interface MockResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

function mockFetchResponse(resp: MockResponse): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue(resp);
}

describe('saveTemplateApi', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('POSTs to /api/plantillas and returns {id, currentVersionId} on success', async () => {
    const fetchMock = mockFetchResponse({
      ok: true,
      status: 201,
      json: async () => ({ id: 'tpl-1', currentVersionId: 'v-1' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await saveTemplateApi(validPayload);

    expect(result).toEqual({ id: 'tpl-1', currentVersionId: 'v-1' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/plantillas');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    const body = JSON.parse(init.body as string) as SaveTemplateApiPayload;
    expect(body).toEqual(validPayload);
  });

  it('forwards optional id and isDefault when present (update + default)', async () => {
    const fetchMock = mockFetchResponse({
      ok: true,
      status: 201,
      json: async () => ({ id: 'tpl-existing', currentVersionId: 'v-2' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await saveTemplateApi({
      ...validPayload,
      id: 'tpl-existing',
      isDefault: true,
    });

    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string) as SaveTemplateApiPayload;
    expect(body.id).toBe('tpl-existing');
    expect(body.isDefault).toBe(true);
  });

  it('throws with the API error message on a non-OK response', async () => {
    global.fetch = mockFetchResponse({
      ok: false,
      status: 400,
      json: async () => ({ success: false, error: 'Unknown area', code: 'VALIDATION_ERROR' }),
    }) as unknown as typeof fetch;

    await expect(saveTemplateApi(validPayload)).rejects.toThrow('Unknown area');
  });

  it('throws a generic message on a non-OK response with an unparseable body', async () => {
    global.fetch = mockFetchResponse({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json');
      },
    }) as unknown as typeof fetch;

    await expect(saveTemplateApi(validPayload)).rejects.toThrow();
  });

  it('rethrows a network error (fetch rejected) without swallowing', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    await expect(saveTemplateApi(validPayload)).rejects.toThrow('network down');
  });
});

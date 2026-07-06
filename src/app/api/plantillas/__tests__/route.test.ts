import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __setTemplateDbForTests } from '@/features/plantillas-editor/infrastructure/getTemplateDb';
import type { ITemplateRepository } from '@/features/plantillas-editor/domain/ports';
import type { Template } from '@/features/plantillas-editor/domain/entities';

// ---- Import under test (after mocks) ----

import { GET, POST } from '../route';

// ---- Helpers ----

function makeTemplate(overrides: Partial<Template> = {}): Template {
  return {
    id: 'tpl-1',
    area: 'consolidados',
    type: 'company',
    name: 'Welcome',
    subject: 'Hello {{empresa}}',
    bodyHtml: '<p>{{empresa}}</p>',
    isDefault: false,
    currentVersionId: 'v-1',
    deletedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeMockRepo(repo: Partial<ITemplateRepository> = {}): ITemplateRepository {
  return {
    listByArea: vi.fn().mockResolvedValue([]),
    listByAreaAndType: vi.fn().mockResolvedValue([]),
    listDeletedByArea: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue(makeTemplate()),
    softDelete: vi.fn().mockResolvedValue(undefined),
    restore: vi.fn().mockResolvedValue(undefined),
    clone: vi.fn().mockResolvedValue(makeTemplate()),
    setDefault: vi.fn().mockResolvedValue(undefined),
    listVersions: vi.fn().mockResolvedValue([]),
    rollback: vi.fn().mockResolvedValue(makeTemplate()),
    ...repo,
  };
}

function makeGetRequest(query: Record<string, string>): Request {
  const url = new URL('http://localhost/api/plantillas');
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

function makePostRequest(body: unknown): Request {
  return new Request('http://localhost/api/plantillas', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __setTemplateDbForTests(makeMockRepo());
});

afterEach(() => {
  __setTemplateDbForTests(null);
});

describe('GET /api/plantillas (list active)', () => {
  it('returns 200 with {spitches: SpitchDTO[]} for a valid area+type', async () => {
    const a = makeTemplate({ id: 'a', type: 'company' });
    const listByAreaAndType = vi.fn().mockResolvedValue([a]);
    __setTemplateDbForTests(makeMockRepo({ listByAreaAndType }));

    const response = await GET(makeGetRequest({ area: 'consolidados', type: 'company' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.spitches).toEqual([
      {
        id: 'a',
        area: 'consolidados',
        type: 'company',
        name: 'Welcome',
        subject: 'Hello {{empresa}}',
        bodyHtml: '<p>{{empresa}}</p>',
      },
    ]);
    // Projection excludes authoring fields.
    expect(body.spitches[0]).not.toHaveProperty('isDefault');
    expect(body.spitches[0]).not.toHaveProperty('currentVersionId');
    expect(body.spitches[0]).not.toHaveProperty('deletedAt');
    expect(listByAreaAndType).toHaveBeenCalledWith('consolidados', 'company');
  });

  it('returns 200 and lists by area only when type is omitted', async () => {
    const a = makeTemplate({ id: 'a', type: 'company' });
    const b = makeTemplate({ id: 'b', type: 'patient' });
    const listByArea = vi.fn().mockResolvedValue([a, b]);
    __setTemplateDbForTests(makeMockRepo({ listByArea }));

    const response = await GET(makeGetRequest({ area: 'consolidados' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.spitches).toHaveLength(2);
    expect(listByArea).toHaveBeenCalledWith('consolidados');
  });

  it('returns 200 with an empty spitches array when no templates exist', async () => {
    const response = await GET(makeGetRequest({ area: 'consolidados' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.spitches).toEqual([]);
  });

  it('returns 400 VALIDATION_ERROR "Unknown area" for an unregistered area', async () => {
    // Spec: area-template-config / "API rejects unknown area".
    const response = await GET(makeGetRequest({ area: 'cobranza' }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toMatch(/unknown area/i);
  });

  it('returns 400 VALIDATION_ERROR when area is missing', async () => {
    const response = await GET(makeGetRequest({}));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 VALIDATION_ERROR when type is not a valid SpitchType', async () => {
    const response = await GET(
      makeGetRequest({ area: 'consolidados', type: 'not-a-type' }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 500 INTERNAL_ERROR when the repo throws an unexpected error', async () => {
    const listByArea = vi.fn().mockRejectedValue(new Error('disk full'));
    __setTemplateDbForTests(makeMockRepo({ listByArea }));

    const response = await GET(makeGetRequest({ area: 'consolidados' }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});

describe('POST /api/plantillas (save)', () => {
  function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      area: 'consolidados',
      type: 'company',
      name: 'Welcome',
      subject: 'Hello {{empresa}}',
      bodyHtml: '<p>{{empresa}}</p>',
      ...overrides,
    };
  }

  it('returns 201 with {id, currentVersionId} on a successful new-template save', async () => {
    const saved = makeTemplate({ id: 'new-1', currentVersionId: 'v-1' });
    const save = vi.fn().mockResolvedValue(saved);
    __setTemplateDbForTests(makeMockRepo({ save }));

    const response = await POST(makePostRequest(validBody()));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({ id: 'new-1', currentVersionId: 'v-1' });
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ area: 'consolidados', type: 'company' }),
    );
  });

  it('returns 201 with the updated id+currentVersionId on an existing-template save', async () => {
    const updated = makeTemplate({ id: 'tpl-existing', currentVersionId: 'v-2' });
    const save = vi.fn().mockResolvedValue(updated);
    __setTemplateDbForTests(makeMockRepo({ save }));

    const response = await POST(
      makePostRequest(validBody({ id: 'tpl-existing' })),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({ id: 'tpl-existing', currentVersionId: 'v-2' });
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tpl-existing' }),
    );
  });

  it('forwards isDefault when provided in the body', async () => {
    const save = vi.fn().mockResolvedValue(makeTemplate({ isDefault: true }));
    __setTemplateDbForTests(makeMockRepo({ save }));

    await POST(makePostRequest(validBody({ isDefault: true })));

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ isDefault: true }),
    );
  });

  it('returns 400 VALIDATION_ERROR when area is unknown', async () => {
    const response = await POST(makePostRequest(validBody({ area: 'cobranza' })));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toMatch(/unknown area/i);
  });

  it('returns 400 VALIDATION_ERROR when type is invalid', async () => {
    const response = await POST(makePostRequest(validBody({ type: 'invalid' })));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 VALIDATION_ERROR when name is missing', async () => {
    const response = await POST(
      makePostRequest(validBody({ name: '' })),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 VALIDATION_ERROR when subject is missing', async () => {
    const response = await POST(
      makePostRequest(validBody({ subject: '' })),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 VALIDATION_ERROR when bodyHtml is missing', async () => {
    const response = await POST(
      makePostRequest(validBody({ bodyHtml: '' })),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 VALIDATION_ERROR when the body is not valid JSON', async () => {
    const response = await POST(
      new Request('http://localhost/api/plantillas', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not-json',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 VALIDATION_ERROR when the body is not an object', async () => {
    const response = await POST(makePostRequest([]));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 500 INTERNAL_ERROR when the repo throws an unexpected error', async () => {
    const save = vi.fn().mockRejectedValue(new Error('unique constraint'));
    __setTemplateDbForTests(makeMockRepo({ save }));

    const response = await POST(makePostRequest(validBody()));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});

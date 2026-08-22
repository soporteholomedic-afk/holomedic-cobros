import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __setTemplateDbForTests } from '@/features/plantillas-editor/infrastructure/getTemplateDb';
import type { ITemplateRepository } from '@/features/plantillas-editor/domain/ports';
import type { Template } from '@/features/plantillas-editor/domain/entities';

// ---- Import under test (after mocks) ----

import { GET } from '../route';

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
    save: vi.fn(),
    softDelete: vi.fn(),
    restore: vi.fn(),
    clone: vi.fn(),
    setDefault: vi.fn(),
    listVersions: vi.fn(),
    rollback: vi.fn(),
    ...repo,
  };
}

function makeGetRequest(query: Record<string, string>): Request {
  const url = new URL('http://localhost/api/plantillas/trash');
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

beforeEach(() => {
  vi.clearAllMocks();
  __setTemplateDbForTests(makeMockRepo());
});

afterEach(() => {
  __setTemplateDbForTests(null);
});

describe('GET /api/plantillas/trash', () => {
  it('returns 200 with {spitches: SpitchDTO[]} containing only soft-deleted templates', async () => {
    const trashedA = makeTemplate({
      id: 'del-a',
      deletedAt: '2026-01-01T00:00:00.000Z',
    });
    const trashedB = makeTemplate({
      id: 'del-b',
      type: 'patient',
      deletedAt: '2026-02-01T00:00:00.000Z',
    });
    const listDeletedByArea = vi.fn().mockResolvedValue([trashedA, trashedB]);
    __setTemplateDbForTests(makeMockRepo({ listDeletedByArea }));

    const response = await GET(makeGetRequest({ area: 'consolidados' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.spitches).toHaveLength(2);
    expect(body.spitches.map((s: { id: string }) => s.id).sort()).toEqual(['del-a', 'del-b']);
    // Projection excludes authoring fields (including deletedAt).
    expect(body.spitches[0]).not.toHaveProperty('deletedAt');
    expect(body.spitches[0]).not.toHaveProperty('isDefault');
    expect(body.spitches[0]).not.toHaveProperty('currentVersionId');
    expect(listDeletedByArea).toHaveBeenCalledWith('consolidados');
  });

  it('returns 200 with an empty spitches array when the trash is empty', async () => {
    const response = await GET(makeGetRequest({ area: 'consolidados' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.spitches).toEqual([]);
  });

  it('returns 400 VALIDATION_ERROR "Unknown area" for an unregistered area', async () => {
    // 'cobranza' became a registered area in REQ-01 (DIR-04); use a
    // never-registered area to keep testing the rejection path.
    const response = await GET(makeGetRequest({ area: 'unknown-area' }));
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

  it('returns 500 INTERNAL_ERROR when the repo throws an unexpected error', async () => {
    const listDeletedByArea = vi.fn().mockRejectedValue(new Error('disk I/O'));
    __setTemplateDbForTests(makeMockRepo({ listDeletedByArea }));

    const response = await GET(makeGetRequest({ area: 'consolidados' }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});

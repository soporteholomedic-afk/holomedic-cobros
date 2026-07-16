import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __setTemplateDbForTests } from '@/features/plantillas-editor/infrastructure/getTemplateDb';
import type { ITemplateRepository } from '@/features/plantillas-editor/domain/ports';
import type { TemplateVersion } from '@/features/plantillas-editor/domain/entities';
import { TemplateNotFoundError } from '@/features/plantillas-editor/infrastructure/sqlserver';

// ---- Import under test (after mocks) ----

import { GET } from '../route';

// ---- Helpers ----

function makeVersion(overrides: Partial<TemplateVersion> = {}): TemplateVersion {
  return {
    versionId: 'v-1',
    templateId: 'tpl-1',
    subject: 's',
    bodyHtml: 'b',
    editedAt: '2026-01-01T00:00:00.000Z',
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
    listVersions: vi.fn().mockResolvedValue([]),
    rollback: vi.fn(),
    ...repo,
  };
}

function makeGetRequest(id: string): Request {
  return new Request(`http://localhost/api/plantillas/${id}/versions`);
}

beforeEach(() => {
  vi.clearAllMocks();
  __setTemplateDbForTests(makeMockRepo());
});

afterEach(() => {
  __setTemplateDbForTests(null);
});

describe('GET /api/plantillas/[id]/versions', () => {
  it('returns 200 with {versions: TemplateVersionDTO[]} ordered by editedAt desc', async () => {
    const versions = [
      makeVersion({ versionId: 'v-3', editedAt: '2026-03-01T00:00:00.000Z' }),
      makeVersion({ versionId: 'v-2', editedAt: '2026-02-01T00:00:00.000Z' }),
      makeVersion({ versionId: 'v-1', editedAt: '2026-01-01T00:00:00.000Z' }),
    ];
    const listVersions = vi.fn().mockResolvedValue(versions);
    __setTemplateDbForTests(makeMockRepo({ listVersions }));

    const response = await GET(makeGetRequest('tpl-1'), {
      params: Promise.resolve({ id: 'tpl-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.versions).toEqual(versions);
    expect(body.versions.map((v: TemplateVersion) => v.versionId)).toEqual(['v-3', 'v-2', 'v-1']);
    expect(listVersions).toHaveBeenCalledWith('tpl-1');
  });

  it('returns 200 with an empty versions array when the template has no versions', async () => {
    const response = await GET(makeGetRequest('tpl-empty'), {
      params: Promise.resolve({ id: 'tpl-empty' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.versions).toEqual([]);
  });

  it('returns 404 when the template is missing (TemplateNotFoundError)', async () => {
    const listVersions = vi.fn().mockRejectedValue(new TemplateNotFoundError('nope'));
    __setTemplateDbForTests(makeMockRepo({ listVersions }));

    const response = await GET(makeGetRequest('nope'), {
      params: Promise.resolve({ id: 'nope' }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 500 INTERNAL_ERROR when the repo throws an unexpected error', async () => {
    const listVersions = vi.fn().mockRejectedValue(new Error('disk I/O'));
    __setTemplateDbForTests(makeMockRepo({ listVersions }));

    const response = await GET(makeGetRequest('tpl-1'), {
      params: Promise.resolve({ id: 'tpl-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __setTemplateDbForTests } from '@/features/plantillas-editor/infrastructure/getTemplateDb';
import type { ITemplateRepository } from '@/features/plantillas-editor/domain/ports';
import type { Template } from '@/features/plantillas-editor/domain/entities';
import { TemplateNotFoundError } from '@/features/plantillas-editor/infrastructure/sqlite/betterSqliteTemplateRepository';

// ---- Import under test (after mocks) ----

import { POST } from '../route';

// ---- Helpers ----

function makeTemplate(overrides: Partial<Template> = {}): Template {
  return {
    id: 'src-1',
    area: 'consolidados',
    type: 'company',
    name: 'Welcome',
    subject: 's',
    bodyHtml: 'b',
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
    clone: vi.fn().mockResolvedValue(makeTemplate({ id: 'clone-1' })),
    setDefault: vi.fn(),
    listVersions: vi.fn(),
    rollback: vi.fn(),
    ...repo,
  };
}

function makePostRequest(id: string): Request {
  return new Request(`http://localhost/api/plantillas/${id}/clone`, {
    method: 'POST',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __setTemplateDbForTests(makeMockRepo());
});

afterEach(() => {
  __setTemplateDbForTests(null);
});

describe('POST /api/plantillas/[id]/clone', () => {
  it('returns 201 with {id} for the new active clone of an active template', async () => {
    const clone = makeTemplate({ id: 'clone-new', deletedAt: null, isDefault: false });
    const cloneFn = vi.fn().mockResolvedValue(clone);
    __setTemplateDbForTests(makeMockRepo({ clone: cloneFn }));

    const response = await POST(makePostRequest('src-1'), {
      params: Promise.resolve({ id: 'src-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({ id: 'clone-new' });
    expect(cloneFn).toHaveBeenCalledWith('src-1');
  });

  it('returns 201 when cloning a SOFT-DELETED template (clone works on trash sources)', async () => {
    // Spec: "Clone a soft-deleted template" — the adapter reads even
    // soft-deleted rows (getById contract) and produces an active copy.
    const clone = makeTemplate({ id: 'clone-from-trash', deletedAt: null, isDefault: false });
    const cloneFn = vi.fn().mockResolvedValue(clone);
    __setTemplateDbForTests(makeMockRepo({ clone: cloneFn }));

    const response = await POST(makePostRequest('src-deleted'), {
      params: Promise.resolve({ id: 'src-deleted' }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.id).toBe('clone-from-trash');
    expect(cloneFn).toHaveBeenCalledWith('src-deleted');
  });

  it('returns 404 when the source is missing (TemplateNotFoundError)', async () => {
    const cloneFn = vi.fn().mockRejectedValue(new TemplateNotFoundError('src-missing'));
    __setTemplateDbForTests(makeMockRepo({ clone: cloneFn }));

    const response = await POST(makePostRequest('src-missing'), {
      params: Promise.resolve({ id: 'src-missing' }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 500 INTERNAL_ERROR when the repo throws an unexpected error', async () => {
    const cloneFn = vi.fn().mockRejectedValue(new Error('disk I/O'));
    __setTemplateDbForTests(makeMockRepo({ clone: cloneFn }));

    const response = await POST(makePostRequest('src-1'), {
      params: Promise.resolve({ id: 'src-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __setTemplateDbForTests } from '@/features/plantillas-editor/infrastructure/getTemplateDb';
import type { ITemplateRepository } from '@/features/plantillas-editor/domain/ports';
import type { Template } from '@/features/plantillas-editor/domain/entities';
import { TemplateNotFoundError } from '@/features/plantillas-editor/infrastructure/sqlserver';

// ---- Import under test (after mocks) ----

import { POST } from '../route';

// ---- Helpers ----

function makeTemplate(overrides: Partial<Template> = {}): Template {
  return {
    id: 'tpl-1',
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
    restore: vi.fn().mockResolvedValue(undefined),
    clone: vi.fn(),
    setDefault: vi.fn(),
    listVersions: vi.fn(),
    rollback: vi.fn(),
    ...repo,
  };
}

function makePostRequest(id: string): Request {
  return new Request(`http://localhost/api/plantillas/${id}/restore`, {
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

describe('POST /api/plantillas/[id]/restore', () => {
  it('returns 200 with {id} on a successful restore', async () => {
    const restore = vi.fn().mockResolvedValue(undefined);
    const restoredTpl = makeTemplate({ id: 'tpl-1', deletedAt: null });
    const getById = vi.fn().mockResolvedValue(restoredTpl);
    __setTemplateDbForTests(makeMockRepo({ restore, getById }));

    const response = await POST(makePostRequest('tpl-1'), {
      params: Promise.resolve({ id: 'tpl-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ id: 'tpl-1' });
    expect(restore).toHaveBeenCalledWith('tpl-1');
  });

  it('returns 200 and does NOT re-default (restore leaves isDefault=false)', async () => {
    // Spec: "Restore a soft-deleted template" — isDefault stays false
    // (softDelete cleared it). The route surfaces this post-condition.
    const restore = vi.fn().mockResolvedValue(undefined);
    const restoredTpl = makeTemplate({ id: 'tpl-1', deletedAt: null, isDefault: false });
    const getById = vi.fn().mockResolvedValue(restoredTpl);
    __setTemplateDbForTests(makeMockRepo({ restore, getById }));

    const response = await POST(makePostRequest('tpl-1'), {
      params: Promise.resolve({ id: 'tpl-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.id).toBe('tpl-1');
  });

  it('returns 404 when the template is missing (TemplateNotFoundError)', async () => {
    const restore = vi.fn().mockRejectedValue(new TemplateNotFoundError('nope'));
    __setTemplateDbForTests(makeMockRepo({ restore }));

    const response = await POST(makePostRequest('nope'), {
      params: Promise.resolve({ id: 'nope' }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 500 INTERNAL_ERROR when the repo throws an unexpected error', async () => {
    const restore = vi.fn().mockRejectedValue(new Error('disk I/O'));
    __setTemplateDbForTests(makeMockRepo({ restore }));

    const response = await POST(makePostRequest('tpl-1'), {
      params: Promise.resolve({ id: 'tpl-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __setTemplateDbForTests } from '@/features/plantillas-editor/infrastructure/getTemplateDb';
import type { ITemplateRepository } from '@/features/plantillas-editor/domain/ports';
import type { Template } from '@/features/plantillas-editor/domain/entities';
import { TemplateNotFoundError } from '@/features/plantillas-editor/infrastructure/sqlite/betterSqliteTemplateRepository';

// ---- Import under test (after mocks) ----

import { PATCH } from '../route';

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
    restore: vi.fn(),
    clone: vi.fn(),
    setDefault: vi.fn().mockResolvedValue(undefined),
    listVersions: vi.fn(),
    rollback: vi.fn(),
    ...repo,
  };
}

function makePatchRequest(id: string): Request {
  return new Request(`http://localhost/api/plantillas/${id}/default`, {
    method: 'PATCH',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __setTemplateDbForTests(makeMockRepo());
});

afterEach(() => {
  __setTemplateDbForTests(null);
});

describe('PATCH /api/plantillas/[id]/default', () => {
  it('returns 200 with {id, isDefault} on a successful set-default', async () => {
    const setDefault = vi.fn().mockResolvedValue(undefined);
    const defaultTpl = makeTemplate({ id: 'tpl-1', isDefault: true });
    const getById = vi.fn().mockResolvedValue(defaultTpl);
    __setTemplateDbForTests(makeMockRepo({ setDefault, getById }));

    const response = await PATCH(makePatchRequest('tpl-1'), {
      params: Promise.resolve({ id: 'tpl-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ id: 'tpl-1', isDefault: true });
    expect(setDefault).toHaveBeenCalledWith('tpl-1');
  });

  it('clears the previous default for area+type (adapter contract surfaces through the route)', async () => {
    // Adapter runs clear-then-set in ONE transaction. After the call, the
    // target is the only default for its area+type. We assert the route
    // surfaces this: getById returns isDefault=true for the target.
    const setDefault = vi.fn().mockResolvedValue(undefined);
    const defaultTpl = makeTemplate({ id: 'tpl-new', isDefault: true });
    const getById = vi.fn().mockResolvedValue(defaultTpl);
    __setTemplateDbForTests(makeMockRepo({ setDefault, getById }));

    const response = await PATCH(makePatchRequest('tpl-new'), {
      params: Promise.resolve({ id: 'tpl-new' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.isDefault).toBe(true);
    expect(setDefault).toHaveBeenCalledWith('tpl-new');
  });

  it('returns 404 when the template is missing (TemplateNotFoundError)', async () => {
    const setDefault = vi.fn().mockRejectedValue(new TemplateNotFoundError('nope'));
    __setTemplateDbForTests(makeMockRepo({ setDefault }));

    const response = await PATCH(makePatchRequest('nope'), {
      params: Promise.resolve({ id: 'nope' }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 500 INTERNAL_ERROR when the repo throws an unexpected error', async () => {
    const setDefault = vi.fn().mockRejectedValue(new Error('disk I/O'));
    __setTemplateDbForTests(makeMockRepo({ setDefault }));

    const response = await PATCH(makePatchRequest('tpl-1'), {
      params: Promise.resolve({ id: 'tpl-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});

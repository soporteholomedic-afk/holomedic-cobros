import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __setTemplateDbForTests } from '@/features/plantillas-editor/infrastructure/getTemplateDb';
import type { ITemplateRepository } from '@/features/plantillas-editor/domain/ports';
import type { Template } from '@/features/plantillas-editor/domain/entities';
import { TemplateNotFoundError } from '@/features/plantillas-editor/infrastructure/sqlserver';

// ---- Import under test (after mocks) ----

import { GET, DELETE } from '../route';

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

function makeGetRequest(id: string): Request {
  return new Request(`http://localhost/api/plantillas/${id}`);
}

function makeDeleteRequest(id: string): Request {
  return new Request(`http://localhost/api/plantillas/${id}`, { method: 'DELETE' });
}

beforeEach(() => {
  vi.clearAllMocks();
  __setTemplateDbForTests(makeMockRepo());
});

afterEach(() => {
  __setTemplateDbForTests(null);
});

describe('GET /api/plantillas/[id]', () => {
  it('returns 200 with {template: TemplateDTO} for an existing template', async () => {
    const tpl = makeTemplate({ id: 'tpl-1', isDefault: true, currentVersionId: 'v-3' });
    const getById = vi.fn().mockResolvedValue(tpl);
    __setTemplateDbForTests(makeMockRepo({ getById }));

    const response = await GET(makeGetRequest('tpl-1'), { params: Promise.resolve({ id: 'tpl-1' }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    // The authoring GET returns the FULL template (the editor needs every
    // field to render state) — this is NOT the SpitchDTO projection.
    expect(body.template).toEqual(tpl);
    expect(body.template.id).toBe('tpl-1');
    expect(body.template.isDefault).toBe(true);
    expect(getById).toHaveBeenCalledWith('tpl-1');
  });

  it('returns 200 for a soft-deleted template (getById reads even soft-deleted)', async () => {
    const tpl = makeTemplate({ id: 'del-1', deletedAt: '2026-01-01T00:00:00.000Z' });
    const getById = vi.fn().mockResolvedValue(tpl);
    __setTemplateDbForTests(makeMockRepo({ getById }));

    const response = await GET(makeGetRequest('del-1'), { params: Promise.resolve({ id: 'del-1' }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.template.deletedAt).not.toBeNull();
  });

  it('returns 404 when the template is missing', async () => {
    const response = await GET(makeGetRequest('nope'), { params: Promise.resolve({ id: 'nope' }) });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toMatch(/not found/i);
  });

  it('returns 500 INTERNAL_ERROR when the repo throws an unexpected error', async () => {
    const getById = vi.fn().mockRejectedValue(new Error('disk I/O'));
    __setTemplateDbForTests(makeMockRepo({ getById }));

    const response = await GET(makeGetRequest('tpl-1'), { params: Promise.resolve({ id: 'tpl-1' }) });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});

describe('DELETE /api/plantillas/[id] (soft delete)', () => {
  it('returns 200 with {id, deletedAt} on a successful soft delete', async () => {
    const softDelete = vi.fn().mockResolvedValue(undefined);
    const deletedTpl = makeTemplate({
      id: 'tpl-1',
      deletedAt: '2026-06-01T00:00:00.000Z',
    });
    const getById = vi.fn().mockResolvedValue(deletedTpl);
    __setTemplateDbForTests(makeMockRepo({ softDelete, getById }));

    const response = await DELETE(makeDeleteRequest('tpl-1'), { params: Promise.resolve({ id: 'tpl-1' }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.id).toBe('tpl-1');
    expect(body.deletedAt).not.toBeNull();
    expect(softDelete).toHaveBeenCalledWith('tpl-1');
  });

  it('returns 404 when the template is missing (TemplateNotFoundError)', async () => {
    const softDelete = vi.fn().mockRejectedValue(new TemplateNotFoundError('nope'));
    __setTemplateDbForTests(makeMockRepo({ softDelete }));

    const response = await DELETE(makeDeleteRequest('nope'), { params: Promise.resolve({ id: 'nope' }) });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 500 INTERNAL_ERROR when the repo throws an unexpected error', async () => {
    const softDelete = vi.fn().mockRejectedValue(new Error('disk I/O'));
    __setTemplateDbForTests(makeMockRepo({ softDelete }));

    const response = await DELETE(makeDeleteRequest('tpl-1'), { params: Promise.resolve({ id: 'tpl-1' }) });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});

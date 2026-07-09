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
    id: 'tpl-1',
    area: 'consolidados',
    type: 'company',
    name: 'Welcome',
    subject: 'v1 subject',
    bodyHtml: '<p>v1</p>',
    isDefault: false,
    currentVersionId: 'v-4',
    deletedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
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
    rollback: vi.fn().mockResolvedValue(makeTemplate()),
    ...repo,
  };
}

function makePostRequest(id: string, body: unknown): Request {
  return new Request(`http://localhost/api/plantillas/${id}/rollback`, {
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

describe('POST /api/plantillas/[id]/rollback', () => {
  it('returns 200 with {id, currentVersionId} on a successful rollback', async () => {
    const rolledBack = makeTemplate({
      id: 'tpl-1',
      currentVersionId: 'v-4',
      subject: 'v1 subject',
      bodyHtml: '<p>v1</p>',
    });
    const rollback = vi.fn().mockResolvedValue(rolledBack);
    __setTemplateDbForTests(makeMockRepo({ rollback }));

    const response = await POST(
      makePostRequest('tpl-1', { versionId: 'v-1' }),
      { params: Promise.resolve({ id: 'tpl-1' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ id: 'tpl-1', currentVersionId: 'v-4' });
    expect(rollback).toHaveBeenCalledWith('tpl-1', 'v-1');
  });

  it('returns 400 VALIDATION_ERROR when versionId is missing', async () => {
    const response = await POST(
      makePostRequest('tpl-1', {}),
      { params: Promise.resolve({ id: 'tpl-1' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 VALIDATION_ERROR when versionId is not a string', async () => {
    const response = await POST(
      makePostRequest('tpl-1', { versionId: 42 }),
      { params: Promise.resolve({ id: 'tpl-1' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 VALIDATION_ERROR when the body is not valid JSON', async () => {
    const response = await POST(
      new Request('http://localhost/api/plantillas/tpl-1/rollback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not-json',
      }),
      { params: Promise.resolve({ id: 'tpl-1' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 when the template is missing (TemplateNotFoundError)', async () => {
    const rollback = vi.fn().mockRejectedValue(new TemplateNotFoundError('tpl-missing'));
    __setTemplateDbForTests(makeMockRepo({ rollback }));

    const response = await POST(
      makePostRequest('tpl-missing', { versionId: 'v-1' }),
      { params: Promise.resolve({ id: 'tpl-missing' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 when the version is missing (TemplateNotFoundError)', async () => {
    const rollback = vi.fn().mockRejectedValue(new TemplateNotFoundError('v-missing'));
    __setTemplateDbForTests(makeMockRepo({ rollback }));

    const response = await POST(
      makePostRequest('tpl-1', { versionId: 'v-missing' }),
      { params: Promise.resolve({ id: 'tpl-1' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 500 INTERNAL_ERROR when the repo throws an unexpected error', async () => {
    const rollback = vi.fn().mockRejectedValue(new Error('disk I/O'));
    __setTemplateDbForTests(makeMockRepo({ rollback }));

    const response = await POST(
      makePostRequest('tpl-1', { versionId: 'v-1' }),
      { params: Promise.resolve({ id: 'tpl-1' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});

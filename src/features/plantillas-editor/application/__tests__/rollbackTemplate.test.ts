import { describe, it, expect, vi } from 'vitest';

import type { Template } from '../../domain/entities';
import type { ITemplateRepository } from '../../domain/ports';
import { RollbackTemplateUseCase } from '../rollbackTemplate';

/**
 * Unit tests for `RollbackTemplateUseCase`.
 *
 * Spec: email-template-store / "Rollback is append-only" + email-template-editor
 * / "Rollback to a previous version".
 *
 * The use case is a thin orchestrator: it forwards `templateId` + `versionId`
 * to `ITemplateRepository.rollback`, which COPIES the target version's content
 * into a NEW version row (never mutating or deleting existing rows) and
 * updates `currentVersionId`. `TemplateNotFoundError` bubbles up (thrown by
 * the adapter when the template or version is missing) so the route can map
 * it to HTTP 404.
 */
describe('RollbackTemplateUseCase', () => {
  function makeTemplate(overrides: Partial<Template> = {}): Template {
    return {
      id: 'tpl-1',
      area: 'consolidados',
      type: 'company',
      name: 'Welcome',
      subject: 'v1 subject',
      bodyHtml: '<p>v1</p>',
      isDefault: false,
      currentVersionId: 'v-3',
      deletedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
      ...overrides,
    };
  }

  function makeMockRepo(rollbackFn?: ReturnType<typeof vi.fn>): ITemplateRepository {
    const defaultRollback = vi.fn().mockResolvedValue(makeTemplate());
    return {
      listByArea: vi.fn(),
      listByAreaAndType: vi.fn(),
      listDeletedByArea: vi.fn(),
      getById: vi.fn(),
      save: vi.fn(),
      softDelete: vi.fn(),
      restore: vi.fn(),
      clone: vi.fn(),
      setDefault: vi.fn(),
      listVersions: vi.fn(),
      rollback: rollbackFn ?? defaultRollback,
    };
  }

  it('rolls back to a version by delegating to repo.rollback and returns the template', async () => {
    // After rollback: currentVersionId is a NEW id (v-4), subject/body
    // come from the target version (v-1). The adapter does the copy.
    const rolledBack = makeTemplate({
      currentVersionId: 'v-4',
      subject: 'v1 subject',
      bodyHtml: '<p>v1</p>',
    });
    const rollback = vi.fn().mockResolvedValue(rolledBack);
    const useCase = new RollbackTemplateUseCase(makeMockRepo(rollback));

    const result = await useCase.execute('tpl-1', 'v-1');

    expect(result).toEqual(rolledBack);
    expect(result.currentVersionId).toBe('v-4');
    expect(rollback).toHaveBeenCalledWith('tpl-1', 'v-1');
    expect(rollback).toHaveBeenCalledTimes(1);
  });

  it('forwards both templateId and versionId verbatim (no swapping)', async () => {
    const rollback = vi.fn().mockResolvedValue(makeTemplate());
    const useCase = new RollbackTemplateUseCase(makeMockRepo(rollback));

    await useCase.execute('tpl-42', 'v-7');

    expect(rollback).toHaveBeenCalledWith('tpl-42', 'v-7');
  });

  it('propagates TemplateNotFoundError when the template is missing (route maps to 404)', async () => {
    const { TemplateNotFoundError } = await import(
      '../../infrastructure/sqlite/betterSqliteTemplateRepository'
    );
    const rollback = vi.fn().mockRejectedValue(new TemplateNotFoundError('tpl-missing'));
    const useCase = new RollbackTemplateUseCase(makeMockRepo(rollback));

    await expect(useCase.execute('tpl-missing', 'v-1')).rejects.toThrow(
      TemplateNotFoundError,
    );
  });

  it('propagates TemplateNotFoundError when the version is missing (route maps to 404)', async () => {
    const { TemplateNotFoundError } = await import(
      '../../infrastructure/sqlite/betterSqliteTemplateRepository'
    );
    const rollback = vi.fn().mockRejectedValue(new TemplateNotFoundError('v-missing'));
    const useCase = new RollbackTemplateUseCase(makeMockRepo(rollback));

    await expect(useCase.execute('tpl-1', 'v-missing')).rejects.toThrow(
      TemplateNotFoundError,
    );
  });
});

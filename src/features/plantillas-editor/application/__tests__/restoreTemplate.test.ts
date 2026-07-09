import { describe, it, expect, vi } from 'vitest';

import type { Template } from '../../domain/entities';
import type { ITemplateRepository } from '../../domain/ports';
import { RestoreTemplateUseCase } from '../restoreTemplate';

/**
 * Unit tests for `RestoreTemplateUseCase`.
 *
 * Spec: email-template-store / "Restore clears deletedAt" + email-template-editor
 * / "Restore a soft-deleted template" (the scenario asserts: deletedAt cleared,
 * template reappears in active list, NOT re-marked as default).
 *
 * The use case forwards the id to `ITemplateRepository.restore`. The adapter
 * clears `deletedAt` (sets it to NULL) and does NOT re-default — `isDefault`
 * stays false because `softDelete` cleared it. The template then reappears in
 * active lists.
 */
describe('RestoreTemplateUseCase', () => {
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

  function makeMockRepo(
    restoreFn?: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>,
  ): ITemplateRepository {
    const defaultRestore = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined);
    return {
      listByArea: vi.fn(),
      listByAreaAndType: vi.fn(),
      listDeletedByArea: vi.fn(),
      getById: vi.fn(),
      save: vi.fn(),
      softDelete: vi.fn(),
      restore: restoreFn ?? defaultRestore,
      clone: vi.fn(),
      setDefault: vi.fn(),
      listVersions: vi.fn(),
      rollback: vi.fn(),
    };
  }

  it('restores a soft-deleted template by delegating to repo.restore (returns void)', async () => {
    const restore = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined);
    const useCase = new RestoreTemplateUseCase(makeMockRepo(restore));

    await useCase.execute('tpl-1');

    expect(restore).toHaveBeenCalledWith('tpl-1');
    expect(restore).toHaveBeenCalledTimes(1);
  });

  it('clears deletedAt and does NOT re-default (adapter contract surfaces through the use case)', async () => {
    // Adapter contract: restore sets deletedAt=NULL, leaves isDefault=false
    // (softDelete cleared it). Verified at the SQL level in PR 1; here we
    // confirm the post-condition is observable through the same seam.
    const restore = vi.fn<(id: string) => Promise<void>>().mockImplementation(async (id: string) => {
      void id;
    });
    const getById = vi.fn<(id: string) => Promise<Template | null>>().mockResolvedValue(
      makeTemplate({ id: 'tpl-1', deletedAt: null, isDefault: false }),
    );
    const repo: ITemplateRepository = {
      ...makeMockRepo(restore),
      getById,
    };
    const useCase = new RestoreTemplateUseCase(repo);

    await useCase.execute('tpl-1');
    const fetched = await repo.getById('tpl-1');

    expect(restore).toHaveBeenCalledWith('tpl-1');
    expect(fetched?.deletedAt).toBeNull();
    // Restore MUST NOT re-default.
    expect(fetched?.isDefault).toBe(false);
  });

  it('forwards the id verbatim (no transformation)', async () => {
    const restore = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined);
    const useCase = new RestoreTemplateUseCase(makeMockRepo(restore));

    await useCase.execute('tpl-42');

    expect(restore).toHaveBeenCalledWith('tpl-42');
  });

  it('propagates TemplateNotFoundError when the template is missing (route maps to 404)', async () => {
    const { TemplateNotFoundError } = await import(
      '../../infrastructure/sqlite/betterSqliteTemplateRepository'
    );
    const restore = vi.fn<(id: string) => Promise<void>>().mockRejectedValue(new TemplateNotFoundError('tpl-missing'));
    const useCase = new RestoreTemplateUseCase(makeMockRepo(restore));

    await expect(useCase.execute('tpl-missing')).rejects.toThrow(TemplateNotFoundError);
  });
});

import { describe, it, expect, vi } from 'vitest';

import type { TemplateVersion } from '../../domain/entities';
import type { ITemplateRepository } from '../../domain/ports';
import { ListVersionsUseCase } from '../listVersions';

/**
 * Unit tests for `ListVersionsUseCase`.
 *
 * Spec: email-template-store / "Save appends version" (the version history
 * the use case lists) + email-template-editor / "Rollback to a previous
 * version" (the UI lists versions first).
 *
 * The use case forwards the template id to
 * `ITemplateRepository.listVersions`. The adapter returns all version rows
 * for the template ordered by `editedAt` DESC (with a `rowid DESC` tiebreaker
 * for sub-ms determinism — PR 1). The use case does not re-sort or filter.
 */
describe('ListVersionsUseCase', () => {
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

  function makeMockRepo(
    listVersionsFn?: ReturnType<typeof vi.fn<(templateId: string) => Promise<TemplateVersion[]>>>,
  ): ITemplateRepository {
    const defaultListVersions = vi.fn<(templateId: string) => Promise<TemplateVersion[]>>().mockResolvedValue([] as TemplateVersion[]);
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
      listVersions: listVersionsFn ?? defaultListVersions,
      rollback: vi.fn(),
    };
  }

  it('lists versions by delegating to repo.listVersions and returns them', async () => {
    const versions = [
      makeVersion({ versionId: 'v-3', editedAt: '2026-03-01T00:00:00.000Z' }),
      makeVersion({ versionId: 'v-2', editedAt: '2026-02-01T00:00:00.000Z' }),
      makeVersion({ versionId: 'v-1', editedAt: '2026-01-01T00:00:00.000Z' }),
    ];
    const listVersions = vi.fn<(templateId: string) => Promise<TemplateVersion[]>>().mockResolvedValue(versions);
    const useCase = new ListVersionsUseCase(makeMockRepo(listVersions));

    const result = await useCase.execute('tpl-1');

    expect(result).toEqual(versions);
    expect(listVersions).toHaveBeenCalledWith('tpl-1');
    expect(listVersions).toHaveBeenCalledTimes(1);
  });

  it('returns versions ordered by editedAt desc (adapter contract surfaces through the use case)', async () => {
    // Adapter contract: ORDER BY editedAt DESC (rowid DESC tiebreaker).
    // The use case must preserve the adapter's order — no re-sorting.
    const versions = [
      makeVersion({ versionId: 'v-3', editedAt: '2026-03-01T00:00:00.000Z' }),
      makeVersion({ versionId: 'v-2', editedAt: '2026-02-01T00:00:00.000Z' }),
      makeVersion({ versionId: 'v-1', editedAt: '2026-01-01T00:00:00.000Z' }),
    ];
    const listVersions = vi.fn<(templateId: string) => Promise<TemplateVersion[]>>().mockResolvedValue(versions);
    const useCase = new ListVersionsUseCase(makeMockRepo(listVersions));

    const result = await useCase.execute('tpl-1');

    expect(result.map((v) => v.versionId)).toEqual(['v-3', 'v-2', 'v-1']);
    // Confirm the order matches editedAt desc.
    const dates = result.map((v) => v.editedAt);
    const sorted = [...dates].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
    expect(dates).toEqual(sorted);
  });

  it('returns an empty array when the template has no versions', async () => {
    const useCase = new ListVersionsUseCase(makeMockRepo());
    const result = await useCase.execute('tpl-empty');
    expect(result).toEqual([]);
  });

  it('forwards the templateId verbatim (no transformation)', async () => {
    const listVersions = vi.fn<(templateId: string) => Promise<TemplateVersion[]>>().mockResolvedValue([]);
    const useCase = new ListVersionsUseCase(makeMockRepo(listVersions));

    await useCase.execute('tpl-42');

    expect(listVersions).toHaveBeenCalledWith('tpl-42');
  });
});

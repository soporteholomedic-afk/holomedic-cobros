import { describe, it, expect, vi } from 'vitest';

import type { Template } from '../../domain/entities';
import type { ITemplateRepository } from '../../domain/ports';
import { ListTemplatesUseCase } from '../listTemplates';

/**
 * Unit tests for `ListTemplatesUseCase`.
 *
 * Spec: email-template-store / "List active templates by area+type" +
 * "Trash view returns only soft-deleted".
 *
 * The use case exposes two list operations:
 *  - `listActive(area, type?)` — active templates (excludes soft-deleted)
 *  - `listTrash(area)` — soft-deleted templates (excludes active)
 *
 * It does not filter or post-process: the adapter enforces the
 * active/deleted split at the SQL level (WHERE deletedAt IS [NOT] NULL).
 * These tests pin the wiring + the active/trash split contract.
 */
describe('ListTemplatesUseCase', () => {
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
      getById: vi.fn(),
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

  describe('listActive', () => {
    it('lists active templates by area+type via listByAreaAndType', async () => {
      const a = makeTemplate({ id: 'a', type: 'company' });
      const listByAreaAndType = vi.fn().mockResolvedValue([a]);
      const useCase = new ListTemplatesUseCase(makeMockRepo({ listByAreaAndType }));

      const result = await useCase.listActive('consolidados', 'company');

      expect(result).toEqual([a]);
      expect(listByAreaAndType).toHaveBeenCalledWith('consolidados', 'company');
    });

    it('lists active templates by area only via listByArea when type is omitted', async () => {
      const a = makeTemplate({ id: 'a', type: 'company' });
      const b = makeTemplate({ id: 'b', type: 'patient' });
      const listByArea = vi.fn().mockResolvedValue([a, b]);
      const useCase = new ListTemplatesUseCase(makeMockRepo({ listByArea }));

      const result = await useCase.listActive('consolidados');

      expect(result).toEqual([a, b]);
      expect(listByArea).toHaveBeenCalledWith('consolidados');
      // listByAreaAndType must NOT be called when no type is provided.
      const listByAreaAndType = vi.fn();
      const uc2 = new ListTemplatesUseCase(
        makeMockRepo({ listByArea, listByAreaAndType }),
      );
      await uc2.listActive('consolidados');
      expect(listByAreaAndType).not.toHaveBeenCalled();
    });

    it('returns an empty array when no active templates exist', async () => {
      const useCase = new ListTemplatesUseCase(makeMockRepo());
      const result = await useCase.listActive('consolidados', 'company');
      expect(result).toEqual([]);
    });
  });

  describe('listTrash', () => {
    it('lists ONLY soft-deleted templates via listDeletedByArea', async () => {
      const trashed = makeTemplate({
        id: 'del-1',
        deletedAt: '2026-01-01T00:00:00.000Z',
      });
      const listDeletedByArea = vi.fn().mockResolvedValue([trashed]);
      const useCase = new ListTemplatesUseCase(makeMockRepo({ listDeletedByArea }));

      const result = await useCase.listTrash('consolidados');

      expect(result).toEqual([trashed]);
      expect(listDeletedByArea).toHaveBeenCalledWith('consolidados');
      // Every returned row is soft-deleted (the adapter enforces this).
      for (const t of result) {
        expect(t.deletedAt).not.toBeNull();
      }
    });

    it('returns an empty array when no soft-deleted templates exist', async () => {
      const useCase = new ListTemplatesUseCase(makeMockRepo());
      const result = await useCase.listTrash('consolidados');
      expect(result).toEqual([]);
    });
  });
});

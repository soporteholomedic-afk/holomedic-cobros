import { describe, it, expect, vi } from 'vitest';

import type { Template } from '../../domain/entities';
import type { ITemplateRepository } from '../../domain/ports';
import { CloneTemplateUseCase } from '../cloneTemplate';

/**
 * Unit tests for `CloneTemplateUseCase`.
 *
 * Spec: email-template-store / "Clone copies content to new active template"
 * + email-template-editor / "Clone an active template" + "Clone a soft-deleted
 * template".
 *
 * The use case forwards the source id to `ITemplateRepository.clone`. The
 * adapter creates a NEW active, non-default template (`isDefault:false`,
 * `deletedAt:null`) with a fresh id, copying subject/body. Clone works on
 * active OR soft-deleted sources — the adapter reads even soft-deleted rows
 * (the `getById` contract), so the use case does not pre-check status.
 */
describe('CloneTemplateUseCase', () => {
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

  function makeMockRepo(
    cloneFn?: ReturnType<typeof vi.fn<(id: string) => Promise<Template>>>,
  ): ITemplateRepository {
    const defaultClone = vi.fn<(id: string) => Promise<Template>>().mockResolvedValue(
      makeTemplate({ id: 'clone-1', isDefault: false, deletedAt: null }),
    );
    return {
      listByArea: vi.fn(),
      listByAreaAndType: vi.fn(),
      listDeletedByArea: vi.fn(),
      getById: vi.fn(),
      save: vi.fn(),
      softDelete: vi.fn(),
      restore: vi.fn(),
      clone: cloneFn ?? defaultClone,
      setDefault: vi.fn(),
      listVersions: vi.fn(),
      rollback: vi.fn(),
    };
  }

  it('clones an ACTIVE template by delegating to repo.clone and returns the new template', async () => {
    const clone = makeTemplate({
      id: 'clone-new',
      isDefault: false,
      deletedAt: null,
      subject: 's',
      bodyHtml: 'b',
    });
    const cloneFn = vi.fn<(id: string) => Promise<Template>>().mockResolvedValue(clone);
    const useCase = new CloneTemplateUseCase(makeMockRepo(cloneFn));

    const result = await useCase.execute('src-1');

    expect(result).toEqual(clone);
    expect(result.id).toBe('clone-new');
    expect(result.id).not.toBe('src-1');
    expect(cloneFn).toHaveBeenCalledWith('src-1');
    expect(cloneFn).toHaveBeenCalledTimes(1);
  });

  it('the cloned template is active, non-default, with a fresh id (adapter contract)', async () => {
    // Adapter guarantees: isDefault=false, deletedAt=null, new id.
    // The use case surfaces these so the route returns 201 with the
    // active copy. We assert the contract holds through the use case.
    const cloneFn = vi.fn<(id: string) => Promise<Template>>().mockResolvedValue(
      makeTemplate({ id: 'fresh-id', isDefault: false, deletedAt: null }),
    );
    const useCase = new CloneTemplateUseCase(makeMockRepo(cloneFn));

    const result = await useCase.execute('src-1');

    expect(result.isDefault).toBe(false);
    expect(result.deletedAt).toBeNull();
    expect(result.id).not.toBe('src-1');
  });

  it('clones a SOFT-DELETED template (clone works on trash sources)', async () => {
    // Spec: "Clone a soft-deleted template" — the adapter reads even
    // soft-deleted rows (getById contract) and produces an active copy.
    const cloneFn = vi.fn<(id: string) => Promise<Template>>().mockResolvedValue(
      makeTemplate({ id: 'clone-from-trash', deletedAt: null, isDefault: false }),
    );
    const useCase = new CloneTemplateUseCase(makeMockRepo(cloneFn));

    const result = await useCase.execute('src-deleted');

    expect(result.deletedAt).toBeNull();
    expect(result.isDefault).toBe(false);
    expect(cloneFn).toHaveBeenCalledWith('src-deleted');
  });

  it('propagates TemplateNotFoundError when the source is missing (route maps to 404)', async () => {
    const { TemplateNotFoundError } = await import(
      '../../infrastructure/sqlserver'
    );
    const cloneFn = vi.fn<(id: string) => Promise<Template>>().mockRejectedValue(new TemplateNotFoundError('src-missing'));
    const useCase = new CloneTemplateUseCase(makeMockRepo(cloneFn));

    await expect(useCase.execute('src-missing')).rejects.toThrow(TemplateNotFoundError);
  });
});

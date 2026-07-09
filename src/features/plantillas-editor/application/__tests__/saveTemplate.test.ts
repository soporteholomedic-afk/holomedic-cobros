import { describe, it, expect, vi } from 'vitest';

import type { SaveTemplateInput, Template } from '../../domain/entities';
import type { ITemplateRepository } from '../../domain/ports';
import { SaveTemplateUseCase } from '../saveTemplate';

/**
 * Unit tests for `SaveTemplateUseCase`.
 *
 * Spec: email-template-store / "Save appends version" + email-template-editor
 * / "Save new template" + "Save existing template appends version".
 *
 * The use case is a thin orchestrator over `ITemplateRepository.save` —
 * the append-only versioning + default-handling logic lives in the
 * adapter (PR 1). These tests pin the wiring: the use case forwards the
 * input verbatim and returns the saved template. The repository is
 * mocked with `vi.fn` so the suite asserts the contract, not SQLite.
 */
describe('SaveTemplateUseCase', () => {
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

  function makeMockRepo(
    saveFn?: ReturnType<typeof vi.fn<(input: SaveTemplateInput) => Promise<Template>>>,
  ): ITemplateRepository {
    const defaultSave = vi.fn<(input: SaveTemplateInput) => Promise<Template>>().mockResolvedValue(makeTemplate());
    return {
      listByArea: vi.fn(),
      listByAreaAndType: vi.fn(),
      listDeletedByArea: vi.fn(),
      getById: vi.fn(),
      save: saveFn ?? defaultSave,
      softDelete: vi.fn(),
      restore: vi.fn(),
      clone: vi.fn(),
      setDefault: vi.fn(),
      listVersions: vi.fn(),
      rollback: vi.fn(),
    };
  }

  it('saves a NEW template by delegating to repo.save and returns the created template', async () => {
    const created = makeTemplate({ id: 'new-1', currentVersionId: 'v-1' });
    const save = vi.fn<(input: SaveTemplateInput) => Promise<Template>>().mockResolvedValue(created);
    const useCase = new SaveTemplateUseCase(makeMockRepo(save));

    const result = await useCase.execute({
      area: 'consolidados',
      type: 'company',
      name: 'Welcome',
      subject: 'Hello {{empresa}}',
      bodyHtml: '<p>{{empresa}}</p>',
    });

    expect(result).toEqual(created);
    // The use case forwards the input verbatim — no mutation, no defaults
    // injected at this layer (default handling is the adapter's job so it
    // runs inside the uniqueness-enforcing transaction).
    expect(save).toHaveBeenCalledWith({
      area: 'consolidados',
      type: 'company',
      name: 'Welcome',
      subject: 'Hello {{empresa}}',
      bodyHtml: '<p>{{empresa}}</p>',
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('saves an EXISTING template by forwarding its id (adapter appends a new version)', async () => {
    // Spec: "Save existing template appends version" — the use case passes
    // `id` through; the adapter inserts a new template_versions row and
    // updates currentVersionId. Here we assert the use case wiring only.
    const updated = makeTemplate({
      id: 'tpl-existing',
      currentVersionId: 'v-2',
      subject: 'v2 subject',
    });
    const save = vi.fn<(input: SaveTemplateInput) => Promise<Template>>().mockResolvedValue(updated);
    const useCase = new SaveTemplateUseCase(makeMockRepo(save));

    const result = await useCase.execute({
      id: 'tpl-existing',
      area: 'consolidados',
      type: 'company',
      name: 'Welcome',
      subject: 'v2 subject',
      bodyHtml: '<p>v2</p>',
    });

    expect(result.currentVersionId).toBe('v-2');
    expect(result.subject).toBe('v2 subject');
    expect(save).toHaveBeenCalledWith({
      id: 'tpl-existing',
      area: 'consolidados',
      type: 'company',
      name: 'Welcome',
      subject: 'v2 subject',
      bodyHtml: '<p>v2</p>',
    });
  });

  it('forwards isDefault when provided (default handling delegated to the adapter)', async () => {
    const save = vi.fn<(input: SaveTemplateInput) => Promise<Template>>().mockResolvedValue(makeTemplate({ isDefault: true }));
    const useCase = new SaveTemplateUseCase(makeMockRepo(save));

    await useCase.execute({
      area: 'consolidados',
      type: 'company',
      name: 'Default',
      subject: 's',
      bodyHtml: 'b',
      isDefault: true,
    });

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ isDefault: true }),
    );
  });

  it('does NOT inject a default isDefault when the caller omits it', async () => {
    // The adapter resolves `isDefault ?? false` internally so the
    // uniqueness invariant is enforced in one place. The use case must
    // not pre-default the field — that would prevent the adapter from
    // distinguishing "caller wants default" from "caller doesn't care".
    const save = vi.fn<(input: SaveTemplateInput) => Promise<Template>>().mockResolvedValue(makeTemplate());
    const useCase = new SaveTemplateUseCase(makeMockRepo(save));

    await useCase.execute({
      area: 'consolidados',
      type: 'company',
      name: 'Welcome',
      subject: 's',
      bodyHtml: 'b',
    });

    const forwarded = save.mock.calls[0]?.[0] as { isDefault?: boolean };
    expect(forwarded.isDefault).toBeUndefined();
  });

  it('propagates repository errors (does not swallow)', async () => {
    // The route's try/catch maps thrown errors to HTTP 500 (or 404 for
    // TemplateNotFoundError). The use case must let them bubble.
    const save = vi.fn<(input: SaveTemplateInput) => Promise<Template>>().mockRejectedValue(new Error('unique constraint'));
    const useCase = new SaveTemplateUseCase(makeMockRepo(save));

    await expect(
      useCase.execute({
        area: 'consolidados',
        type: 'company',
        name: 'x',
        subject: 's',
        bodyHtml: 'b',
      }),
    ).rejects.toThrow('unique constraint');
  });
});

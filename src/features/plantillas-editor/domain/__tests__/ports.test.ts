import { describe, expect, it } from 'vitest';

import type { Template, TemplateVersion } from '../entities';
import { TEMPLATE_REPOSITORY_METHODS } from '../ports';
import type { ITemplateRepository } from '../ports';

/**
 * Contract test for the `ITemplateRepository` port.
 *
 * `TEMPLATE_REPOSITORY_METHODS` is a RUNTIME import — if `ports.ts` does
 * not exist or does not export it, this file fails to load (real RED).
 *
 * The value of this test is twofold:
 *  - COMPILE-TIME: the `repo` object below must satisfy `ITemplateRepository`;
 *    a renamed/removed/re-typed method breaks compilation.
 *  - RUNTIME: `TEMPLATE_REPOSITORY_METHODS` pins the exact method set so an
 *    accidental extra or missing operation is caught, and the per-method
 *    `typeof === 'function'` checks confirm every operation is callable.
 */
describe('ITemplateRepository port', () => {
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

  it('declares exactly the ten template persistence operations', () => {
    expect([...TEMPLATE_REPOSITORY_METHODS].sort()).toEqual([
      'clone',
      'getById',
      'listByArea',
      'listByAreaAndType',
      'listVersions',
      'restore',
      'rollback',
      'save',
      'setDefault',
      'softDelete',
    ]);
  });

  it('a conforming implementation exposes every operation as a function', () => {
    const repo: ITemplateRepository = {
      listByArea: async () => [],
      listByAreaAndType: async () => [],
      getById: async () => null,
      save: async () => makeTemplate(),
      softDelete: async () => undefined,
      restore: async () => undefined,
      clone: async () => makeTemplate({ id: 'tpl-clone' }),
      setDefault: async () => undefined,
      listVersions: async () => [] as TemplateVersion[],
      rollback: async () => makeTemplate({ currentVersionId: 'v-2' }),
    };

    for (const method of TEMPLATE_REPOSITORY_METHODS) {
      expect(typeof repo[method]).toBe('function');
    }
  });

  it('listByAreaAndType accepts a SpitchType and returns a Template array', async () => {
    const repo: ITemplateRepository = {
      listByArea: async () => [],
      listByAreaAndType: async () => [makeTemplate({ type: 'patient' })],
      getById: async () => null,
      save: async () => makeTemplate(),
      softDelete: async () => undefined,
      restore: async () => undefined,
      clone: async () => makeTemplate(),
      setDefault: async () => undefined,
      listVersions: async () => [],
      rollback: async () => makeTemplate(),
    };

    const result = await repo.listByAreaAndType('consolidados', 'patient');
    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe('patient');
  });

  it('getById resolves to null when the template is missing', async () => {
    const repo: ITemplateRepository = {
      listByArea: async () => [],
      listByAreaAndType: async () => [],
      getById: async () => null,
      save: async () => makeTemplate(),
      softDelete: async () => undefined,
      restore: async () => undefined,
      clone: async () => makeTemplate(),
      setDefault: async () => undefined,
      listVersions: async () => [],
      rollback: async () => makeTemplate(),
    };

    expect(await repo.getById('nope')).toBeNull();
  });
});

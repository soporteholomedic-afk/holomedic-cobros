import { describe, it, expect } from 'vitest';

import type { Template } from '../../domain/entities';
import { projectToSpitchDTO } from '../projectToSpitchDTO';

/**
 * Boundary projection tests for `projectToSpitchDTO`.
 *
 * Spec: email-template-store / "Boundary projection to SpitchDTO".
 * Scenario: Projection excludes authoring fields.
 *
 * `projectToSpitchDTO` is a RUNTIME import — if the module does not
 * exist or does not export the function, this file fails to load (real
 * RED, no false-GREEN from `import type` erasure).
 */
describe('projectToSpitchDTO', () => {
  function makeTemplate(overrides: Partial<Template> = {}): Template {
    return {
      id: 'tpl-1',
      area: 'consolidados',
      type: 'company',
      name: 'Welcome',
      subject: 'Hello {{empresa}}',
      bodyHtml: '<p>{{empresa}}</p>',
      isDefault: true,
      currentVersionId: 'v-3',
      deletedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
      ownerId: 'user-7',
      ...overrides,
    };
  }

  it('projects a Template to a SpitchDTO with ONLY the send-flow fields', () => {
    const dto = projectToSpitchDTO(makeTemplate());

    // The exact set of fields the send flow consumes (design Decision b).
    expect(dto).toEqual({
      id: 'tpl-1',
      area: 'consolidados',
      type: 'company',
      name: 'Welcome',
      subject: 'Hello {{empresa}}',
      bodyHtml: '<p>{{empresa}}</p>',
    });
  });

  it('excludes every authoring-only field (versioning, soft-delete, default, timestamps, owner)', () => {
    const dto = projectToSpitchDTO(makeTemplate());

    // Authoring fields MUST NOT leak across the API boundary.
    expect(dto).not.toHaveProperty('isDefault');
    expect(dto).not.toHaveProperty('currentVersionId');
    expect(dto).not.toHaveProperty('deletedAt');
    expect(dto).not.toHaveProperty('createdAt');
    expect(dto).not.toHaveProperty('updatedAt');
    expect(dto).not.toHaveProperty('ownerId');
  });

  it('preserves the area/type/name/subject/bodyHtml values from the source template', () => {
    const tpl = makeTemplate({
      id: 'tpl-99',
      area: 'consolidados',
      type: 'patient',
      name: 'Notif',
      subject: 'Subj {{fecha}}',
      bodyHtml: '<p>{{firma}}</p>',
    });
    const dto = projectToSpitchDTO(tpl);

    expect(dto.id).toBe('tpl-99');
    expect(dto.area).toBe('consolidados');
    expect(dto.type).toBe('patient');
    expect(dto.name).toBe('Notif');
    expect(dto.subject).toBe('Subj {{fecha}}');
    expect(dto.bodyHtml).toBe('<p>{{firma}}</p>');
  });

  it('projects a list of templates preserving order', () => {
    // The list route projects an array — verify the projection is
    // applied element-wise and the input order is preserved.
    const list = [
      makeTemplate({ id: 'a', name: 'A' }),
      makeTemplate({ id: 'b', name: 'B' }),
      makeTemplate({ id: 'c', name: 'C' }),
    ];

    // Reuse the single-projection function in a map to stay explicit;
    // the route composes `list.map(projectToSpitchDTO)` itself.
    const dtos = list.map(projectToSpitchDTO);

    expect(dtos).toHaveLength(3);
    expect(dtos.map((d) => d.id)).toEqual(['a', 'b', 'c']);
    expect(dtos.map((d) => d.name)).toEqual(['A', 'B', 'C']);
  });
});

import { describe, expect, it } from 'vitest';

import { SPITCH_TYPES } from '../entities';
import type {
  SaveTemplateInput,
  SpitchDTO,
  SpitchType,
  Template,
  TemplateVersion,
  TokenAttrs,
} from '../entities';

/**
 * Entity-shape tests for the plantillas-editor domain.
 *
 * `SPITCH_TYPES` is a RUNTIME import — if `entities.ts` does not exist or
 * does not export it, this file fails to load (a real RED, not a trivial
 * pass). The interface field-set checks below are compile-time gated: the
 * `: Template` / `: SpitchDTO` annotations make `tsc` enforce that the
 * literals match the declared shape, and the `Object.keys` assertions pin
 * the expected runtime shape as documentation. `SPITCH_TYPES` is the one
 * value exported here that is genuinely asserted at runtime.
 */
describe('plantillas-editor domain entities', () => {
  describe('SPITCH_TYPES (runtime registry)', () => {
    it('lists exactly the two known template audiences', () => {
      expect(SPITCH_TYPES).toEqual(['company', 'patient']);
    });
  });

  describe('Template', () => {
    it('carries all authoring fields including versioning and soft-delete state', () => {
      const template: Template = {
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
        updatedAt: '2026-01-02T00:00:00.000Z',
      };
      // Compile-time: `: Template` enforces every required field is present.
      // Runtime: pin the expected key set so a future field addition is a
      // conscious update (the test literal must be updated too).
      expect(Object.keys(template).sort()).toEqual([
        'area',
        'bodyHtml',
        'createdAt',
        'currentVersionId',
        'deletedAt',
        'id',
        'isDefault',
        'name',
        'subject',
        'type',
        'updatedAt',
      ]);
      expect(template.isDefault).toBe(true);
      expect(template.currentVersionId).toBe('v-3');
      expect(template.deletedAt).toBeNull();
    });

    it('accepts an optional ownerId reserved for future auth', () => {
      const template: Template = {
        id: 'tpl-2',
        area: 'consolidados',
        type: 'patient',
        name: 'N',
        subject: 's',
        bodyHtml: 'b',
        isDefault: false,
        currentVersionId: null,
        deletedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        ownerId: 'user-1',
      };
      expect(template.ownerId).toBe('user-1');
    });
  });

  describe('TemplateVersion', () => {
    it('holds an immutable snapshot of a template at a point in time', () => {
      const version: TemplateVersion = {
        versionId: 'v-1',
        templateId: 'tpl-1',
        subject: 's',
        bodyHtml: 'b',
        editedAt: '2026-01-01T00:00:00.000Z',
      };
      expect(Object.keys(version).sort()).toEqual([
        'bodyHtml',
        'editedAt',
        'subject',
        'templateId',
        'versionId',
      ]);
    });

    it('accepts an optional editedBy reserved for future auth', () => {
      const version: TemplateVersion = {
        versionId: 'v-2',
        templateId: 'tpl-1',
        subject: 's',
        bodyHtml: 'b',
        editedAt: '2026-01-02T00:00:00.000Z',
        editedBy: 'user-1',
      };
      expect(version.editedBy).toBe('user-1');
    });
  });

  describe('SaveTemplateInput', () => {
    it('requires authoring fields but makes id and isDefault optional', () => {
      const input: SaveTemplateInput = {
        area: 'consolidados',
        type: 'company',
        name: 'Welcome',
        subject: 's',
        bodyHtml: 'b',
      };
      expect(input.id).toBeUndefined();
      expect(input.isDefault).toBeUndefined();
    });

    it('accepts id and isDefault for an update that marks the template default', () => {
      const input: SaveTemplateInput = {
        area: 'consolidados',
        type: 'company',
        name: 'Welcome',
        subject: 's',
        bodyHtml: 'b',
        id: 'tpl-1',
        isDefault: true,
      };
      expect(input.id).toBe('tpl-1');
      expect(input.isDefault).toBe(true);
    });
  });

  describe('SpitchDTO (boundary projection)', () => {
    it('exposes only send-flow fields and omits every authoring field', () => {
      const dto: SpitchDTO = {
        id: 'tpl-1',
        area: 'consolidados',
        type: 'company',
        name: 'Welcome',
        subject: 's',
        bodyHtml: 'b',
      };
      expect(Object.keys(dto).sort()).toEqual([
        'area',
        'bodyHtml',
        'id',
        'name',
        'subject',
        'type',
      ]);
      // Authoring-only fields must NOT be part of the DTO shape.
      expect('isDefault' in dto).toBe(false);
      expect('currentVersionId' in dto).toBe(false);
      expect('deletedAt' in dto).toBe(false);
      expect('createdAt' in dto).toBe(false);
      expect('updatedAt' in dto).toBe(false);
      expect('ownerId' in dto).toBe(false);
    });
  });

  describe('TokenAttrs', () => {
    it('describes a simple token by key only', () => {
      const attrs: TokenAttrs = { key: 'empresa' };
      expect(attrs.key).toBe('empresa');
      expect(attrs.table).toBeUndefined();
      expect(attrs.cols).toBeUndefined();
    });

    it('describes a table token with table name and selected columns', () => {
      const attrs: TokenAttrs = {
        key: 'tabla',
        table: 'documentosVencidos',
        cols: ['fecha', 'monto'],
      };
      expect(attrs.table).toBe('documentosVencidos');
      expect(attrs.cols).toEqual(['fecha', 'monto']);
    });
  });

  describe('SpitchType', () => {
    it('narrows to the same two audiences listed by SPITCH_TYPES', () => {
      const company: SpitchType = 'company';
      const patient: SpitchType = 'patient';
      expect([company, patient]).toEqual([...SPITCH_TYPES]);
    });
  });
});

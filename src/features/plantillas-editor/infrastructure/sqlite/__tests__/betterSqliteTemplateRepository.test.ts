import { describe, expect, it } from 'vitest';

import type { Template } from '../../domain/entities';
import type { ITemplateRepository } from '../../domain/ports';

import { createTestDb } from './createTestDb';
import { BetterSqliteTemplateRepository, TemplateNotFoundError } from '../betterSqliteTemplateRepository';

/**
 * Integration tests for the better-sqlite3 adapter over a REAL `:memory:`
 * SQLite database (no mock). These exercise the full spec
 * `email-template-store` contract: CRUD, append-only versioning,
 * rollback, soft delete + default clearing, clone (incl. from
 * soft-deleted), restore, and default uniqueness per area+type.
 *
 * Each test gets a fresh DB via `createTestDb()` — zero shared state.
 */
describe('BetterSqliteTemplateRepository', () => {
  function makeRepo(): ITemplateRepository {
    return new BetterSqliteTemplateRepository(createTestDb());
  }

  async function saveSample(
    repo: ITemplateRepository,
    overrides: {
      id?: string;
      area?: string;
      type?: 'company' | 'patient';
      name?: string;
      subject?: string;
      bodyHtml?: string;
      isDefault?: boolean;
    } = {},
  ): Promise<Template> {
    return repo.save({
      area: overrides.area ?? 'consolidados',
      type: overrides.type ?? 'company',
      name: overrides.name ?? 'Welcome',
      subject: overrides.subject ?? 'Hello {{empresa}}',
      bodyHtml: overrides.bodyHtml ?? '<p>{{empresa}}</p>',
      id: overrides.id,
      isDefault: overrides.isDefault,
    });
  }

  describe('save + getById (CRUD)', () => {
    it('creates a new template with a generated id and a first version row', async () => {
      const repo = makeRepo();
      const created = await saveSample(repo);

      expect(created.id).toBeTruthy();
      expect(created.currentVersionId).toBeTruthy();
      expect(created.currentVersionId).not.toBeNull();
      expect(created.isDefault).toBe(false);
      expect(created.deletedAt).toBeNull();

      const fetched = await repo.getById(created.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(created.id);
      expect(fetched?.subject).toBe('Hello {{empresa}}');
    });

    it('getById returns null when the template is missing', async () => {
      const repo = makeRepo();
      expect(await repo.getById('does-not-exist')).toBeNull();
    });

    it('getById can read a soft-deleted template (trash/clone source)', async () => {
      const repo = makeRepo();
      const t = await saveSample(repo);
      await repo.softDelete(t.id);
      // getById reads even soft-deleted (so clone can source from trash).
      const fetched = await repo.getById(t.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.deletedAt).not.toBeNull();
    });
  });

  describe('append-only versioning', () => {
    it('save on an existing template appends a new version and updates currentVersionId', async () => {
      const repo = makeRepo();
      const created = await saveSample(repo, { subject: 'v1 subject' });
      const v1Current = created.currentVersionId;

      const updated = await repo.save({
        id: created.id,
        area: 'consolidados',
        type: 'company',
        name: 'Welcome',
        subject: 'v2 subject',
        bodyHtml: '<p>v2</p>',
      });

      // A NEW version row was appended; currentVersionId moved to it.
      expect(updated.currentVersionId).not.toBe(v1Current);
      expect(updated.subject).toBe('v2 subject');
      expect(updated.bodyHtml).toBe('<p>v2</p>');

      const versions = await repo.listVersions(created.id);
      expect(versions).toHaveLength(2);
      // v1 content is preserved in the history.
      const v1Row = versions.find((v) => v.versionId === v1Current);
      expect(v1Row?.subject).toBe('v1 subject');
    });

    it('save never mutates an existing version row (append-only)', async () => {
      const repo = makeRepo();
      const created = await saveSample(repo, { subject: 'orig' });
      const v1Id = created.currentVersionId;

      await repo.save({
        id: created.id,
        area: 'consolidados',
        type: 'company',
        name: 'Welcome',
        subject: 'changed',
        bodyHtml: '<p>changed</p>',
      });

      const v1Row = (await repo.listVersions(created.id)).find(
        (v) => v.versionId === v1Id,
      );
      // The original version row is untouched.
      expect(v1Row?.subject).toBe('orig');
    });
  });

  describe('listByArea / listByAreaAndType (active only)', () => {
    it('listByAreaAndType returns only active templates (excludes soft-deleted)', async () => {
      const repo = makeRepo();
      const active = await saveSample(repo, { name: 'A', type: 'company' });
      const deleted = await saveSample(repo, {
        name: 'B',
        type: 'company',
      });
      await repo.softDelete(deleted.id);

      const result = await repo.listByAreaAndType('consolidados', 'company');
      expect(result.map((t) => t.id)).toEqual([active.id]);
      expect(result[0]?.deletedAt).toBeNull();
    });

    it('listByArea returns only active templates for the area', async () => {
      const repo = makeRepo();
      const a = await saveSample(repo, { name: 'A', type: 'company' });
      const b = await saveSample(repo, { name: 'B', type: 'patient' });
      const c = await saveSample(repo, { name: 'C', type: 'company' });
      await repo.softDelete(b.id);

      const result = await repo.listByArea('consolidados');
      const ids = result.map((t) => t.id).sort();
      expect(ids).toEqual([a.id, c.id].sort());
    });

    it('listByAreaAndType filters by type within the area', async () => {
      const repo = makeRepo();
      const company = await saveSample(repo, { type: 'company' });
      await saveSample(repo, { type: 'patient' });

      const result = await repo.listByAreaAndType('consolidados', 'company');
      expect(result.map((t) => t.id)).toEqual([company.id]);
    });

    it('listDeletedByArea returns only soft-deleted templates for the area (trash view)', async () => {
      const repo = makeRepo();
      const active = await saveSample(repo, { name: 'A', type: 'company' });
      const deleted1 = await saveSample(repo, { name: 'B', type: 'company' });
      const deleted2 = await saveSample(repo, { name: 'C', type: 'patient' });
      await repo.softDelete(deleted1.id);
      await repo.softDelete(deleted2.id);

      const trash = await repo.listDeletedByArea('consolidados');

      const ids = trash.map((t) => t.id).sort();
      expect(ids).toEqual([deleted1.id, deleted2.id].sort());
      // Active templates MUST NOT appear in the trash view.
      expect(trash.find((t) => t.id === active.id)).toBeUndefined();
      // Every returned row MUST be soft-deleted.
      for (const t of trash) {
        expect(t.deletedAt).not.toBeNull();
      }
    });

    it('listDeletedByArea returns an empty array when no templates are soft-deleted', async () => {
      const repo = makeRepo();
      await saveSample(repo, { name: 'A' });

      const trash = await repo.listDeletedByArea('consolidados');
      expect(trash).toEqual([]);
    });

    it('listDeletedByArea filters by area (excludes other areas)', async () => {
      const repo = makeRepo();
      await saveSample(repo, { name: 'A', area: 'consolidados' });
      const other = await saveSample(repo, {
        name: 'B',
        area: 'other-area',
      });
      await repo.softDelete(other.id);

      const trash = await repo.listDeletedByArea('consolidados');
      expect(trash).toEqual([]);
    });
  });

  describe('soft delete + default clearing', () => {
    it('soft delete sets deletedAt and excludes the template from active lists', async () => {
      const repo = makeRepo();
      const t = await saveSample(repo);
      await repo.softDelete(t.id);

      const fetched = await repo.getById(t.id);
      expect(fetched?.deletedAt).not.toBeNull();
      const active = await repo.listByAreaAndType('consolidados', 'company');
      expect(active.map((x) => x.id)).not.toContain(t.id);
    });

    it('soft-deleting a default clears isDefault (no auto-promotion)', async () => {
      const repo = makeRepo();
      const t = await saveSample(repo, { isDefault: true });
      expect(t.isDefault).toBe(true);

      await repo.softDelete(t.id);

      const fetched = await repo.getById(t.id);
      expect(fetched?.isDefault).toBe(false);
    });

    it('softDelete on a missing id throws TemplateNotFoundError', async () => {
      const repo = makeRepo();
      await expect(repo.softDelete('nope')).rejects.toThrow(TemplateNotFoundError);
    });
  });

  describe('restore', () => {
    it('restore clears deletedAt and the template reappears in active lists', async () => {
      const repo = makeRepo();
      const t = await saveSample(repo);
      await repo.softDelete(t.id);
      await repo.restore(t.id);

      const fetched = await repo.getById(t.id);
      expect(fetched?.deletedAt).toBeNull();
      const active = await repo.listByAreaAndType('consolidados', 'company');
      expect(active.map((x) => x.id)).toContain(t.id);
    });

    it('restore does NOT re-default a previously-default template', async () => {
      const repo = makeRepo();
      const t = await saveSample(repo, { isDefault: true });
      await repo.softDelete(t.id); // clears default
      await repo.restore(t.id);

      const fetched = await repo.getById(t.id);
      expect(fetched?.isDefault).toBe(false);
    });

    it('restore on a missing id throws TemplateNotFoundError', async () => {
      const repo = makeRepo();
      await expect(repo.restore('nope')).rejects.toThrow(TemplateNotFoundError);
    });
  });

  describe('clone', () => {
    it('clones an active template into a new active, non-default template copying content', async () => {
      const repo = makeRepo();
      const original = await saveSample(repo, {
        subject: 'orig subject',
        bodyHtml: '<p>orig</p>',
        isDefault: true,
      });

      const cloned = await repo.clone(original.id);

      expect(cloned.id).not.toBe(original.id);
      expect(cloned.subject).toBe('orig subject');
      expect(cloned.bodyHtml).toBe('<p>orig</p>');
      expect(cloned.isDefault).toBe(false);
      expect(cloned.deletedAt).toBeNull();
      expect(cloned.currentVersionId).not.toBeNull();
    });

    it('clones a soft-deleted template into a new active template', async () => {
      const repo = makeRepo();
      const original = await saveSample(repo, {
        subject: 'trashed',
        bodyHtml: '<p>trashed</p>',
      });
      await repo.softDelete(original.id);

      const cloned = await repo.clone(original.id);
      expect(cloned.deletedAt).toBeNull();
      expect(cloned.subject).toBe('trashed');
      // The original remains soft-deleted.
      const orig = await repo.getById(original.id);
      expect(orig?.deletedAt).not.toBeNull();
    });

    it('clone on a missing id throws TemplateNotFoundError', async () => {
      const repo = makeRepo();
      await expect(repo.clone('nope')).rejects.toThrow(TemplateNotFoundError);
    });
  });

  describe('setDefault + uniqueness', () => {
    it('setDefault clears the previous default and sets the new one (same area+type)', async () => {
      const repo = makeRepo();
      const a = await saveSample(repo, { name: 'A', isDefault: true });
      const b = await saveSample(repo, { name: 'B' });

      await repo.setDefault(b.id);

      const aFetched = await repo.getById(a.id);
      const bFetched = await repo.getById(b.id);
      expect(aFetched?.isDefault).toBe(false);
      expect(bFetched?.isDefault).toBe(true);
    });

    it('setDefault does not affect defaults of a different area+type', async () => {
      const repo = makeRepo();
      const company = await saveSample(repo, {
        type: 'company',
        isDefault: true,
      });
      const patient = await saveSample(repo, {
        type: 'patient',
        isDefault: true,
      });

      // Mark a different company template as default.
      const company2 = await saveSample(repo, { type: 'company' });
      await repo.setDefault(company2.id);

      // patient default is untouched (different type).
      const patientFetched = await repo.getById(patient.id);
      expect(patientFetched?.isDefault).toBe(true);
      const companyFetched = await repo.getById(company.id);
      expect(companyFetched?.isDefault).toBe(false);
    });

    it('the partial unique index rejects a second default for the same area+type', async () => {
      // Direct DB-level proof that the index enforces uniqueness — this is
      // the safety net behind setDefault's transaction.
      const db = createTestDb();
      db.prepare(
        `INSERT INTO templates (id, area, type, name, subject, bodyHtml, isDefault, currentVersionId, deletedAt, createdAt, updatedAt)
         VALUES ('A','consolidados','company','A','s','b',1,NULL,NULL,'2026-01-01','2026-01-01')`,
      ).run();

      expect(() =>
        db
          .prepare(
            `INSERT INTO templates (id, area, type, name, subject, bodyHtml, isDefault, currentVersionId, deletedAt, createdAt, updatedAt)
             VALUES ('B','consolidados','company','B','s','b',1,NULL,NULL,'2026-01-01','2026-01-01')`,
          )
          .run(),
      ).toThrow(/CONSTRAINT|unique/i);
    });

    it('setDefault on a missing id throws TemplateNotFoundError', async () => {
      const repo = makeRepo();
      await expect(repo.setDefault('nope')).rejects.toThrow(TemplateNotFoundError);
    });
  });

  describe('listVersions', () => {
    it('returns versions ordered by editedAt descending', async () => {
      const repo = makeRepo();
      const t = await saveSample(repo, { subject: 'first' });
      await repo.save({
        id: t.id,
        area: 'consolidados',
        type: 'company',
        name: 'Welcome',
        subject: 'second',
        bodyHtml: '<p>2</p>',
      });
      await repo.save({
        id: t.id,
        area: 'consolidados',
        type: 'company',
        name: 'Welcome',
        subject: 'third',
        bodyHtml: '<p>3</p>',
      });

      const versions = await repo.listVersions(t.id);
      expect(versions).toHaveLength(3);
      // Descending by editedAt — the most recent save is first.
      expect(versions[0]?.subject).toBe('third');
      expect(versions[2]?.subject).toBe('first');
    });

    it('returns an empty array for a template with no versions', async () => {
      const repo = makeRepo();
      expect(await repo.listVersions('nope')).toEqual([]);
    });
  });

  describe('rollback (append-only)', () => {
    it('rollback copies the target version into a new version and updates currentVersionId', async () => {
      const repo = makeRepo();
      const t = await saveSample(repo, { subject: 'v1' });
      const v1Id = t.currentVersionId;
      const updated = await repo.save({
        id: t.id,
        area: 'consolidados',
        type: 'company',
        name: 'Welcome',
        subject: 'v2',
        bodyHtml: '<p>v2</p>',
      });
      const v2Id = updated.currentVersionId;

      const rolled = await repo.rollback(t.id, v1Id!);

      // A NEW version row was appended with v1's content.
      expect(rolled.currentVersionId).not.toBe(v1Id);
      expect(rolled.currentVersionId).not.toBe(v2Id);
      expect(rolled.subject).toBe('v1');

      const versions = await repo.listVersions(t.id);
      expect(versions).toHaveLength(3);
      // v1 and v2 are unchanged (append-only).
      const v1Row = versions.find((v) => v.versionId === v1Id);
      const v2Row = versions.find((v) => v.versionId === v2Id);
      expect(v1Row?.subject).toBe('v1');
      expect(v2Row?.subject).toBe('v2');
    });

    it('rollback on a missing version throws TemplateNotFoundError', async () => {
      const repo = makeRepo();
      const t = await saveSample(repo);
      await expect(repo.rollback(t.id, 'no-such-version')).rejects.toThrow(
        TemplateNotFoundError,
      );
    });

    it('rollback on a missing template throws TemplateNotFoundError', async () => {
      const repo = makeRepo();
      await expect(repo.rollback('nope', 'whatever')).rejects.toThrow(
        TemplateNotFoundError,
      );
    });
  });

  describe('ITemplateRepository conformance', () => {
    it('implements every method of the port', () => {
      const repo: ITemplateRepository = makeRepo();
      const methods: (keyof ITemplateRepository)[] = [
        'listByArea',
        'listByAreaAndType',
        'listDeletedByArea',
        'getById',
        'save',
        'softDelete',
        'restore',
        'clone',
        'setDefault',
        'listVersions',
        'rollback',
      ];
      for (const m of methods) {
        expect(typeof repo[m]).toBe('function');
      }
    });
  });
});

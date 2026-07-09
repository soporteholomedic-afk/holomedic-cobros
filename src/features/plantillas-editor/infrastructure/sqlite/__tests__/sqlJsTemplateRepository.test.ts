import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

import initSqlJs from 'sql.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ITemplateRepository } from '../../../domain/ports';
import { migrate } from '../migrate';

import { SqlJsTemplateRepository, TemplateNotFoundError } from '../sqlJsTemplateRepository';

/**
 * Integration tests for the sql.js fallback adapter over a REAL in-memory
 * sql.js database. Covers the same `ITemplateRepository` contract subset as
 * the better-sqlite3 adapter, PLUS the sql.js-specific `persist()` contract:
 * every mutation MUST call `persist()` so the WASM database is flushed to
 * disk; reads MUST NOT.
 *
 * Spec `email-template-store` → "Fallback adapter via env": the sql.js
 * adapter honours the same interface as the primary, so swapping is config.
 */
const require = createRequire(import.meta.url);
const WASM_PATH = require.resolve('sql.js/dist/sql-wasm.wasm');

let SQL: Awaited<ReturnType<typeof initSqlJs>>;

beforeEach(async () => {
  SQL = await initSqlJs({
    // Pass the wasm bytes directly — robust under Node/vitest, no fetch or
    // locateFile path-resolution fragility.
    wasmBinary: readFileSync(WASM_PATH),
  } as unknown as Parameters<typeof initSqlJs>[0]);
});

describe('SqlJsTemplateRepository', () => {
  function makeRepo(): { repo: ITemplateRepository; persist: ReturnType<typeof vi.fn> } {
    const db = new SQL.Database();
    migrate(db);
    const persist = vi.fn();
    return { repo: new SqlJsTemplateRepository(db, persist), persist };
  }

  async function saveSample(
    repo: ITemplateRepository,
    overrides: {
      id?: string;
      type?: 'company' | 'patient';
      name?: string;
      subject?: string;
      bodyHtml?: string;
      isDefault?: boolean;
    } = {},
  ): Promise<{ id: string; currentVersionId: string | null }> {
    const t = await repo.save({
      area: 'consolidados',
      type: overrides.type ?? 'company',
      name: overrides.name ?? 'Welcome',
      subject: overrides.subject ?? 'Hello {{empresa}}',
      bodyHtml: overrides.bodyHtml ?? '<p>{{empresa}}</p>',
      id: overrides.id,
      isDefault: overrides.isDefault,
    });
    return { id: t.id, currentVersionId: t.currentVersionId };
  }

  describe('CRUD + versioning (same contract as better-sqlite3)', () => {
    it('creates a template with a generated id and a first version', async () => {
      const { repo } = makeRepo();
      const { id } = await saveSample(repo);

      const fetched = await repo.getById(id);
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(id);
      expect(fetched?.currentVersionId).not.toBeNull();
    });

    it('getById returns null when missing', async () => {
      const { repo } = makeRepo();
      expect(await repo.getById('nope')).toBeNull();
    });

    it('save on an existing template appends a version and moves currentVersionId', async () => {
      const { repo } = makeRepo();
      const { id, currentVersionId: v1 } = await saveSample(repo, {
        subject: 'v1',
      });

      const updated = await repo.save({
        id,
        area: 'consolidados',
        type: 'company',
        name: 'Welcome',
        subject: 'v2',
        bodyHtml: '<p>v2</p>',
      });

      expect(updated.currentVersionId).not.toBe(v1);
      const versions = await repo.listVersions(id);
      expect(versions).toHaveLength(2);
    });

    it('listByAreaAndType returns only active templates', async () => {
      const { repo } = makeRepo();
      const active = await saveSample(repo, { name: 'A' });
      const trashed = await saveSample(repo, { name: 'B' });
      await repo.softDelete(trashed.id);

      const result = await repo.listByAreaAndType('consolidados', 'company');
      expect(result.map((t) => t.id)).toEqual([active.id]);
    });

    it('listDeletedByArea returns only soft-deleted templates (trash view)', async () => {
      const { repo } = makeRepo();
      const active = await saveSample(repo, { name: 'A' });
      const trashed = await saveSample(repo, { name: 'B' });
      await repo.softDelete(trashed.id);

      const trash = await repo.listDeletedByArea('consolidados');
      expect(trash.map((t) => t.id)).toEqual([trashed.id]);
      expect(trash.find((t) => t.id === active.id)).toBeUndefined();
      for (const t of trash) {
        expect(t.deletedAt).not.toBeNull();
      }
    });
  });

  describe('soft delete + restore', () => {
    it('soft delete sets deletedAt and clears a default', async () => {
      const { repo } = makeRepo();
      const { id } = await saveSample(repo, { isDefault: true });

      await repo.softDelete(id);

      const fetched = await repo.getById(id);
      expect(fetched?.deletedAt).not.toBeNull();
      expect(fetched?.isDefault).toBe(false);
    });

    it('restore clears deletedAt and does NOT re-default', async () => {
      const { repo } = makeRepo();
      const { id } = await saveSample(repo, { isDefault: true });
      await repo.softDelete(id);
      await repo.restore(id);

      const fetched = await repo.getById(id);
      expect(fetched?.deletedAt).toBeNull();
      expect(fetched?.isDefault).toBe(false);
    });

    it('softDelete on a missing id throws TemplateNotFoundError', async () => {
      const { repo } = makeRepo();
      await expect(repo.softDelete('nope')).rejects.toThrow(TemplateNotFoundError);
    });
  });

  describe('clone', () => {
    it('clones an active template into a new active non-default copy', async () => {
      const { repo } = makeRepo();
      const { id } = await saveSample(repo, {
        subject: 'orig',
        bodyHtml: '<p>orig</p>',
        isDefault: true,
      });

      const cloned = await repo.clone(id);
      expect(cloned.id).not.toBe(id);
      expect(cloned.subject).toBe('orig');
      expect(cloned.isDefault).toBe(false);
      expect(cloned.deletedAt).toBeNull();
    });

    it('clones a soft-deleted template into a new active copy', async () => {
      const { repo } = makeRepo();
      const { id } = await saveSample(repo, { subject: 'trashed' });
      await repo.softDelete(id);

      const cloned = await repo.clone(id);
      expect(cloned.deletedAt).toBeNull();
      expect(cloned.subject).toBe('trashed');
    });
  });

  describe('setDefault + rollback', () => {
    it('setDefault clears the previous default for the same area+type', async () => {
      const { repo } = makeRepo();
      const a = await saveSample(repo, { name: 'A', isDefault: true });
      const b = await saveSample(repo, { name: 'B' });

      await repo.setDefault(b.id);

      const aFetched = await repo.getById(a.id);
      const bFetched = await repo.getById(b.id);
      expect(aFetched?.isDefault).toBe(false);
      expect(bFetched?.isDefault).toBe(true);
    });

    it('rollback copies the target into a new version (append-only)', async () => {
      const { repo } = makeRepo();
      const { id, currentVersionId: v1 } = await saveSample(repo, {
        subject: 'v1',
      });
      const updated = await repo.save({
        id,
        area: 'consolidados',
        type: 'company',
        name: 'Welcome',
        subject: 'v2',
        bodyHtml: '<p>v2</p>',
      });
      const v2 = updated.currentVersionId;

      const rolled = await repo.rollback(id, v1!);
      expect(rolled.subject).toBe('v1');
      expect(rolled.currentVersionId).not.toBe(v1);
      expect(rolled.currentVersionId).not.toBe(v2);

      // v1 and v2 are unchanged.
      const versions = await repo.listVersions(id);
      expect(versions).toHaveLength(3);
      expect(versions.find((v) => v.versionId === v1)?.subject).toBe('v1');
      expect(versions.find((v) => v.versionId === v2)?.subject).toBe('v2');
    });

    it('rollback on a missing version throws TemplateNotFoundError', async () => {
      const { repo } = makeRepo();
      const { id } = await saveSample(repo);
      await expect(repo.rollback(id, 'no-such-version')).rejects.toThrow(
        TemplateNotFoundError,
      );
    });
  });

  describe('persist() contract (sql.js-specific)', () => {
    it('calls persist() after every mutation', async () => {
      const { repo, persist } = makeRepo();
      const { id } = await saveSample(repo); // save (create)
      await repo.save({
        // save (update)
        id,
        area: 'consolidados',
        type: 'company',
        name: 'Welcome',
        subject: 's2',
        bodyHtml: '<p>b2</p>',
      });
      await repo.softDelete(id);
      await repo.restore(id);
      await repo.clone(id);
      await repo.setDefault(id);
      await repo.rollback(id, (await repo.listVersions(id))[0]!.versionId);

      // 7 mutations → persist called 7 times (create, update, softDelete,
      // restore, clone, setDefault, rollback). listVersions is a read (no persist).
      expect(persist).toHaveBeenCalledTimes(7);
    });

    it('does NOT call persist() on reads', async () => {
      const { repo, persist } = makeRepo();
      const { id } = await saveSample(repo);
      persist.mockClear();

      await repo.getById(id);
      await repo.listByArea('consolidados');
      await repo.listByAreaAndType('consolidados', 'company');
      await repo.listVersions(id);

      expect(persist).not.toHaveBeenCalled();
    });
  });

  describe('ITemplateRepository conformance', () => {
    it('implements every method of the port', () => {
      const { repo } = makeRepo();
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

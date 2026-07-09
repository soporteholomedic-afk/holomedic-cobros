import { describe, expect, it } from 'vitest';

import { createTestDb } from './createTestDb';

/**
 * The `createTestDb` helper is the foundation every adapter test builds
 * on. If it returns a DB that is not migrated (or shares state across
 * calls), every downstream integration test is unreliable. These tests
 * pin: (1) the schema is applied, (2) both tables start empty, (3) each
 * call returns an INDEPENDENT database (no shared state between tests).
 */
describe('createTestDb()', () => {
  it('returns a database with the templates and template_versions tables', () => {
    const db = createTestDb();
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining(['templates', 'template_versions']),
    );
  });

  it('starts with zero rows in both tables (no seeding)', () => {
    const db = createTestDb();
    const templates = (
      db.prepare('SELECT COUNT(*) AS n FROM templates').get() as { n: number }
    ).n;
    const versions = (
      db.prepare('SELECT COUNT(*) AS n FROM template_versions').get() as {
        n: number;
      }
    ).n;
    expect(templates).toBe(0);
    expect(versions).toBe(0);
  });

  it('returns an independent database per call (no shared state)', () => {
    const dbA = createTestDb();
    const dbB = createTestDb();

    dbA
      .prepare(
        `INSERT INTO templates (id, area, type, name, subject, bodyHtml, isDefault, currentVersionId, deletedAt, createdAt, updatedAt)
         VALUES ('tpl-A','consolidados','company','A','s','b',0,NULL,NULL,'2026-01-01','2026-01-01')`,
      )
      .run();

    // dbB must NOT see dbA's insert — each call is a fresh :memory: DB.
    const countA = (
      dbA.prepare('SELECT COUNT(*) AS n FROM templates').get() as { n: number }
    ).n;
    const countB = (
      dbB.prepare('SELECT COUNT(*) AS n FROM templates').get() as { n: number }
    ).n;
    expect(countA).toBe(1);
    expect(countB).toBe(0);
  });
});

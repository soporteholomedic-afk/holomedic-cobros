import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { migrate } from '../migrate';

/**
 * Schema migration tests for the template SQLite store.
 *
 * Spec `email-template-store` → "Fresh database starts empty": a fresh
 * `:memory:` DB, once `migrate()` runs, MUST have both `templates` and
 * `template_versions` tables, the supporting indexes, and ZERO rows. The
 * migration MUST NOT seed any templates.
 */
describe('sqlite migrate()', () => {
  function tableNames(db: Database.Database): string[] {
    const rows = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all() as { name: string }[];
    return rows.map((r) => r.name);
  }

  function indexNames(db: Database.Database): string[] {
    const rows = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%' ORDER BY name",
      )
      .all() as { name: string }[];
    return rows.map((r) => r.name);
  }

  it('creates the templates and template_versions tables on a fresh DB', () => {
    const db = new Database(':memory:');
    migrate(db);

    expect(tableNames(db)).toEqual(
      expect.arrayContaining(['templates', 'template_versions']),
    );
  });

  it('starts with zero rows in both tables (no seeding)', () => {
    const db = new Database(':memory:');
    migrate(db);

    const templatesCount = (
      db.prepare('SELECT COUNT(*) AS n FROM templates').get() as { n: number }
    ).n;
    const versionsCount = (
      db.prepare('SELECT COUNT(*) AS n FROM template_versions').get() as {
        n: number;
      }
    ).n;

    // The setup (fresh migrate, no inserts) is exactly the precondition
    // that SHOULD produce empty — so the zero-count is a real assertion.
    expect(templatesCount).toBe(0);
    expect(versionsCount).toBe(0);
  });

  it('creates the default-uniqueness partial index and the active-listing index', () => {
    const db = new Database(':memory:');
    migrate(db);

    expect(indexNames(db)).toEqual(
      expect.arrayContaining([
        'idx_templates_default_area_type',
        'idx_templates_area_type_active',
        'idx_versions_template_edited',
      ]),
    );
  });

  it('is idempotent — running migrate twice does not error and keeps zero rows', () => {
    const db = new Database(':memory:');
    migrate(db);
    // CREATE TABLE/INDEX IF NOT EXISTS → second run is a no-op.
    expect(() => migrate(db)).not.toThrow();

    const templatesCount = (
      db.prepare('SELECT COUNT(*) AS n FROM templates').get() as { n: number }
    ).n;
    expect(templatesCount).toBe(0);
  });

  it('enforces the templates column contract via a round-trip insert', () => {
    // A real insert exercises the declared column set — if a column is
    // missing or misnamed, this INSERT fails. This is the runtime proof
    // the schema matches the design, not just that a table exists.
    const db = new Database(':memory:');
    migrate(db);

    db.prepare(
      `INSERT INTO templates (id, area, type, name, subject, bodyHtml, isDefault, currentVersionId, deletedAt, createdAt, updatedAt, ownerId)
       VALUES ('tpl-1','consolidados','company','Welcome','s','<p>b</p>',0,NULL,NULL,'2026-01-01','2026-01-01',NULL)`,
    ).run();

    const row = db
      .prepare('SELECT id, area, type, isDefault, deletedAt FROM templates WHERE id = ?')
      .get('tpl-1') as {
      id: string;
      area: string;
      type: string;
      isDefault: number;
      deletedAt: string | null;
    };
    expect(row.id).toBe('tpl-1');
    expect(row.area).toBe('consolidados');
    expect(row.type).toBe('company');
    expect(row.isDefault).toBe(0);
    expect(row.deletedAt).toBeNull();
  });
});

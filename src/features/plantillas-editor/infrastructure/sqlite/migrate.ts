import type Database from 'better-sqlite3';

/**
 * Structural target accepted by `migrate()`. Both `better-sqlite3`
 * (`exec(source: string): this`) and `sql.js` (`exec(sql: string, params?):
 * QueryExecResult[]`) satisfy this shape, so a single `migrate()` runs the
 * schema against either backend without casts or `any`.
 */
export interface SqliteExecTarget {
  exec(sql: string): unknown;
}

/**
 * SQLite schema for the email template store.
 *
 * Mirrors the design exactly. `templates` holds the CURRENT snapshot
 * (denormalized `subject`/`bodyHtml` for fast reads in the selector and
 * the interpolation path); `template_versions` holds every historical
 * snapshot, referenced by `templates.currentVersionId`.
 *
 * Indexes:
 *  - `idx_templates_default_area_type` — PARTIAL UNIQUE index enforcing
 *    "at most one default per area+type among active templates" at the DB
 *    level. The `WHERE isDefault = 1 AND deletedAt IS NULL` clause means
 *    soft-deleted and non-default rows never participate, so the
 *    constraint stays meaningful across soft-delete/restore cycles.
 *  - `idx_templates_area_type_active` — partial index backing
 *    `listByArea`/`listByAreaAndType` (active-only scans).
 *  - `idx_versions_template_edited` — backs `listVersions` (most-recent
 *    first per template).
 *
 * No `seed()` — tables start empty (spec `email-template-store`:
 * "Migration without seeding"; product decision #16).
 */
const SCHEMA_SQL = /* sql */ `
CREATE TABLE IF NOT EXISTS templates (
  id                TEXT PRIMARY KEY,
  area              TEXT NOT NULL,
  type              TEXT NOT NULL,
  name              TEXT NOT NULL,
  subject           TEXT NOT NULL,
  bodyHtml          TEXT NOT NULL,
  isDefault         INTEGER NOT NULL DEFAULT 0,
  currentVersionId  TEXT,
  deletedAt         TEXT,
  createdAt         TEXT NOT NULL,
  updatedAt         TEXT NOT NULL,
  ownerId           TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_templates_default_area_type
  ON templates(area, type) WHERE isDefault = 1 AND deletedAt IS NULL;

CREATE INDEX IF NOT EXISTS idx_templates_area_type_active
  ON templates(area, type) WHERE deletedAt IS NULL;

CREATE TABLE IF NOT EXISTS template_versions (
  versionId   TEXT PRIMARY KEY,
  templateId  TEXT NOT NULL,
  subject     TEXT NOT NULL,
  bodyHtml    TEXT NOT NULL,
  editedAt    TEXT NOT NULL,
  editedBy    TEXT
);

CREATE INDEX IF NOT EXISTS idx_versions_template_edited
  ON template_versions(templateId, editedAt DESC);
`;

/**
 * Run the schema migration against a SQLite database. Idempotent
 * (`CREATE TABLE/INDEX IF NOT EXISTS`); safe to call on every connection.
 * Does NOT seed data.
 *
 * Accepts the structural `SqliteExecTarget` so it works against both the
 * `better-sqlite3` and `sql.js` backends. The `Database.Database` alias
 * below keeps the existing `migrate(db: Database.Database)` call sites in
 * the better-sqlite3 adapter/tests valid (it satisfies the structural
 * type) — call sites can pass either backend.
 */
export function migrate(db: SqliteExecTarget): void {
  db.exec(SCHEMA_SQL);
}

/** Backwards-compatible alias: a better-sqlite3 Database IS a SqliteExecTarget. */
export type BetterSqliteDb = Database.Database;

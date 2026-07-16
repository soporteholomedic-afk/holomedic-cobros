import type * as mssql from 'mssql';

/**
 * SQL Server schema for the email template store (database `HOLOMEDIC`).
 *
 * Mirrors the SQLite design but with the types and idioms SQL Server
 * expects. `templates` holds the CURRENT snapshot (denormalized
 * `subject`/`bodyHtml` for fast reads in the selector and the
 * interpolation path); `template_versions` holds every historical
 * snapshot, referenced by `templates.currentVersionId`.
 *
 * Indexes:
 *  - `idx_templates_default_area_type` — FILTERED UNIQUE index enforcing
 *    "at most one default per area+type among active templates" at the
 *    DB level. SQL Server's `WHERE` clause preserves the SQLite
 *    `WHERE ... IS NULL` partial-index semantics: soft-deleted and
 *    non-default rows never participate, so the constraint stays
 *    meaningful across soft-delete/restore cycles.
 *  - `idx_templates_area_type_active` — filtered index backing
 *    `listByArea` / `listByAreaAndType` (active-only scans).
 *  - `idx_versions_template_edited` — backs `listVersions`
 *    (most-recent first per template).
 *
 * `IF NOT EXISTS` makes the migration idempotent. No `seed()` — tables
 * start empty (spec `email-template-store`: "Migration without
 * seeding"; product decision #16).
 */
const SCHEMA_SQL = /* sql */ `
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'templates' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.templates (
    id                NVARCHAR(50)  NOT NULL PRIMARY KEY,
    area              NVARCHAR(50)  NOT NULL,
    type              NVARCHAR(20)  NOT NULL,
    name              NVARCHAR(200) NOT NULL,
    subject           NVARCHAR(500) NOT NULL,
    bodyHtml          NVARCHAR(MAX) NOT NULL,
    isDefault         BIT           NOT NULL DEFAULT 0,
    currentVersionId  NVARCHAR(50)  NULL,
    deletedAt         DATETIME2(3)  NULL,
    createdAt         DATETIME2(3)  NOT NULL,
    updatedAt         DATETIME2(3)  NOT NULL,
    ownerId           NVARCHAR(50)  NULL
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_templates_default_area_type' AND object_id = OBJECT_ID('dbo.templates'))
BEGIN
  CREATE UNIQUE INDEX idx_templates_default_area_type
    ON dbo.templates(area, type)
    WHERE isDefault = 1 AND deletedAt IS NULL;
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_templates_area_type_active' AND object_id = OBJECT_ID('dbo.templates'))
BEGIN
  CREATE INDEX idx_templates_area_type_active
    ON dbo.templates(area, type)
    WHERE deletedAt IS NULL;
END;

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'template_versions' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.template_versions (
    versionId   NVARCHAR(50)  NOT NULL PRIMARY KEY,
    templateId  NVARCHAR(50)  NOT NULL,
    subject     NVARCHAR(500) NOT NULL,
    bodyHtml    NVARCHAR(MAX) NOT NULL,
    editedAt    DATETIME2(3)  NOT NULL,
    editedBy    NVARCHAR(50)  NULL
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_versions_template_edited' AND object_id = OBJECT_ID('dbo.template_versions'))
BEGIN
  CREATE INDEX idx_versions_template_edited
    ON dbo.template_versions(templateId, editedAt DESC);
END;
`;

/**
 * Run the schema migration against a SQL Server `HOLOMEDIC` connection
 * pool. Idempotent (`IF NOT EXISTS`); safe to call on every connection
 * (the factory calls it once at startup). Does NOT seed data.
 *
 * Uses a single `request().batch(SCHEMA_SQL)` so all statements run on
 * the same connection — `IF NOT EXISTS` guards are wrapped in `BEGIN …
 * END` so the parser accepts a `CREATE TABLE` / `CREATE INDEX` inside
 * the conditional.
 */
export async function migrate(pool: mssql.ConnectionPool): Promise<void> {
  await pool.request().batch(SCHEMA_SQL);
}

-- =============================================================================
-- Schema: HOLOMEDIC (dbo)
-- Tables:  templates, template_versions
-- Indexes: 3 (default uniqueness, active listing, version ordering)
--
-- Idempotent — safe to run multiple times (IF NOT EXISTS on every statement).
-- =============================================================================

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

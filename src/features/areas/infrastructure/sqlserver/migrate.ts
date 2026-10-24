import mssql from 'mssql';

/**
 * SQL Server schema for `dbo.areas` — the organizational-area catalog
 * backing the `/configuracion` AREAS tab and the usuarios form
 * dropdown (feature areas-crud).
 *
 * Idempotency is structural, same pattern as the usuarios migration:
 * `sys.tables` / `sys.indexes` gates, no version table.
 *
 * Seed: one row per distinct existing `usuarios.area` free-text value,
 * so the catalog starts populated and nothing is lost when the usuarios
 * form switches to the dropdown. Runs on EVERY startup (cheap, guarded
 * by NOT EXISTS against the catalog) — areas typed freely before the
 * dropdown deploy are picked up too. GROUP BY under the default
 * case-insensitive collation merges case variants ('Ventas'/'ventas')
 * into one row; MIN picks a deterministic representative.
 */
const SCHEMA_SQL = /* sql */ `
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'areas' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.areas (
    idArea       NVARCHAR(50)   NOT NULL PRIMARY KEY,
    -- COLLATE DATABASE_DEFAULT pins the catalog to the database's
    -- own collation: the seed compares nombre against
    -- dbo.usuarios.area, whose column collation (Latin1_General_100_CI_AS)
    -- differs from this database's default (Latin1_General_CI_AI)
    -- and would raise collation-conflict error 468 on the equality.
    nombre       NVARCHAR(200)  COLLATE DATABASE_DEFAULT NOT NULL,
    descripcion  NVARCHAR(500)  NULL,
    activo       BIT            NOT NULL DEFAULT 1,
    createdAt    DATETIME2(3)   NOT NULL DEFAULT SYSUTCDATETIME(),
    updatedAt    DATETIME2(3)   NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

-- Adopt a PRE-EXISTING legacy dbo.areas (observed in dev: idArea PK,
-- nombre UNIQUE, createdAt only — created 2026-10-03 by an abandoned
-- feature, zero rows, no code consumers). Missing columns are added
-- ADDITIVELY with per-column sys.columns gates; no legacy constraint
-- is dropped, so any external consumer keeps working (INSERTs that
-- omit the new columns are unaffected by their defaults).
IF OBJECT_ID('dbo.areas', 'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.areas') AND name = 'descripcion')
BEGIN
  ALTER TABLE dbo.areas ADD descripcion NVARCHAR(500) NULL;
END;

IF OBJECT_ID('dbo.areas', 'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.areas') AND name = 'activo')
BEGIN
  ALTER TABLE dbo.areas ADD activo BIT NOT NULL DEFAULT 1;
END;

IF OBJECT_ID('dbo.areas', 'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.areas') AND name = 'updatedAt')
BEGIN
  ALTER TABLE dbo.areas ADD updatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME();
END;

-- Unique only among ACTIVE rows so a soft-deleted name can be
-- re-created (CrearAreaUseCase reactivates it instead of duplicating).
-- NOTE: a legacy global UNIQUE on nombre (if present, as in dev) is
-- stricter and simply coexists with this filtered index.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_areas_nombre_activos' AND object_id = OBJECT_ID('dbo.areas'))
BEGIN
  -- sp_executesql ON PURPOSE (usuarios-migrate precedent): the batch
  -- compiles against the PRE-migration schema, where a legacy table
  -- has no activo column yet, so a bare CREATE INDEX fails at compile
  -- time with "Invalid column name 'activo'" and NOTHING in the batch
  -- runs. Dynamic SQL defers compilation until the ALTER TABLE gates
  -- above have committed.
  EXEC sp_executesql N'CREATE UNIQUE INDEX UX_areas_nombre_activos ON dbo.areas (nombre) WHERE activo = 1';
END;

-- Seed the catalog from existing free-text usuarios.area values.
IF OBJECT_ID('dbo.usuarios', 'U') IS NOT NULL
BEGIN
  INSERT INTO dbo.areas (idArea, nombre)
  SELECT NEWID(), g.area
  FROM (
    SELECT MIN(u.area) AS area
    FROM dbo.usuarios u
    WHERE u.area <> ''
    GROUP BY u.area
  ) AS g
  WHERE NOT EXISTS (
    SELECT 1 FROM dbo.areas a
    -- Both sides pinned to DATABASE_DEFAULT: legacy columns carry a
    -- different collation (Latin1_General_100_CI_AS) than the database
    -- default (Latin1_General_CI_AI) and a bare equality raises
    -- collation-conflict error 468.
    WHERE a.nombre COLLATE DATABASE_DEFAULT = g.area COLLATE DATABASE_DEFAULT
  );
END;
`;

export async function migrate(pool: mssql.ConnectionPool): Promise<void> {
  await pool.request().batch(SCHEMA_SQL);
}

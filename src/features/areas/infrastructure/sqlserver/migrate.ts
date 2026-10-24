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
    nombre       NVARCHAR(200)  NOT NULL,
    descripcion  NVARCHAR(500)  NULL,
    activo       BIT            NOT NULL DEFAULT 1,
    createdAt    DATETIME2(3)   NOT NULL DEFAULT SYSUTCDATETIME(),
    updatedAt    DATETIME2(3)   NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

-- Unique only among ACTIVE rows so a soft-deleted name can be
-- re-created (CrearAreaUseCase reactivates it instead of duplicating).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_areas_nombre_activos' AND object_id = OBJECT_ID('dbo.areas'))
BEGIN
  CREATE UNIQUE INDEX UX_areas_nombre_activos ON dbo.areas (nombre) WHERE activo = 1;
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
  WHERE NOT EXISTS (SELECT 1 FROM dbo.areas a WHERE a.nombre = g.area);
END;
`;

export async function migrate(pool: mssql.ConnectionPool): Promise<void> {
  await pool.request().batch(SCHEMA_SQL);
}

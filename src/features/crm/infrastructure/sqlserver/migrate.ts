import * as mssql from 'mssql';

/**
 * SQL Server schema for the CRM registry (database `HOLOMEDIC`), pr2
 * slice of change `crm` — registro de empresas (spec G1):
 *
 * - `CRM_Empresas` — one row per empresa; `rucNormalizado` (trim +
 *   strip non-alphanumerics, applied by the application layer) is the
 *   dedup key (`UQ_CRM_Empresas_RucNormalizado`). `responsable` is an
 *   app-validated username (dbo.usuarios.usuario; no FK — cobranza
 *   precedent), so it shares that column's NVARCHAR(200) type.
 * - `CRM_Contactos` — N per empresa; `UQ_CRM_Contactos_EmpresaNombre`
 *   backs the re-import merge rule (design D1: name-match, scoped per
 *   empresa, never across empresas). The filtered unique index
 *   `UX_CRM_Contactos_Principal` (`WHERE esPrincipal = 1`) enforces
 *   exactly-one-principal per empresa at the DB level; the ≥1 side of
 *   the invariant is enforced app-side (first listed = default).
 * - `CRM_Correos` — N per contacto; addresses stored normalized
 *   (lowercase, trimmed) under `UQ_CRM_Correos_ContactoCorreo`.
 * - `CRM_Importaciones` (pr6) — one audit row per executed import
 *   (design §2): job counters + the JSON report rows. Preview and
 *   cancel write NOTHING here (G2 preview-before-commit).
 *
 * Conventions (design §2): INT IDENTITY PKs for registry tables,
 * `DATETIME2(0) DEFAULT SYSDATETIME()` audit stamps (ADR-9, naive
 * America/Lima wall clock — asistencia precedent), ON DELETE CASCADE
 * along Empresas → Contactos → Correos.
 *
 * Fresh CREATE only — tables are declared FK-target-first so the single
 * batch is order-safe. `IF NOT EXISTS` guards (sys.tables per table,
 * sys.indexes per index) make the migration idempotent; safe to run on
 * every first connection via `getCrmDb()`. Later slices append guarded
 * blocks for the pipeline (pr9) and assignment (pr14) tables.
 */
const SCHEMA_SQL = /* sql */ `
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CRM_Empresas' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.CRM_Empresas (
    id              INT            IDENTITY(1,1) NOT NULL PRIMARY KEY,
    ruc             NVARCHAR(30)   NOT NULL,
    rucNormalizado  VARCHAR(30)    NOT NULL CONSTRAINT UQ_CRM_Empresas_RucNormalizado UNIQUE,
    razonSocial     NVARCHAR(200)  NOT NULL,
    tipo            VARCHAR(10)    NOT NULL CONSTRAINT CK_CRM_Empresas_Tipo CHECK (tipo IN ('Cliente','Prospecto')),
    origen          VARCHAR(10)    NULL CONSTRAINT CK_CRM_Empresas_Origen CHECK (origen IN ('Inbound','Outbound')),
    proyectoObra    NVARCHAR(200)  NULL,
    destinoComun    NVARCHAR(200)  NULL,
    notas           NVARCHAR(MAX)  NULL,
    responsable     NVARCHAR(200)  NULL,
    createdBy       NVARCHAR(200)  NULL,
    createdAt       DATETIME2(0)   NOT NULL DEFAULT SYSDATETIME(),
    updatedBy       NVARCHAR(200)  NULL,
    updatedAt       DATETIME2(0)   NOT NULL DEFAULT SYSDATETIME()
  );
END;
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CRM_Contactos' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.CRM_Contactos (
    id                INT           IDENTITY(1,1) NOT NULL PRIMARY KEY,
    empresaId         INT           NOT NULL CONSTRAINT FK_CRM_Contactos_Empresa REFERENCES dbo.CRM_Empresas (id) ON DELETE CASCADE,
    nombre            NVARCHAR(200) NOT NULL,
    nombreNormalizado VARCHAR(200)  NOT NULL,
    telefono          VARCHAR(30)   NULL,
    esPrincipal       BIT           NOT NULL DEFAULT 0,
    createdAt         DATETIME2(0)  NOT NULL DEFAULT SYSDATETIME(),
    updatedAt         DATETIME2(0)  NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT UQ_CRM_Contactos_EmpresaNombre UNIQUE (empresaId, nombreNormalizado)
  );
END;
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CRM_Correos' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.CRM_Correos (
    id         INT          IDENTITY(1,1) NOT NULL PRIMARY KEY,
    contactoId INT          NOT NULL CONSTRAINT FK_CRM_Correos_Contacto REFERENCES dbo.CRM_Contactos (id) ON DELETE CASCADE,
    correo     VARCHAR(320) NOT NULL,
    CONSTRAINT UQ_CRM_Correos_ContactoCorreo UNIQUE (contactoId, correo)
  );
END;
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CRM_Importaciones' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.CRM_Importaciones (
    id                   INT           IDENTITY(1,1) NOT NULL PRIMARY KEY,
    archivoNombre        NVARCHAR(300) NOT NULL,
    totalFilas           INT           NOT NULL,
    filasValidas         INT           NOT NULL,
    empresasCreadas      INT           NOT NULL,
    empresasActualizadas INT           NOT NULL,
    contactosCreados     INT           NOT NULL,
    contactosActualizados INT          NOT NULL,
    erroresJson          NVARCHAR(MAX) NULL,
    ejecutadoPor         NVARCHAR(200) NOT NULL,
    createdAt            DATETIME2(0)  NOT NULL DEFAULT SYSDATETIME()
  );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_CRM_Contactos_Principal' AND object_id = OBJECT_ID('dbo.CRM_Contactos'))
BEGIN
  CREATE UNIQUE INDEX UX_CRM_Contactos_Principal
    ON dbo.CRM_Contactos (empresaId)
    WHERE esPrincipal = 1;
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CRM_Empresas_Responsable' AND object_id = OBJECT_ID('dbo.CRM_Empresas'))
BEGIN
  CREATE INDEX IX_CRM_Empresas_Responsable
    ON dbo.CRM_Empresas (responsable)
    INCLUDE (tipo, razonSocial, ruc);
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CRM_Empresas_Tipo' AND object_id = OBJECT_ID('dbo.CRM_Empresas'))
BEGIN
  CREATE INDEX IX_CRM_Empresas_Tipo
    ON dbo.CRM_Empresas (tipo);
END;
`;

/**
 * Run the CRM registry schema migration against a SQL Server
 * `HOLOMEDIC` connection pool. Idempotent (`IF NOT EXISTS`); safe to
 * call on every first connection (the `getCrmDb()` factory calls it
 * once at startup).
 *
 * Uses a single `request().batch(SCHEMA_SQL)` so the statement runs on
 * one connection — each `IF NOT EXISTS` guard is wrapped in
 * `BEGIN … END` so the parser accepts the DDL inside the conditional.
 */
export async function migrate(pool: mssql.ConnectionPool): Promise<void> {
  await pool.request().batch(SCHEMA_SQL);
}

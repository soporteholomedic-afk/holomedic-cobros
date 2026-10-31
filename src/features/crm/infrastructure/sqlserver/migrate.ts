import mssql from 'mssql';

/**
 * SQL Server schema for `dbo.CrmEmpresa` — the simple CRM board
 * (feature crm-simple): one row per empresa with its principal contact.
 *
 * The table name deliberately avoids the underscore-prefixed namespace
 * of the discarded CRM: production may still run code that recreates
 * those tables on startup, and SQL Server names are case-insensitive.
 *
 * Idempotency is structural (`sys.tables` gate, no version table) and
 * the migration is purely additive.
 *
 * The database itself guards the invariants the form relies on: the RUC
 * is unique and exactly 11 digits (VARCHAR + CHECK: a CHAR(11) would
 * silently pad a shorter value with a space), and `etapa` can only hold
 * the four board columns.
 */
const SCHEMA_SQL = /* sql */ `
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CrmEmpresa' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.CrmEmpresa (
    idEmpresa         NVARCHAR(50)   NOT NULL PRIMARY KEY,
    razonSocial       NVARCHAR(200)  NOT NULL,
    ruc               VARCHAR(11)    NOT NULL
      CONSTRAINT CK_CrmEmpresa_ruc CHECK (ruc LIKE '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'),
    sector            NVARCHAR(50)   NULL,
    contactoNombre    NVARCHAR(200)  NOT NULL,
    contactoTelefono  NVARCHAR(50)   NOT NULL,
    contactoCorreo    NVARCHAR(200)  NULL,
    notas             NVARCHAR(MAX)  NULL,
    etapa             NVARCHAR(20)   NOT NULL DEFAULT 'por_contactar'
      CONSTRAINT CK_CrmEmpresa_etapa CHECK (etapa IN ('por_contactar', 'contactado', 'en_seguimiento', 'cliente')),
    createdAt         DATETIME2(3)   NOT NULL DEFAULT SYSUTCDATETIME(),
    updatedAt         DATETIME2(3)   NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_CrmEmpresa_ruc UNIQUE (ruc)
  );
END;
`;

export async function migrate(pool: mssql.ConnectionPool): Promise<void> {
  await pool.request().batch(SCHEMA_SQL);
}

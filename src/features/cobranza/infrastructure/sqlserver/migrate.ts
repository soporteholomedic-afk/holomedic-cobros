import type * as mssql from 'mssql';

/**
 * SQL Server schema for the cobranza contact directory (database
 * `HOLOMEDIC`, REQ-01-DIR-01).
 *
 * `ruc` is VARCHAR(11) PRIMARY KEY — the directory key fits both the
 * 11-digit RUC and the 8-digit DNI. `emailPrincipal`/`emailCopia` are
 * NVARCHAR(320) (RFC max local@domain length); `updatedAt` is
 * DATETIME2(3) matching the ISO-with-milliseconds app-side stamp;
 * `updatedBy` records the session user that last confirmed the pair.
 *
 * Fresh CREATE only — no sp_executesql deferral needed because no
 * statement references a column created earlier in the same batch
 * (unlike the auth usuarios backfill case; plantillas migrate.ts has
 * none either).
 *
 * `IF NOT EXISTS` makes the migration idempotent; no seed data — the
 * directory starts empty.
 */
const SCHEMA_SQL = /* sql */ `
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'EmpresaContactos' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.EmpresaContactos (
    ruc            VARCHAR(11)   NOT NULL PRIMARY KEY,
    razonSocial    NVARCHAR(200) NOT NULL,
    emailPrincipal NVARCHAR(320) NOT NULL,
    emailCopia     NVARCHAR(320) NULL,
    updatedAt      DATETIME2(3)  NOT NULL,
    updatedBy      NVARCHAR(200) NULL
  );
END;
`;

/**
 * Run the schema migration against a SQL Server `HOLOMEDIC` connection
 * pool. Idempotent (`IF NOT EXISTS`); safe to call on every connection
 * (the factory calls it once at startup). Does NOT seed data.
 *
 * Uses a single `request().batch(SCHEMA_SQL)` so the statement runs on
 * one connection — the `IF NOT EXISTS` guard is wrapped in
 * `BEGIN … END` so the parser accepts the `CREATE TABLE` inside the
 * conditional.
 */
export async function migrate(pool: mssql.ConnectionPool): Promise<void> {
  await pool.request().batch(SCHEMA_SQL);
}

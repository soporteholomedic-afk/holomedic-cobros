import type * as mssql from 'mssql';

/**
 * SQL Server schema for the cobranza feature (database `HOLOMEDIC`):
 * the REQ-01 contact directory (`EmpresaContactos`) and the REQ-02
 * send-attempt audit log (`CobranzaEnviosHistorial`).
 *
 * `EmpresaContactos.ruc` is VARCHAR(11) PRIMARY KEY — the directory
 * key fits both the 11-digit RUC and the 8-digit DNI.
 * `emailPrincipal`/`emailCopia` are NVARCHAR(320) (RFC max
 * local@domain length); `updatedAt` is DATETIME2(3) matching the
 * ISO-with-milliseconds app-side stamp; `updatedBy` records the
 * session user that last confirmed the pair.
 *
 * `CobranzaEnviosHistorial` is an append-only audit log: BIGINT
 * IDENTITY PK, `estadoEnvio` CHECK-constrained to SUCCESS|FAILED,
 * `fechaEnvio` DATETIME2(3) DEFAULT SYSUTCDATETIME() (UTC storage
 * convention — deliberate deviation from the REQ draft's GETDATE(),
 * R7), and LOB columns (destinatarios/copias/cuerpoResumen/
 * errorDetalle) kept off the `idx_cobranza_hist_ruc` index because
 * SQL Server forbids LOB types as index key/INCLUDE columns
 * (envios_consolidados migrate precedent). The INCLUDE list covers
 * the history list query's narrow columns with zero key lookups and
 * no sort; per-ruc row counts (dozens) make the LOB row lookups
 * negligible.
 *
 * Fresh CREATE only — no sp_executesql deferral needed because no
 * statement references a column created earlier in the same batch
 * (unlike the auth usuarios backfill case; plantillas migrate.ts has
 * none either).
 *
 * `IF NOT EXISTS` makes the migration idempotent; no seed data —
 * both tables start empty (the audit history starts accruing at
 * deployment; no backfill is possible — pre-deploy sends were
 * unlogged).
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
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CobranzaEnviosHistorial' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.CobranzaEnviosHistorial (
    id                BIGINT        IDENTITY(1,1) NOT NULL PRIMARY KEY,
    ruc               VARCHAR(11)   NOT NULL,
    razonSocial       NVARCHAR(255) NULL,
    destinatarios     NVARCHAR(MAX) NOT NULL,  -- JSON array string, e.g. '["a@x.com"]'
    copias            NVARCHAR(MAX) NULL,
    asunto            NVARCHAR(500) NOT NULL,
    cuerpoResumen     NVARCHAR(MAX) NULL,      -- FULL email HTML (user-confirmed); off-row LOB
    montoReclamado    DECIMAL(18,2) NULL,
    moneda            VARCHAR(10)   NULL,      -- symbol as-is: 'S/' | '$'
    comprobantesCount INT           NULL,
    estadoEnvio       VARCHAR(20)   NOT NULL CHECK (estadoEnvio IN ('SUCCESS','FAILED')),
    errorDetalle      NVARCHAR(MAX) NULL,
    enviadoPor        NVARCHAR(100) NOT NULL,
    fechaEnvio        DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME()  -- UTC (supersedes REQ draft GETDATE(); R7)
  );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_cobranza_hist_ruc' AND object_id = OBJECT_ID('dbo.CobranzaEnviosHistorial'))
BEGIN
  CREATE INDEX idx_cobranza_hist_ruc
    ON dbo.CobranzaEnviosHistorial (ruc, fechaEnvio DESC)
    INCLUDE (estadoEnvio, enviadoPor, razonSocial, asunto, montoReclamado, moneda, comprobantesCount);
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

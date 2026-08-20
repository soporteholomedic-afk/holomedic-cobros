import type * as mssql from 'mssql';

/**
 * SQL Server schema for the consolidated-send history (database
 * `HOLOMEDIC`), following the `dbo.templates` migration precedent.
 *
 * One row per send attempt via `/api/consolidados/send-results`
 * (write-then-send: INSERT `pendiente` before dispatch, UPDATE
 * `enviado`/`error` after). `attachmentsJson` holds the per-attachment
 * snapshot; `bodyHtml` stores the verbatim dispatched HTML (off-row
 * LOB, fetched by PK seek only — excluded from every index).
 *
 * The four `search*` columns are precomputed at write time as
 * accent-stripped lowercase text (`normalizeSearchText`) so the
 * buscador matches "Perú" ↔ "peru" deterministically, independent of
 * collation. They are `NVARCHAR(4000)` — NOT `NVARCHAR(MAX)` —
 * because SQL Server forbids LOB types as index key/INCLUDE columns;
 * `idx_envios_search` INCLUDEs them to keep the LIKE scan covered
 * (no key lookups for the filter/display columns, no sort for
 * `ORDER BY sentAt DESC`). The write-side adapter clamps values to
 * 4000 chars defensively.
 *
 * `idx_envios_sentAt` backs the default newest-first listing.
 * `IF NOT EXISTS` + `BEGIN…END` blocks make the migration idempotent.
 */
const SCHEMA_SQL = /* sql */ `
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'envios_consolidados' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.envios_consolidados (
    id               NVARCHAR(50)   NOT NULL PRIMARY KEY,
    sentAt           DATETIME2(3)   NOT NULL DEFAULT SYSUTCDATETIME(),
    status           NVARCHAR(20)   NOT NULL DEFAULT 'pendiente'
                     CHECK (status IN ('pendiente','enviado','error')),
    errorDetail      NVARCHAR(MAX)  NULL,
    sentBy           NVARCHAR(100)  NOT NULL DEFAULT 'sistema',
    destino          NVARCHAR(200)  NOT NULL DEFAULT '',
    companyId        NVARCHAR(50)   NOT NULL DEFAULT '',
    companyName      NVARCHAR(200)  NOT NULL DEFAULT '',
    nombreCompleto   NVARCHAR(200)  NOT NULL DEFAULT '',
    toRecipients     NVARCHAR(MAX)  NOT NULL,
    ccRecipients     NVARCHAR(MAX)  NOT NULL DEFAULT '[]',
    subject          NVARCHAR(1000) NOT NULL,
    bodyHtml         NVARCHAR(MAX)  NOT NULL,
    attachmentsJson  NVARCHAR(MAX)  NOT NULL DEFAULT '[]',
    searchRecipients NVARCHAR(4000) NOT NULL DEFAULT '',
    searchCompany    NVARCHAR(4000) NOT NULL DEFAULT '',
    searchSubject    NVARCHAR(4000) NOT NULL DEFAULT '',
    searchPatients   NVARCHAR(4000) NOT NULL DEFAULT ''
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_envios_sentAt' AND object_id = OBJECT_ID('dbo.envios_consolidados'))
BEGIN
  CREATE INDEX idx_envios_sentAt
    ON dbo.envios_consolidados (sentAt DESC);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_envios_search' AND object_id = OBJECT_ID('dbo.envios_consolidados'))
BEGIN
  CREATE INDEX idx_envios_search
    ON dbo.envios_consolidados (sentAt DESC)
    INCLUDE (status, sentBy, destino, companyId, companyName, subject,
             searchRecipients, searchCompany, searchSubject, searchPatients);
END;
`;

/**
 * Run the schema migration against a SQL Server `HOLOMEDIC` pool.
 * Idempotent (`IF NOT EXISTS`); safe to call on every connection (the
 * factory calls it once at startup). Single `request().batch()` so all
 * statements run on the same connection. Does NOT seed data.
 */
export async function migrate(pool: mssql.ConnectionPool): Promise<void> {
  await pool.request().batch(SCHEMA_SQL);
}

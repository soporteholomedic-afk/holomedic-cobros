import mssql from 'mssql';

import {
  ETAPAS,
  MEDIOS,
  MOTIVO_CATEGORIAS,
  SECTORES_INICIALES,
} from '../../domain/entities';

/**
 * SQL Server schema of the simple CRM board (feature crm-simple):
 *
 * - `dbo.CrmSector`   sector names, created from the UI (six seeded).
 * - `dbo.CrmEmpresa`  one row per empresa: stage, contact medium, loss reason.
 * - `dbo.CrmContacto` several contacts per empresa, exactly one principal.
 *
 * The table names deliberately avoid the underscore-prefixed namespace of
 * the discarded CRM: production may still run code that recreates those
 * tables on startup, and SQL Server names are case-insensitive.
 *
 * Idempotency is structural (`sys.tables` gate per table, no version table)
 * and the migration is purely additive: it never drops, alters or deletes.
 *
 * The database itself guards the invariants the UI relies on: the RUC is
 * unique and exactly 11 digits (VARCHAR + CHECK: a CHAR(11) would silently
 * pad a shorter value with a space), `etapa`/`medio`/loss category only hold
 * known values, only "perdido" carries a loss reason, "por_contactar" never
 * has a medium, and an empresa can have at most one principal contact.
 */
const lista = (valores: readonly string[]): string => valores.map((v) => `'${v}'`).join(', ');

const SCHEMA_SQL = /* sql */ `
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CrmSector' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.CrmSector (
    idSector   INT            IDENTITY(1,1) NOT NULL PRIMARY KEY,
    nombre     NVARCHAR(50)   NOT NULL,
    createdAt  DATETIME2(3)   NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_CrmSector_nombre UNIQUE (nombre)
  );
  INSERT INTO dbo.CrmSector (nombre) VALUES ${SECTORES_INICIALES.map((s) => `(N'${s}')`).join(', ')};
END;

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CrmEmpresa' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.CrmEmpresa (
    idEmpresa         NVARCHAR(50)   NOT NULL PRIMARY KEY,
    razonSocial       NVARCHAR(200)  NOT NULL,
    ruc               VARCHAR(11)    NOT NULL
      CONSTRAINT CK_CrmEmpresa_ruc CHECK (ruc LIKE '${'[0-9]'.repeat(11)}'),
    idSector          INT            NULL,
    notas             NVARCHAR(MAX)  NULL,
    etapa             NVARCHAR(20)   NOT NULL DEFAULT 'por_contactar'
      CONSTRAINT CK_CrmEmpresa_etapa CHECK (etapa IN (${lista(ETAPAS)})),
    medio             NVARCHAR(10)   NULL
      CONSTRAINT CK_CrmEmpresa_medio CHECK (medio IN (${lista(MEDIOS)})),
    motivoCategoria   NVARCHAR(20)   NULL
      CONSTRAINT CK_CrmEmpresa_motivoCategoria CHECK (motivoCategoria IN (${lista(MOTIVO_CATEGORIAS)})),
    motivoDetalle1    NVARCHAR(200)  NULL,
    motivoDetalle2    NVARCHAR(200)  NULL,
    motivoNotas       NVARCHAR(300)  NULL,
    createdAt         DATETIME2(3)   NOT NULL DEFAULT SYSUTCDATETIME(),
    updatedAt         DATETIME2(3)   NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_CrmEmpresa_ruc UNIQUE (ruc),
    CONSTRAINT FK_CrmEmpresa_sector FOREIGN KEY (idSector) REFERENCES dbo.CrmSector (idSector),
    CONSTRAINT CK_CrmEmpresa_motivo CHECK (
      (etapa = 'perdido' AND motivoCategoria IS NOT NULL) OR (etapa <> 'perdido' AND motivoCategoria IS NULL)
    ),
    CONSTRAINT CK_CrmEmpresa_medioEtapa CHECK (etapa <> 'por_contactar' OR medio IS NULL)
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CrmContacto' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.CrmContacto (
    idContacto   INT            IDENTITY(1,1) NOT NULL PRIMARY KEY,
    idEmpresa    NVARCHAR(50)   NOT NULL,
    nombre       NVARCHAR(200)  NOT NULL,
    telefono     NVARCHAR(50)   NOT NULL,
    correo       NVARCHAR(200)  NULL,
    esPrincipal  BIT            NOT NULL DEFAULT 0,
    orden        INT            NOT NULL DEFAULT 0,
    CONSTRAINT FK_CrmContacto_empresa FOREIGN KEY (idEmpresa)
      REFERENCES dbo.CrmEmpresa (idEmpresa) ON DELETE CASCADE
  );
  CREATE UNIQUE INDEX UX_CrmContacto_principal ON dbo.CrmContacto (idEmpresa) WHERE esPrincipal = 1;
  CREATE INDEX IX_CrmContacto_empresa ON dbo.CrmContacto (idEmpresa, orden);
END;
`;

export async function migrate(pool: mssql.ConnectionPool): Promise<void> {
  await pool.request().batch(SCHEMA_SQL);
}

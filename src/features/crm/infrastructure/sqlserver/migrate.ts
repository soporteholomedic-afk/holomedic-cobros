import mssql from 'mssql';

import {
  ACCIONES,
  DIRECCIONES,
  ETAPAS,
  MEDIOS,
  MOTIVO_CATEGORIAS,
  ORIGENES,
  RESULTADOS,
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
 * - `dbo.CrmInteraccion` contact history, one row per contact, deleted with the empresa.
 *
 * Idempotency is structural (no version table): each CREATE TABLE is gated
 * by `sys.tables`, and the upgrade steps that bring a database created by
 * the first version to the current schema (L6 of crm-contactos) are each
 * gated by `sys.columns` / `sys.indexes` / `sys.key_constraints` /
 * `sys.check_constraints`. The same script therefore converges on the final
 * schema from an empty database and from the old one. It never drops a
 * table nor deletes rows; the only things it drops are the RUC unique
 * constraint and the `medio` CHECK, both recreated right away.
 *
 * The database itself guards the invariants the UI relies on: the RUC is
 * unique when present and exactly 11 digits (VARCHAR + CHECK: a CHAR(11) would silently
 * pad a shorter value with a space), `etapa`/`medio`/loss category only hold
 * known values, only "perdido" carries a loss reason, "por_contactar" never
 * has a medium, and an empresa can have at most one principal contact.
 */
const lista = (valores: readonly string[]): string => valores.map((v) => `'${v}'`).join(', ');

/** Guarded `ADD <columna>` on CrmEmpresa; `definicion` is everything after the column name. */
const columnaEmpresa = (columna: string, definicion: string): string =>
  `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CrmEmpresa') AND name = '${columna}')
BEGIN
  ALTER TABLE dbo.CrmEmpresa ADD ${columna} ${definicion};
END;
`;

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

-- ---- Upgrade of the first version (guarded; no-ops on a fresh database) ----

IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UQ_CrmEmpresa_ruc' AND parent_object_id = OBJECT_ID('dbo.CrmEmpresa'))
BEGIN
  ALTER TABLE dbo.CrmEmpresa DROP CONSTRAINT UQ_CrmEmpresa_ruc;
END;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CrmEmpresa') AND name = 'ruc' AND is_nullable = 0)
BEGIN
  ALTER TABLE dbo.CrmEmpresa ALTER COLUMN ruc VARCHAR(11) NULL;
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_CrmEmpresa_ruc' AND object_id = OBJECT_ID('dbo.CrmEmpresa'))
BEGIN
  CREATE UNIQUE INDEX UX_CrmEmpresa_ruc ON dbo.CrmEmpresa (ruc) WHERE ruc IS NOT NULL;
END;

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_CrmEmpresa_medio' AND parent_object_id = OBJECT_ID('dbo.CrmEmpresa') AND definition NOT LIKE N'%''otro''%')
BEGIN
  ALTER TABLE dbo.CrmEmpresa DROP CONSTRAINT CK_CrmEmpresa_medio;
  ALTER TABLE dbo.CrmEmpresa ADD CONSTRAINT CK_CrmEmpresa_medio CHECK (medio IN (${lista(MEDIOS)}));
END;

${columnaEmpresa('medioOtro', 'NVARCHAR(40) NULL')}
${columnaEmpresa('intentosSinRespuesta', 'INT NOT NULL CONSTRAINT DF_CrmEmpresa_intentosSinRespuesta DEFAULT 0')}
${columnaEmpresa('faltaResponderDesde', 'DATETIME2(3) NULL')}
${columnaEmpresa('proximaAccionTipo', `NVARCHAR(20) NULL CONSTRAINT CK_CrmEmpresa_proximaAccionTipo CHECK (proximaAccionTipo IN (${lista(ACCIONES)}))`)}
${columnaEmpresa('proximaAccionDetalle', 'NVARCHAR(80) NULL')}
${columnaEmpresa('proximaAccionFecha', 'DATE NULL')}
${columnaEmpresa('origen', `NVARCHAR(20) NULL CONSTRAINT CK_CrmEmpresa_origen CHECK (origen IN (${lista(ORIGENES)}))`)}
${columnaEmpresa('sugerenciaDescartadaEn', 'INT NULL')}

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CrmContacto') AND name = 'nombre' AND is_nullable = 0)
BEGIN
  ALTER TABLE dbo.CrmContacto ALTER COLUMN nombre NVARCHAR(200) NULL;
END;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CrmContacto') AND name = 'telefono' AND is_nullable = 0)
BEGIN
  ALTER TABLE dbo.CrmContacto ALTER COLUMN telefono NVARCHAR(50) NULL;
END;

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CrmInteraccion' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.CrmInteraccion (
    idInteraccion  INT            IDENTITY(1,1) NOT NULL PRIMARY KEY,
    idEmpresa      NVARCHAR(50)   NOT NULL,
    fecha          DATETIME2(3)   NOT NULL DEFAULT SYSUTCDATETIME(),
    idUsuario      NVARCHAR(50)   NOT NULL,
    nombreUsuario  NVARCHAR(200)  NOT NULL,
    direccion      NVARCHAR(10)   NOT NULL
      CONSTRAINT CK_CrmInteraccion_direccion CHECK (direccion IN (${lista(DIRECCIONES)})),
    medio          NVARCHAR(10)   NOT NULL
      CONSTRAINT CK_CrmInteraccion_medio CHECK (medio IN (${lista(MEDIOS)})),
    medioOtro      NVARCHAR(40)   NULL,
    resultado      NVARCHAR(20)   NOT NULL
      CONSTRAINT CK_CrmInteraccion_resultado CHECK (resultado IN (${lista(RESULTADOS)})),
    resumen        NVARCHAR(1000) NULL,
    CONSTRAINT FK_CrmInteraccion_empresa FOREIGN KEY (idEmpresa)
      REFERENCES dbo.CrmEmpresa (idEmpresa) ON DELETE CASCADE
  );
  CREATE INDEX IX_CrmInteraccion_empresa ON dbo.CrmInteraccion (idEmpresa, fecha DESC);
END;
`;

export async function migrate(pool: mssql.ConnectionPool): Promise<void> {
  await pool.request().batch(SCHEMA_SQL);
}

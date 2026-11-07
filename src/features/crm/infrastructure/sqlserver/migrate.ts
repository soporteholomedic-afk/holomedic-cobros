import mssql from 'mssql';

import {
  ACCIONES,
  DIRECCIONES,
  ETAPAS_OPORTUNIDAD,
  ICONOS_INICIALES,
  ICONOS_SECTOR,
  MEDIOS,
  MOTIVO_CATEGORIAS,
  ORIGENES,
  RELACIONES,
  RESULTADOS,
  SECTORES_INICIALES,
} from '../../domain/entities';

/**
 * SQL Server schema of the CRM (features crm-simple, crm-contactos and
 * crm-oportunidades):
 *
 * - `dbo.CrmSector`      sector names and their optional icon key, created from the UI (seeded).
 * - `dbo.CrmEmpresa`     one row per empresa: the permanent ficha (RUC, sector,
 *                        contacts, relacion prospecto/cliente, notes). The RUC is
 *                        NULL-able, unique when present. Its etapa-era columns were
 *                        migrated into CrmOportunidad and retired (S8).
 * - `dbo.CrmOportunidad` one row per commercial deal — the Kanban card. Stage,
 *                        medium, loss reason and follow-up state live here;
 *                        `migrada` marks the rows created by the etapa→oportunidad
 *                        data migration, never by a user.
 * - `dbo.CrmContacto`    several contacts per empresa, exactly one principal.
 * - `dbo.CrmInteraccion` contact history, one row per contact, deleted with the
 *                        empresa, optionally linked to an oportunidad.
 *
 * Guarantees of the generated script (one batch):
 *
 * - Atomic: `SET XACT_ABORT ON; BEGIN TRAN; ... COMMIT;`. Any error aborts
 *   and rolls back the whole batch (DDL is transactional in SQL Server), so a
 *   failure never leaves a half-upgraded schema.
 * - Lock-protected: the first statement takes an exclusive application lock
 *   (`sp_getapplock`, owner = transaction, 10 s wait: shorter than the
 *   driver's 15 s request timeout so a busy lock reports this clear error)
 *   and throws if it is not granted,
 *   so two processes starting together cannot both pass the existence guards.
 * - Idempotent and self-healing, with no version table: every step is gated
 *   by `sys.tables` / `sys.columns` / `sys.indexes` / `sys.key_constraints` /
 *   `sys.check_constraints`. A recreated object uses two independent guards
 *   ("drop if wrong", then "add if missing"), so it converges from an empty
 *   database, from the first version (3ea38d5) and from any partial state.
 * - Non-destructive: it never issues DROP TABLE, DELETE or TRUNCATE. The only
 *   objects it drops are the RUC unique constraint (recreated as a filtered
 *   index by the next guarded step) and the etapa-era columns of CrmEmpresa
 *   with their constraints (S8, after their data migrates into CrmOportunidad),
 *   each guarded so a fresh install never had them and the steps are no-ops.
 * - Never touches the discarded `CRM_` namespace: production may still
 *   recreate those tables on startup, and SQL Server names are case-insensitive.
 *
 * The database itself guards the invariants the UI relies on: the RUC is
 * unique when present and exactly 11 digits (VARCHAR + CHECK: a CHAR(11) would
 * silently pad a shorter value with a space), `relacion` only holds
 * prospecto/cliente, the oportunidad `etapa`/`medio`/loss category only hold
 * known values, only "perdida" carries a loss reason, "por_contactar" never
 * has a medium, and an empresa can have at most one principal contact.
 */
const lista = (valores: readonly string[]): string => valores.map((v) => `'${v}'`).join(', ');

/** Same list, quoted for use INSIDE an EXEC(N'...') dynamic statement. */
const listaDinamica = (valores: readonly string[]): string => valores.map((v) => `''${v}''`).join(', ');

/** Columns the etapa→oportunidad migration reads from CrmEmpresa and then drops (S8). */
const COLUMNAS_RETIRADAS = [
  'etapa',
  'medio',
  'medioOtro',
  'motivoCategoria',
  'motivoDetalle1',
  'motivoDetalle2',
  'motivoNotas',
  'intentosSinRespuesta',
  'faltaResponderDesde',
  'proximaAccionTipo',
  'proximaAccionDetalle',
  'proximaAccionFecha',
  'origen',
  'sugerenciaDescartadaEn',
];

/** Guarded `ADD <columna>` on CrmEmpresa; `definicion` is everything after the column name. */
const columnaEmpresa = (columna: string, definicion: string): string =>
  `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CrmEmpresa') AND name = '${columna}')
BEGIN
  ALTER TABLE dbo.CrmEmpresa ADD ${columna} ${definicion};
END;
`;

/**
 * Icons of the six initial sectors, set only where `icono IS NULL` so a value
 * chosen later is never overwritten. `icono` is added earlier in the SAME
 * batch, and SQL Server compiles a batch statement by statement before running
 * it, so a plain UPDATE would fail with "Invalid column name": it goes through
 * dynamic SQL, which compiles when it runs.
 */
const SEMILLA_ICONOS_SQL = `IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CrmSector') AND name = 'icono')
BEGIN
  EXEC(N'UPDATE s SET s.icono = v.icono
    FROM dbo.CrmSector s
    JOIN (VALUES ${SECTORES_INICIALES.map((n, i) => `(N\'\'${n}\'\', \'\'${ICONOS_INICIALES[i]}\'\')`).join(', ')}) AS v (nombre, icono)
      ON s.nombre = v.nombre
    WHERE s.icono IS NULL;');
END;`;

const SCHEMA_SQL = /* sql */ `
SET XACT_ABORT ON;
BEGIN TRAN;

DECLARE @lock INT;
EXEC @lock = sp_getapplock @Resource = N'crm-migrate', @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 10000;
IF @lock < 0
BEGIN
  THROW 50001, N'CRM migration: could not get the application lock', 1;
END;

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
    createdAt         DATETIME2(3)   NOT NULL DEFAULT SYSUTCDATETIME(),
    updatedAt         DATETIME2(3)   NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_CrmEmpresa_ruc UNIQUE (ruc),
    CONSTRAINT FK_CrmEmpresa_sector FOREIGN KEY (idSector) REFERENCES dbo.CrmSector (idSector)
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

-- ---- Sector icon (S12): guarded ADD, then a seed that only fills NULL icons ----

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CrmSector') AND name = 'icono')
BEGIN
  ALTER TABLE dbo.CrmSector ADD icono NVARCHAR(20) NULL CONSTRAINT CK_CrmSector_icono CHECK (icono IN (${lista(ICONOS_SECTOR)}));
END;

${SEMILLA_ICONOS_SQL}

-- ---- Relacion prospecto/cliente (S8): the old etapa 'cliente' becomes this ----

${columnaEmpresa(
  'relacion',
  `NVARCHAR(20) NOT NULL CONSTRAINT DF_CrmEmpresa_relacion DEFAULT N'prospecto' CONSTRAINT CK_CrmEmpresa_relacion CHECK (relacion IN (${lista(RELACIONES)}))`,
)}
${columnaEmpresa('direccion', 'NVARCHAR(300) NULL')}

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

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CrmOportunidad' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  -- T2 (crm-oportunidades): one concrete deal of an empresa — the Kanban
  -- card. The empresa stays the permanent ficha; winning or losing a deal
  -- never changes its relacion. The migrada flag marks the rows created by the
  -- etapa→oportunidad data migration below, never by a user.
  CREATE TABLE dbo.CrmOportunidad (
    idOportunidad          NVARCHAR(50)   NOT NULL PRIMARY KEY,
    idEmpresa              NVARCHAR(50)   NOT NULL,
    nombre                 NVARCHAR(120)  NOT NULL,
    responsableId          NVARCHAR(50)   NULL,
    responsableNombre      NVARCHAR(200)  NULL,
    origen                 NVARCHAR(20)   NULL
      CONSTRAINT CK_CrmOportunidad_origen CHECK (origen IN (${lista(ORIGENES)})),
    servicio               NVARCHAR(120)  NULL,
    montoEstimado          DECIMAL(12,2)  NULL
      CONSTRAINT CK_CrmOportunidad_monto CHECK (montoEstimado > 0),
    etapa                  NVARCHAR(20)   NOT NULL
      CONSTRAINT DF_CrmOportunidad_etapa DEFAULT 'por_contactar'
      CONSTRAINT CK_CrmOportunidad_etapa CHECK (etapa IN (${lista(ETAPAS_OPORTUNIDAD)})),
    medio                  NVARCHAR(20)   NULL
      CONSTRAINT CK_CrmOportunidad_medio CHECK (medio IN (${lista(MEDIOS)})),
    medioOtro              NVARCHAR(80)   NULL,
    motivoCategoria        NVARCHAR(20)   NULL
      CONSTRAINT CK_CrmOportunidad_motivoCategoria CHECK (motivoCategoria IN (${lista(MOTIVO_CATEGORIAS)})),
    motivoDetalle1         NVARCHAR(200)  NULL,
    motivoDetalle2         NVARCHAR(200)  NULL,
    motivoNotas            NVARCHAR(300)  NULL,
    intentosSinRespuesta   INT            NOT NULL CONSTRAINT DF_CrmOportunidad_intentosSinRespuesta DEFAULT 0,
    faltaResponderDesde    DATETIME2(3)   NULL,
    proximaAccionTipo      NVARCHAR(20)   NULL
      CONSTRAINT CK_CrmOportunidad_proximaAccionTipo CHECK (proximaAccionTipo IN (${lista(ACCIONES)})),
    proximaAccionDetalle   NVARCHAR(80)   NULL,
    proximaAccionFecha     DATE           NULL,
    sugerenciaDescartadaEn INT            NULL,
    migrada                BIT            NOT NULL CONSTRAINT DF_CrmOportunidad_migrada DEFAULT 0,
    createdAt              DATETIME2(3)   NOT NULL DEFAULT SYSUTCDATETIME(),
    updatedAt              DATETIME2(3)   NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_CrmOportunidad_empresa FOREIGN KEY (idEmpresa)
      REFERENCES dbo.CrmEmpresa (idEmpresa) ON DELETE CASCADE,
    CONSTRAINT CK_CrmOportunidad_motivo CHECK (
      (etapa = 'perdida' AND motivoCategoria IS NOT NULL)
      OR (etapa <> 'perdida' AND motivoCategoria IS NULL AND motivoDetalle1 IS NULL
          AND motivoDetalle2 IS NULL AND motivoNotas IS NULL)
    ),
    CONSTRAINT CK_CrmOportunidad_medioEtapa CHECK (etapa <> 'por_contactar' OR medio IS NULL)
  );
  CREATE INDEX IX_CrmOportunidad_empresa ON dbo.CrmOportunidad (idEmpresa, createdAt DESC);
END;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CrmInteraccion') AND name = 'idOportunidad')
BEGIN
  ALTER TABLE dbo.CrmInteraccion ADD idOportunidad NVARCHAR(50) NULL;
END;

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_CrmInteraccion_oportunidad' AND parent_object_id = OBJECT_ID('dbo.CrmInteraccion'))
   AND EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CrmOportunidad' AND schema_id = SCHEMA_ID('dbo'))
   AND EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CrmInteraccion') AND name = 'idOportunidad')
BEGIN
  -- NO ACTION on purpose: only removing the empresa removes rows here (both
  -- FKs point at CrmEmpresa), so removing one oportunidad alone stays blocked
  -- while activities still reference it.
  ALTER TABLE dbo.CrmInteraccion
    ADD CONSTRAINT FK_CrmInteraccion_oportunidad FOREIGN KEY (idOportunidad)
      REFERENCES dbo.CrmOportunidad (idOportunidad);
END;

-- ---- S8 data migration: etapa -> oportunidad, cliente -> relacion ----
-- Guarded on the old etapa column: a fresh database never had it, so both
-- steps are no-ops there. The statements go through dynamic SQL because the
-- etapa-era columns do not exist when the batch compiles on a fresh install.

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CrmEmpresa') AND name = 'etapa')
BEGIN
  -- "Cliente" was a stage; now it is the empresa's relationship. Losing one
  -- deal never demotes the empresa (S5/S6), so clientes keep their historial
  -- and contacts intact and get NO synthetic card (S8).
  EXEC(N'UPDATE dbo.CrmEmpresa SET relacion = N''cliente'' WHERE etapa = N''cliente'';');
  -- One migrated oportunidad per empresa whose stage was an open negotiation
  -- or a loss; idempotent via the migrada flag (a re-run never duplicates).
  EXEC(N'INSERT INTO dbo.CrmOportunidad
    (idOportunidad, idEmpresa, nombre, origen, medio, medioOtro,
     motivoCategoria, motivoDetalle1, motivoDetalle2, motivoNotas,
     intentosSinRespuesta, faltaResponderDesde,
     proximaAccionTipo, proximaAccionDetalle, proximaAccionFecha,
     sugerenciaDescartadaEn, etapa, migrada, createdAt, updatedAt)
  SELECT NEWID(), e.idEmpresa, N''Gestión comercial inicial'', e.origen, e.medio, e.medioOtro,
         e.motivoCategoria, e.motivoDetalle1, e.motivoDetalle2, e.motivoNotas,
         e.intentosSinRespuesta, e.faltaResponderDesde,
         e.proximaAccionTipo, e.proximaAccionDetalle, e.proximaAccionFecha,
         e.sugerenciaDescartadaEn,
         CASE WHEN e.etapa = N''perdido'' THEN N''perdida'' ELSE e.etapa END,
         1, e.createdAt, e.updatedAt
    FROM dbo.CrmEmpresa e
   WHERE e.etapa <> N''cliente''
     AND NOT EXISTS (SELECT 1 FROM dbo.CrmOportunidad o
                      WHERE o.idEmpresa = e.idEmpresa AND o.migrada = 1);');
END;

-- ---- Retirement of the etapa-era columns (guarded; no-op on a fresh install) ----

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CrmEmpresa') AND name = 'etapa')
BEGIN
  IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_CrmEmpresa_motivo' AND parent_object_id = OBJECT_ID('dbo.CrmEmpresa'))
  BEGIN
    ALTER TABLE dbo.CrmEmpresa DROP CONSTRAINT CK_CrmEmpresa_motivo;
  END;
  IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_CrmEmpresa_medioEtapa' AND parent_object_id = OBJECT_ID('dbo.CrmEmpresa'))
  BEGIN
    ALTER TABLE dbo.CrmEmpresa DROP CONSTRAINT CK_CrmEmpresa_medioEtapa;
  END;
  -- Inline constraints (named or auto-named CHECK/DEFAULT attached to the
  -- columns) are discovered by parent_object_id + column and dropped through
  -- dynamic SQL: SQL Server auto-names them, so they have no fixed name.
  EXEC(N'DECLARE @constrainte sysname;
DECLARE retirar CURSOR LOCAL FAST_FORWARD FOR
  SELECT dc.name FROM sys.check_constraints dc
   WHERE dc.parent_object_id = OBJECT_ID(''dbo.CrmEmpresa'')
     AND dc.parent_column_id IN (SELECT k.column_id FROM sys.columns k
                                  WHERE k.object_id = dc.parent_object_id
                                    AND k.name IN (${listaDinamica(COLUMNAS_RETIRADAS)}))
  UNION ALL
  SELECT dc.name FROM sys.default_constraints dc
   WHERE dc.parent_object_id = OBJECT_ID(''dbo.CrmEmpresa'')
     AND dc.parent_column_id IN (SELECT k.column_id FROM sys.columns k
                                  WHERE k.object_id = dc.parent_object_id
                                    AND k.name IN (${listaDinamica(COLUMNAS_RETIRADAS)}));
OPEN retirar;
FETCH NEXT FROM retirar INTO @constrainte;
WHILE @@FETCH_STATUS = 0
BEGIN
  EXEC(''ALTER TABLE dbo.CrmEmpresa DROP CONSTRAINT '' + QUOTENAME(@constrainte));
  FETCH NEXT FROM retirar INTO @constrainte;
END;
CLOSE retirar;
DEALLOCATE retirar;');
  ALTER TABLE dbo.CrmEmpresa DROP COLUMN etapa, medio, medioOtro, motivoCategoria, motivoDetalle1,
    motivoDetalle2, motivoNotas, intentosSinRespuesta, faltaResponderDesde, proximaAccionTipo,
    proximaAccionDetalle, proximaAccionFecha, origen, sugerenciaDescartadaEn;
END;

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CrmConfig' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  -- E5·T2 (agente-ia-crm, portada por crm-consulta-sunat): platform key/value
  -- configuration the admin edits at runtime (apifacturacion token/URL).
  -- Secret rows (esSecreto = 1) hold an already-ENCRYPTED payload
  -- (cifradoSecretos, AES-256-GCM); encryption is the caller's job.
  CREATE TABLE dbo.CrmConfig (
    clave          NVARCHAR(100)  NOT NULL CONSTRAINT PK_CrmConfig PRIMARY KEY,
    valor          NVARCHAR(2000) NOT NULL,
    esSecreto      BIT            NOT NULL CONSTRAINT DF_CrmConfig_EsSecreto DEFAULT 0,
    actualizadoPor NVARCHAR(200)  NOT NULL,
    actualizadoEn  DATETIME2(0)   NOT NULL CONSTRAINT DF_CrmConfig_ActualizadoEn DEFAULT SYSDATETIME()
  );
END;
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CrmConfigAuditoria' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  -- E5·T2: append-only change trail. NO foreign key to CrmConfig on
  -- purpose — the trail must outlive a deleted key. valorAnterior /
  -- valorNuevo are NULL for secrets (the value is never recorded, only
  -- the fact of the change) and for the absent side of an insert or removal.
  CREATE TABLE dbo.CrmConfigAuditoria (
    id            BIGINT         IDENTITY(1,1) NOT NULL CONSTRAINT PK_CrmConfigAuditoria PRIMARY KEY,
    clave         NVARCHAR(100)  NOT NULL,
    usuario       NVARCHAR(200)  NOT NULL,
    valorAnterior NVARCHAR(2000) NULL,
    valorNuevo    NVARCHAR(2000) NULL,
    esSecreto     BIT            NOT NULL CONSTRAINT DF_CrmConfigAuditoria_EsSecreto DEFAULT 0,
    creadoEn      DATETIME2(3)   NOT NULL CONSTRAINT DF_CrmConfigAuditoria_CreadoEn DEFAULT SYSDATETIME()
  );
  CREATE INDEX IX_CrmConfigAuditoria_Clave ON dbo.CrmConfigAuditoria (clave, id DESC);
END;

COMMIT;
`;

export async function migrate(pool: mssql.ConnectionPool): Promise<void> {
  await pool.request().batch(SCHEMA_SQL);
}

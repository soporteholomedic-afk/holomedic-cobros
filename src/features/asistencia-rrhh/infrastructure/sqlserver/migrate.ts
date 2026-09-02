import * as mssql from 'mssql';

/**
 * SQL Server schema for the asistencia-rrhh feature (database
 * `HOLOMEDIC`), Fase 1 — captura (REQ-F1-17). Seven additive tables:
 *
 * - `empleados` — device-reported users bootstrap as PENDIENTE_FICHA
 *   (UNIQUE userId); RRHH completion moves them to ACTIVO.
 * - `dispositivos` — ZKTeco devices; `apiTokenHash` is VARBINARY(32),
 *   the exact SHA-256 digest (ADR-7) compared by byte equality.
 * - `marcaciones_raw` — raw punches, append-only in F1. BIGINT IDENTITY
 *   PK; dedup constraint `uq_marcacion (userId, fechaHora, punch)` makes
 *   ingestion idempotent; `empleadoId` stays NULL until the ficha exists.
 * - `parametros_sistema` — seeded system parameters (see seedParametros).
 * - `alertas` — capture alerts (unknown user, clock drift, worker down).
 * - `comandos_dispositivo` — PENDIENTE → ENVIADO → CONFIRMADO lifecycle.
 * - `auditoria` — RRHH mutations trail; `usuarioId` is NVARCHAR(50) to
 *   hold `dbo.usuarios.idUsuario` (UUID).
 *
 * Conventions and deliberate deviations from other repo features:
 * - Timestamps use `DATETIME2(0) DEFAULT SYSDATETIME()` — naive
 *   America/Lima wall clock (ADR-9), NOT the UTC `SYSUTCDATETIME()`
 *   convention of cobranza/envio-resultados. Conditioned on the SQL host
 *   running at America/Lima (risk R3, verified at rollout).
 * - Table/column names are lowercase/camelCase per the asistencia DDL
 *   (matches the feature's REQ naming; unlike the PascalCase legacy
 *   tables). The feature is new — no legacy coupling.
 *
 * Fresh CREATE only — no statement references a column created earlier
 * in the same batch, and FK-referencing tables are declared after their
 * targets (empleados, dispositivos → marcaciones_raw/comandos_dispositivo)
 * so the single batch is order-safe.
 *
 * `IF NOT EXISTS` guards (sys.tables per table, sys.indexes per index)
 * make the migration idempotent; safe to run on every first connection
 * via `getAsistenciaDb()`.
 */
const SCHEMA_SQL = /* sql */ `
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'empleados' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.empleados (
    id            INT           IDENTITY(1,1) NOT NULL PRIMARY KEY,
    userId        VARCHAR(20)   NOT NULL UNIQUE,
    dni           VARCHAR(15)   NULL,
    nombres       NVARCHAR(100) NULL,
    apellidos     NVARCHAR(100) NULL,
    area          NVARCHAR(80)  NULL,
    cargo         NVARCHAR(80)  NULL,
    fechaIngreso  DATE          NULL,
    fechaBaja     DATE          NULL,
    estado        VARCHAR(20)   NOT NULL DEFAULT 'PENDIENTE_FICHA'
                  CHECK (estado IN ('PENDIENTE_FICHA','ACTIVO','INACTIVO','SUSPENDIDO')),
    modoExtras    VARCHAR(10)   NOT NULL DEFAULT 'PAGAR',
    createdAt     DATETIME2(0)  NOT NULL DEFAULT SYSDATETIME(),
    updatedAt     DATETIME2(0)  NOT NULL DEFAULT SYSDATETIME()
  );
END;
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dispositivos' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.dispositivos (
    id                   INT          IDENTITY(1,1) NOT NULL PRIMARY KEY,
    codigo               VARCHAR(30)  NOT NULL UNIQUE,
    sede                 NVARCHAR(100) NULL,
    ip                   VARCHAR(45)  NULL,
    apiTokenHash         VARBINARY(32) NOT NULL,
    activo               BIT          NOT NULL DEFAULT 1,
    ultimaSincronizacion DATETIME2(0) NULL,
    createdAt            DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
    updatedAt            DATETIME2(0) NOT NULL DEFAULT SYSDATETIME()
  );
END;
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'marcaciones_raw' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.marcaciones_raw (
    id               BIGINT       IDENTITY(1,1) NOT NULL PRIMARY KEY,
    dispositivoId    INT          NOT NULL REFERENCES dbo.dispositivos(id),
    userId           VARCHAR(20)  NOT NULL,
    empleadoId       INT          NULL REFERENCES dbo.empleados(id),
    fechaHora        DATETIME2(0) NOT NULL,
    punch            INT          NOT NULL,
    tipoVerificacion VARCHAR(15)  NOT NULL
                     CHECK (tipoVerificacion IN ('HUELLA','TARJETA','PIN')),
    procesada        BIT          NOT NULL DEFAULT 0,
    createdAt        DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT uq_marcacion UNIQUE (userId, fechaHora, punch)
  );
END;
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'parametros_sistema' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.parametros_sistema (
    clave       VARCHAR(50)   NOT NULL PRIMARY KEY,
    valor       NVARCHAR(200) NOT NULL,
    descripcion NVARCHAR(300) NULL,
    updatedAt   DATETIME2(0)  NOT NULL DEFAULT SYSDATETIME()
  );
END;
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'alertas' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.alertas (
    id            BIGINT        IDENTITY(1,1) NOT NULL PRIMARY KEY,
    tipo          VARCHAR(40)   NOT NULL,
    empleadoId    INT           NULL,
    dispositivoId INT           NULL,
    detalle       NVARCHAR(500) NULL,
    fecha         DATETIME2(0)  NOT NULL DEFAULT SYSDATETIME(),
    atendida      BIT           NOT NULL DEFAULT 0
  );
END;
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'comandos_dispositivo' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.comandos_dispositivo (
    id            BIGINT        IDENTITY(1,1) NOT NULL PRIMARY KEY,
    dispositivoId INT           NOT NULL REFERENCES dbo.dispositivos(id),
    tipo          VARCHAR(30)   NOT NULL
                  CHECK (tipo IN ('DESACTIVAR_USER','SET_TIME','SYNC_COMPLETO')),
    payload       NVARCHAR(MAX) NULL,
    estado        VARCHAR(20)   NOT NULL DEFAULT 'PENDIENTE'
                  CHECK (estado IN ('PENDIENTE','ENVIADO','CONFIRMADO','ERROR')),
    createdAt     DATETIME2(0)  NOT NULL DEFAULT SYSDATETIME(),
    enviadoAt     DATETIME2(0)  NULL,
    confirmadoAt  DATETIME2(0)  NULL
  );
END;
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'auditoria' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.auditoria (
    id              BIGINT        IDENTITY(1,1) NOT NULL PRIMARY KEY,
    tabla           NVARCHAR(60)  NOT NULL,
    registroId      BIGINT        NULL,
    accion          VARCHAR(10)   NOT NULL,
    datosAnteriores NVARCHAR(MAX) NULL,
    datosNuevos     NVARCHAR(MAX) NULL,
    usuarioId       NVARCHAR(50)  NULL,
    createdAt       DATETIME2(0)  NOT NULL DEFAULT SYSDATETIME()
  );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_marcaciones_fecha' AND object_id = OBJECT_ID('dbo.marcaciones_raw'))
BEGIN
  CREATE INDEX idx_marcaciones_fecha
    ON dbo.marcaciones_raw (fechaHora DESC)
    INCLUDE (userId, empleadoId, punch, tipoVerificacion, dispositivoId);
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_marcaciones_empleado' AND object_id = OBJECT_ID('dbo.marcaciones_raw'))
BEGIN
  CREATE INDEX idx_marcaciones_empleado
    ON dbo.marcaciones_raw (empleadoId, fechaHora DESC);
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_alertas_fecha' AND object_id = OBJECT_ID('dbo.alertas'))
BEGIN
  CREATE INDEX idx_alertas_fecha
    ON dbo.alertas (fecha DESC)
    INCLUDE (tipo, atendida);
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_comandos_disp_estado' AND object_id = OBJECT_ID('dbo.comandos_dispositivo'))
BEGIN
  CREATE INDEX idx_comandos_disp_estado
    ON dbo.comandos_dispositivo (dispositivoId, estado)
    INCLUDE (tipo, enviadoAt, confirmadoAt);
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_auditoria_tabla_registro' AND object_id = OBJECT_ID('dbo.auditoria'))
BEGIN
  CREATE INDEX idx_auditoria_tabla_registro
    ON dbo.auditoria (tabla, registroId, createdAt DESC);
END;
`;

/**
 * Run the schema migration against a SQL Server `HOLOMEDIC` connection
 * pool. Idempotent (`IF NOT EXISTS`); safe to call on every first
 * connection (the `getAsistenciaDb()` factory calls it once at startup).
 * Seeds nothing — see `seedParametros` for the REQ-F1-18 parameter seed.
 *
 * Uses a single `request().batch(SCHEMA_SQL)` so the statement runs on
 * one connection — each `IF NOT EXISTS` guard is wrapped in
 * `BEGIN … END` so the parser accepts the DDL inside the conditional.
 */
export async function migrate(pool: mssql.ConnectionPool): Promise<void> {
  await pool.request().batch(SCHEMA_SQL);
}

/**
 * System parameters seeded at startup (REQ-F1-18). F1 only READS
 * TARDANZA_ALARMA_RELOJ_SEG (REQ-F1-03) and WORKER_CAIDO_SEG (ADR-5);
 * the rest are planted now for the F2/F3 calculation engine.
 *
 * Idempotent and non-destructive by construction: one parameterized
 * `IF NOT EXISTS … INSERT` per clave — an existing value (possibly
 * hand-tuned by ops) is NEVER overwritten and nothing is updated or
 * deleted. Runs after `migrate()` inside `getAsistenciaDb()`.
 */
const PARAMETROS_INICIALES: ReadonlyArray<{ clave: string; valor: string }> = [
  { clave: 'TOLERANCIA_MINUTOS', valor: '5' },
  { clave: 'TOLERANCIA_USOS_MES', valor: '6' },
  { clave: 'MIN_COLAPSO_MARCAS', valor: '2' },
  { clave: 'REFRI_MIN_MINUTOS', valor: '15' },
  { clave: 'REFRI_MAX_MINUTOS', valor: '180' },
  { clave: 'TARDANZA_ALARMA_RELOJ_SEG', valor: '60' },
  { clave: 'WORKER_CAIDO_SEG', valor: '300' },
];

export async function seedParametros(pool: mssql.ConnectionPool): Promise<void> {
  for (const { clave, valor } of PARAMETROS_INICIALES) {
    await pool
      .request()
      .input('clave', mssql.VarChar(50), clave)
      .input('valor', mssql.NVarChar(200), valor)
      .query(
        'IF NOT EXISTS (SELECT 1 FROM dbo.parametros_sistema WHERE clave = @clave) ' +
          'INSERT INTO dbo.parametros_sistema (clave, valor) VALUES (@clave, @valor)',
      );
  }
}

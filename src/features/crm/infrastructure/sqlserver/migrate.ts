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
 * - `CRM_Pipeline` (pr9) — the 1:1 pipeline row (design D3 state
 *   machine: 11 states over the INBOUND/OUTBOUND flows plus the
 *   flujo-keeping RECHAZADO stage). Carries the denormalized cadence
 *   counters (`ciclo`, `enviosCiclo`) and day-granularity DATE markers
 *   (`fechaCicloInicio`, `fechaUltimoEnvio`, `descansoHasta` for T8,
 *   `rechazadoHasta` for T14's 3-month cooldown) so the daily queue is
 *   a cheap derived scan (design §3 — zero background jobs).
 * - `CRM_Transiciones` (pr9) — full transition audit (spec G4: who,
 *   when, from, to); `flujoPrevio`/`etapaPrevia` are NULL for the
 *   creation transitions (T1/T6).
 * - `CRM_Resultados` (pr9) — result-event rows for productivity
 *   (design D4's 6-event catalog, CHECK-enforced; `AvanceDeEtapa` is
 *   deliberately absent — stage changes already live in
 *   CRM_Transiciones and must not double-count).
 * - `CRM_Handoffs` (pr10) — handoff records (design §2: área, nota,
 *   user); the T5 transition writes its row INSIDE the transition
 *   transaction, and the standalone handoff endpoint appends records.
 * - `CRM_Actividades` (pr13) — the activity log (design §2: 6-value
 *   tipo catalog CHECK, optional contactoId addressee, business
 *   `fecha` DATE); the cadence send writes its ENVIO_CADENCIA row
 *   INSIDE the send transaction next to the pipeline counters.
 * - `CRM_Asignaciones` (pr14) — the assignment audit trail (spec G5):
 *   one append-only row per `ASIGNADO` / `REASIGNADO` / `DEVUELTO`
 *   event with `responsablePrevio` / `responsableNuevo` (NULL = pool)
 *   and the acting user; `CRM_Empresas.responsable` remains the CURRENT
 *   owner (single-owner invariant) and this table is the history. The
 *   assignment write (empresa UPDATE + event INSERT) lands in ONE
 *   `withCrmTransaction` (design §2d).
 *
 * Conventions (design §2): INT IDENTITY PKs for registry tables,
 * BIGINT for high-volume history rows, `DATETIME2(0) DEFAULT
 * SYSDATETIME()` audit stamps (ADR-9, naive America/Lima wall clock —
 * asistencia precedent), ON DELETE CASCADE along the empresa-owned
 * graph (Empresas → Contactos → Correos and Empresas → pipeline +
 * history tables).
 *
 * Fresh CREATE only — tables are declared FK-target-first so the single
 * batch is order-safe. `IF NOT EXISTS` guards (sys.tables per table,
 * sys.indexes per index) make the migration idempotent; safe to run on
 * every first connection via `getCrmDb()`. Later slices append guarded
 * blocks for the assignment (pr14) tables.
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
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CRM_Pipeline' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.CRM_Pipeline (
    id               INT            IDENTITY(1,1) NOT NULL PRIMARY KEY,
    empresaId        INT            NOT NULL CONSTRAINT UQ_CRM_Pipeline_Empresa UNIQUE,
    flujo            VARCHAR(10)    NOT NULL CONSTRAINT CK_CRM_Pipeline_Flujo CHECK (flujo IN ('INBOUND','OUTBOUND')),
    etapa            VARCHAR(20)    NOT NULL CONSTRAINT CK_CRM_Pipeline_Etapa CHECK (etapa IN ('REGISTRADO','SEGUIMIENTO','PRESENTACION','CONFIRMADA','ENTREGADA','NUEVO','CADENCIA','ACEPTADO','DATOS','DESCANSO','RECHAZADO')),
    ciclo            INT            NOT NULL DEFAULT 1,
    enviosCiclo      INT            NOT NULL DEFAULT 0,
    fechaCicloInicio DATE           NULL,
    fechaUltimoEnvio DATE           NULL,
    descansoHasta    DATE           NULL,
    rechazadoHasta   DATE           NULL,
    motivoRechazo    NVARCHAR(300)  NULL,
    updatedBy        NVARCHAR(200)  NULL,
    updatedAt        DATETIME2(0)   NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_CRM_Pipeline_Empresa FOREIGN KEY (empresaId) REFERENCES dbo.CRM_Empresas (id) ON DELETE CASCADE
  );
END;
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CRM_Transiciones' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.CRM_Transiciones (
    id          BIGINT         IDENTITY(1,1) NOT NULL PRIMARY KEY,
    empresaId   INT            NOT NULL,
    flujoPrevio VARCHAR(10)    NULL,
    etapaPrevia VARCHAR(20)    NULL,
    flujoNuevo  VARCHAR(10)    NOT NULL,
    etapaNueva  VARCHAR(20)    NOT NULL,
    evento      VARCHAR(40)    NOT NULL,
    motivo      NVARCHAR(300)  NULL,
    usuario     NVARCHAR(200)  NOT NULL,
    createdAt   DATETIME2(0)   NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_CRM_Transiciones_Empresa FOREIGN KEY (empresaId) REFERENCES dbo.CRM_Empresas (id) ON DELETE CASCADE
  );
END;
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CRM_Resultados' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.CRM_Resultados (
    id          BIGINT         IDENTITY(1,1) NOT NULL PRIMARY KEY,
    empresaId   INT            NOT NULL,
    tipo        VARCHAR(40)    NOT NULL CONSTRAINT CK_CRM_Resultados_Tipo CHECK (tipo IN ('CotizaciónEnviada','PresentaciónEnviada','AceptaciónOutbound','ConfirmaciónPresentación','HandoffRegistrado','ConversiónProspectoACliente')),
    usuario     NVARCHAR(200)  NOT NULL,
    fecha       DATE           NOT NULL,
    detalleJson NVARCHAR(MAX)  NULL,
    CONSTRAINT FK_CRM_Resultados_Empresa FOREIGN KEY (empresaId) REFERENCES dbo.CRM_Empresas (id) ON DELETE CASCADE
  );
END;
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CRM_Handoffs' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.CRM_Handoffs (
    id        BIGINT         IDENTITY(1,1) NOT NULL PRIMARY KEY,
    empresaId INT            NOT NULL,
    area      NVARCHAR(100)  NOT NULL,
    nota      NVARCHAR(MAX)  NULL,
    usuario   NVARCHAR(200)  NOT NULL,
    createdAt DATETIME2(0)   NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_CRM_Handoffs_Empresa FOREIGN KEY (empresaId) REFERENCES dbo.CRM_Empresas (id) ON DELETE CASCADE
  );
END;
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CRM_Actividades' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.CRM_Actividades (
    id         BIGINT         IDENTITY(1,1) NOT NULL PRIMARY KEY,
    empresaId  INT            NOT NULL,
    contactoId INT            NULL,
    tipo       VARCHAR(20)    NOT NULL CONSTRAINT CK_CRM_Actividades_Tipo CHECK (tipo IN ('LLAMADA','CORREO','REUNION','NOTA','ENVIO_CADENCIA','OTRO')),
    asunto     NVARCHAR(300)  NOT NULL,
    detalle    NVARCHAR(MAX)  NULL,
    usuario    NVARCHAR(200)  NOT NULL,
    fecha      DATE           NOT NULL,
    createdAt  DATETIME2(0)   NOT NULL DEFAULT SYSDATETIME(),
    -- NO ACTION on the contacto FK: SQL Server forbids two cascade
    -- paths (Actividades→Empresas AND Actividades→Contactos→Empresas).
    -- The empresa cascade already removes the activities; this FK is
    -- integrity-only (contactos are never deleted on their own in v1).
    CONSTRAINT FK_CRM_Actividades_Empresa FOREIGN KEY (empresaId) REFERENCES dbo.CRM_Empresas (id) ON DELETE CASCADE,
    CONSTRAINT FK_CRM_Actividades_Contacto FOREIGN KEY (contactoId) REFERENCES dbo.CRM_Contactos (id) ON DELETE NO ACTION
  );
END;
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CRM_Asignaciones' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.CRM_Asignaciones (
    id                BIGINT         IDENTITY(1,1) NOT NULL PRIMARY KEY,
    empresaId         INT            NOT NULL,
    accion            VARCHAR(12)    NOT NULL CONSTRAINT CK_CRM_Asignaciones_Accion CHECK (accion IN ('ASIGNADO','REASIGNADO','DEVUELTO')),
    responsablePrevio NVARCHAR(200)  NULL,
    responsableNuevo  NVARCHAR(200)  NULL,
    actorUsuario      NVARCHAR(200)  NOT NULL,
    createdAt         DATETIME2(0)   NOT NULL DEFAULT SYSDATETIME(),
    -- Single FK to CRM_Empresas → CASCADE is safe here (pr13 rule:
    -- only a SECOND FK reaching the empresa graph would forbid it).
    CONSTRAINT FK_CRM_Asignaciones_Empresa FOREIGN KEY (empresaId) REFERENCES dbo.CRM_Empresas (id) ON DELETE CASCADE
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
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CRM_Pipeline_Etapa' AND object_id = OBJECT_ID('dbo.CRM_Pipeline'))
BEGIN
  -- Covering queue index (design §2): the daily cadence scan reads the
  -- denormalized counters straight from the index.
  CREATE INDEX IX_CRM_Pipeline_Etapa
    ON dbo.CRM_Pipeline (etapa)
    INCLUDE (empresaId, flujo, enviosCiclo, ciclo, fechaUltimoEnvio, descansoHasta, rechazadoHasta);
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CRM_Transiciones_EmpresaFecha' AND object_id = OBJECT_ID('dbo.CRM_Transiciones'))
BEGIN
  CREATE INDEX IX_CRM_Transiciones_EmpresaFecha
    ON dbo.CRM_Transiciones (empresaId, createdAt DESC);
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CRM_Transiciones_UsuarioFecha' AND object_id = OBJECT_ID('dbo.CRM_Transiciones'))
BEGIN
  CREATE INDEX IX_CRM_Transiciones_UsuarioFecha
    ON dbo.CRM_Transiciones (usuario, createdAt DESC);
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CRM_Resultados_UsuarioFecha' AND object_id = OBJECT_ID('dbo.CRM_Resultados'))
BEGIN
  CREATE INDEX IX_CRM_Resultados_UsuarioFecha
    ON dbo.CRM_Resultados (usuario, fecha DESC);
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CRM_Resultados_EmpresaFecha' AND object_id = OBJECT_ID('dbo.CRM_Resultados'))
BEGIN
  CREATE INDEX IX_CRM_Resultados_EmpresaFecha
    ON dbo.CRM_Resultados (empresaId, fecha DESC);
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CRM_Handoffs_EmpresaFecha' AND object_id = OBJECT_ID('dbo.CRM_Handoffs'))
BEGIN
  CREATE INDEX IX_CRM_Handoffs_EmpresaFecha
    ON dbo.CRM_Handoffs (empresaId, createdAt DESC);
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CRM_Actividades_EmpresaFecha' AND object_id = OBJECT_ID('dbo.CRM_Actividades'))
BEGIN
  -- Activity log reads (empresa timeline) + the pr16 productivity
  -- aggregation both scan this covering index.
  CREATE INDEX IX_CRM_Actividades_EmpresaFecha
    ON dbo.CRM_Actividades (empresaId, fecha DESC)
    INCLUDE (tipo, asunto, usuario);
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CRM_Actividades_UsuarioFecha' AND object_id = OBJECT_ID('dbo.CRM_Actividades'))
BEGIN
  CREATE INDEX IX_CRM_Actividades_UsuarioFecha
    ON dbo.CRM_Actividades (usuario, fecha DESC);
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CRM_Asignaciones_EmpresaFecha' AND object_id = OBJECT_ID('dbo.CRM_Asignaciones'))
BEGIN
  -- Assignment history reads (spec G5: every event visible per
  -- empresa, newest first with actor + timestamp).
  CREATE INDEX IX_CRM_Asignaciones_EmpresaFecha
    ON dbo.CRM_Asignaciones (empresaId, createdAt DESC);
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

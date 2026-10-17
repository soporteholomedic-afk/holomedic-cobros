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
 * - `CRM_EnviosCorreos` (rediseno-crm-panel, design D3) — the per-email
 *   dispatch log: template key, recipient, messageId, ENVIADO/FALLIDO
 *   outcome and error info. Deliberately separate from the
 *   operator-facing `CRM_Actividades` history (different concern, own
 *   5-key plantilla catalog). Empresa FK CASCADE; contacto FK is
 *   integrity-only (NO ACTION — the two-cascade-paths rule).
 * - `CRM_Conversaciones` (agente-ia-crm E1) — one row per channel
 *   thread: canal-scoped remote identity (`identificadorCanal`, e.g.
 *   Kapso from_user_id) OR the normalized E.164 `telefono` (the
 *   vinculación key), optionally linked to the registry
 *   (`empresaId`/`contactoId`, NULL until vinculada). Two filtered
 *   unique indexes keep one conversation per canal+key; the inbox
 *   scans (estado, ultimoMensajeEn DESC). Empresa FK SET NULL —
 *   conversations are channel data, they SURVIVE empresa deletion;
 *   contacto FK is integrity-only (NO ACTION — see the inline note).
 * - `CRM_Mensajes` (agente-ia-crm E1) — the auditable thread item
 *   (direccion IN/OUT, emisor CLIENTE/IA/HUMANO). `idempotenciaKey`
 *   backs the webhook X-Idempotency-Key dedup via a filtered unique
 *   index; `fuentes`/`score`/`modelo` are the E2 RAG audit columns,
 *   nullable from day one so E2 adds no DDL. BIGINT id (high-volume
 *   history, Transiciones precedent).
 * - `CRM_Conocimiento` (agente-ia-crm E2·T1) — the curated knowledge
 *   base la Guía answers from: titulo/contenido (NVARCHAR(MAX)),
 *   comma-separated `etiquetas`, an inclusive `vigenciaDesde`/
 *   `vigenciaHasta` window (NULL = unbounded) and a soft `activo`
 *   switch the RAG prefilter respects. Deliberately FK-free — the KB
 *   is GLOBAL (not empresa-owned); the E5 editor owns its CRUD.
 *   `creadoEn` stamps SYSUTCDATETIME() (unlike the SYSDATETIME()
 *   registry precedent): the E2 ranking compares vigencia against an
 *   injected UTC `ahora`, so storage and comparison share one clock.
 * - `CRM_AgenteTareas` (agente-ia-crm E2·T5) — the durable agent
 *   queue that decouples the webhook ack from the slow LLM work: one
 *   row per pending GENERAR_RESPUESTA job, UNIQUE (conversacionId,
 *   mensajeId, tipo) so task creation is idempotent, `intentos` +
 *   `error` for the 3-attempt failure policy, and UTC claim stamps
 *   (`reclamadaEn` doubles as the 60 s requeue-cooling timestamp;
 *   `procesadaEn` marks COMPLETADA/FALLIDA). Single FK to
 *   CRM_Conversaciones with CASCADE — deleting a conversation drops
 *   its tasks (mirror of CRM_Mensajes); `mensajeId` (BIGINT, matching
 *   CRM_Mensajes.id) carries NO FK on purpose: a second path into the
 *   conversation's cascade graph would hit the two-cascade-paths
 *   rule (error 1785) and its integrity already flows through the
 *   conversation FK.
 *
 * Normalization columns (rediseno-crm-panel, design D6): additive and
 * nullable, carried by the CREATE blocks for fresh installs and added
 * by their own `sys.columns` gates for pre-existing databases (auth
 * `correo` precedent): `CRM_Empresas.sector` NVARCHAR(60),
 * `CRM_Empresas.cantidadTrabajadores` INT, `CRM_Contactos.cargo`
 * NVARCHAR(120). Existing rows keep NULL — no backfill here; the
 * one-off logged normalization script owns that.
 *
 * `CRM_Contactos.telefonoNormalizado` (agente-ia-crm E2·T8, E1
 * advisory R3-scan-tabla-complea): VARCHAR(30) NULL E.164 key derived
 * from the free-text `telefono` by the domain normalizer
 * (normalizarTelefonoE164) on every write, plus the NON-unique
 * filtered index `IX_CRM_Contactos_TelefonoNormalizado` —
 * `buscarCandidatosVinculacion` seeks it exactly instead of scanning
 * the free-text column. Deliberately NOT UNIQUE: two contactos may
 * legitimately share a phone and BOTH surface as candidatos (same
 * semantics as the old free-text scan). History is backfilled by the
 * one-off logged script scripts/crm-normalizar-telefonos.mjs; rows
 * still NULL keep matching through the repository's free-text
 * fallback.
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
    sector          NVARCHAR(60)   NULL,
    cantidadTrabajadores INT       NULL,
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
    -- E2·T8: E.164 derived from telefono on every write (domain
    -- normalizarTelefonoE164); NULL = not yet normalized or not
    -- normalizable. Index-seek key for buscarCandidatosVinculacion.
    telefonoNormalizado VARCHAR(30) NULL,
    cargo             NVARCHAR(120) NULL,
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
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CRM_EnviosCorreos' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.CRM_EnviosCorreos (
    id           BIGINT         IDENTITY(1,1) NOT NULL PRIMARY KEY,
    empresaId    INT            NOT NULL CONSTRAINT FK_CRM_EnviosCorreos_Empresa REFERENCES dbo.CRM_Empresas (id) ON DELETE CASCADE,
    -- NO ACTION on the contacto FK (Actividades precedent: SQL Server
    -- forbids two cascade paths to the empresa graph; the empresa
    -- cascade already removes the dispatch rows).
    contactoId   INT            NULL CONSTRAINT FK_CRM_EnviosCorreos_Contacto REFERENCES dbo.CRM_Contactos (id) ON DELETE NO ACTION,
    plantilla    VARCHAR(40)    NOT NULL CONSTRAINT CK_CRM_EnviosCorreos_Plantilla CHECK (plantilla IN ('carta_presentacion','seguimiento_1','seguimiento_2','seguimiento_3','reactivacion_3m')),
    destinatario VARCHAR(320)   NOT NULL,
    messageId    NVARCHAR(200)  NULL,
    estado       VARCHAR(10)    NOT NULL CONSTRAINT CK_CRM_EnviosCorreos_Estado CHECK (estado IN ('ENVIADO','FALLIDO')),
    errorInfo    NVARCHAR(500)  NULL,
    usuario      NVARCHAR(200)  NOT NULL,
    createdAt    DATETIME2(0)   NOT NULL DEFAULT SYSDATETIME()
  );
END;
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CRM_Conversaciones' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.CRM_Conversaciones (
    id                 INT            IDENTITY(1,1) NOT NULL PRIMARY KEY,
    -- SET NULL on empresa: the conversation survives the empresa's
    -- deletion (channel data, not empresa-owned data).
    empresaId          INT            NULL CONSTRAINT FK_CRM_Conversaciones_Empresa REFERENCES dbo.CRM_Empresas (id) ON DELETE SET NULL,
    -- NO ACTION on the contacto FK (Actividades/EnviosCorreos
    -- precedent): SQL Server forbids two cascade paths — an empresa
    -- DELETE already reaches this table via the SET NULL above and
    -- again through Contactos (CASCADE), which raises error 1785 at
    -- CREATE time if this FK also carries a referential action.
    contactoId         INT            NULL CONSTRAINT FK_CRM_Conversaciones_Contacto REFERENCES dbo.CRM_Contactos (id) ON DELETE NO ACTION,
    canal              NVARCHAR(20)   NOT NULL DEFAULT 'WHATSAPP' CONSTRAINT CK_CRM_Conversaciones_Canal CHECK (canal IN ('WHATSAPP','EMAIL')),
    telefono           VARCHAR(20)    NULL,
    identificadorCanal VARCHAR(64)    NULL,
    estado             VARCHAR(24)    NOT NULL DEFAULT 'PENDIENTE_VINCULACION' CONSTRAINT CK_CRM_Conversaciones_Estado CHECK (estado IN ('ACTIVA_IA','REQUIERE_HUMANO','TOMADA_HUMANO','PAUSADA','PENDIENTE_VINCULACION','CERRADA')),
    asignadaA          NVARCHAR(200)  NULL,
    modo               NVARCHAR(10)   NOT NULL DEFAULT 'IA' CONSTRAINT CK_CRM_Conversaciones_Modo CHECK (modo IN ('IA','HUMANO')),
    ultimoMensajeEn    DATETIME2(0)   NULL,
    noLeidos           INT            NOT NULL DEFAULT 0,
    -- E3 (agente-ia-crm): per-conversation memory toggle — 1 (DEFAULT)
    -- = la Guía reads/writes the Engram memory for this thread, 0 =
    -- privacy opt-out (the distiller skips the conversation).
    memoriaActiva      BIT            NOT NULL DEFAULT 1,
    creadoEn           DATETIME2(0)   NOT NULL DEFAULT SYSDATETIME(),
    actualizadoEn      DATETIME2(0)   NOT NULL DEFAULT SYSDATETIME()
  );
END;
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CRM_Mensajes' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.CRM_Mensajes (
    id              BIGINT          IDENTITY(1,1) NOT NULL PRIMARY KEY,
    conversacionId  INT             NOT NULL CONSTRAINT FK_CRM_Mensajes_Conversacion REFERENCES dbo.CRM_Conversaciones (id) ON DELETE CASCADE,
    direccion       VARCHAR(3)      NOT NULL CONSTRAINT CK_CRM_Mensajes_Direccion CHECK (direccion IN ('IN','OUT')),
    emisor          VARCHAR(10)     NOT NULL CONSTRAINT CK_CRM_Mensajes_Emisor CHECK (emisor IN ('CLIENTE','IA','HUMANO')),
    cuerpo          NVARCHAR(4000)  NOT NULL,
    tipo            NVARCHAR(12)    NOT NULL DEFAULT 'TEXTO' CONSTRAINT CK_CRM_Mensajes_Tipo CHECK (tipo IN ('TEXTO','MEDIA','PLANTILLA')),
    canal           NVARCHAR(20)    NOT NULL DEFAULT 'WHATSAPP',
    wamid           VARCHAR(128)    NULL,
    idempotenciaKey VARCHAR(128)    NULL,
    estadoEnvio     VARCHAR(10)     NULL CONSTRAINT CK_CRM_Mensajes_EstadoEnvio CHECK (estadoEnvio IN ('PENDIENTE','ENVIADO','FALLIDO')),
    fuentes         NVARCHAR(MAX)   NULL,
    score           DECIMAL(4,3)    NULL,
    -- E4 (agente-ia-crm): fidelidad autoevaluada del modelo a sus
    -- fuentes (0..1), si el modelo la reportó. Nullable like
    -- score/modelo: NULL on non-IA rows and on the no-generation
    -- escalations (and on older models that never sent it).
    fidelidad       DECIMAL(4,3)    NULL,
    -- E4 (agente-ia-crm): la respuesta fue marcada deficiente por un
    -- operador (marcarRespuestaDeficiente). DEFAULT 0: históricas no
    -- deficientes; solo la use case escribe 1 (nunca se desmarca).
    deficiente      BIT             NOT NULL DEFAULT 0,
    modelo          NVARCHAR(60)    NULL,
    -- E4 (agente-ia-crm): prompt audit — which prompt version produced
    -- this IA message ('v2' today; application/prompt/promptGeneracion).
    -- Nullable like score/modelo: NULL on non-IA rows and on the
    -- no-generation escalations.
    promptVersion   NVARCHAR(20)    NULL,
    creadoEn        DATETIME2(0)    NOT NULL DEFAULT SYSDATETIME()
  );
END;
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CRM_Conocimiento' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.CRM_Conocimiento (
    id              INT            IDENTITY(1,1) NOT NULL PRIMARY KEY,
    titulo          NVARCHAR(200)  NOT NULL,
    contenido       NVARCHAR(MAX)  NOT NULL,
    -- Comma-separated topic tags (CSV; '' = untagged). No unique
    -- constraint on titulo: idempotency belongs to the seed script's
    -- WHERE NOT EXISTS, not to the schema (E5 editor may want
    -- near-duplicate drafts while curating).
    etiquetas       NVARCHAR(300)  NOT NULL DEFAULT '',
    -- Inclusive validity window (NULL = unbounded on that side);
    -- enforced in the application ranking, not as a CHECK — windows
    -- are business policy, not row integrity.
    vigenciaDesde   DATETIME2      NULL,
    vigenciaHasta   DATETIME2      NULL,
    -- E4 (agente-ia-crm): procedencia de la entrada — MANUAL (alta
    -- directa / editor E5 y seed antiguo), SEMILLA (script de siembra),
    -- SUBIDO (archivos de la ingesta E4·T7). NOT NULL con DEFAULT
    -- nombrado: las filas históricas nacen MANUAL (deficiente
    -- precedent); el CHECK viaja inline para que la columna nunca
    -- exista sin él (backstop en POSTALTER para estados fuera de banda).
    origen          NVARCHAR(20)   NOT NULL CONSTRAINT DF_CRM_Conocimiento_Origen DEFAULT 'MANUAL' CONSTRAINT CK_CRM_Conocimiento_Origen CHECK (origen IN ('MANUAL','SEMILLA','SUBIDO')),
    activo          BIT            NOT NULL DEFAULT 1,
    -- UTC stamps (E2 ranking clock); actualizadoEn starts NULL and
    -- only the E5 editor writes it (read-only table until then).
    creadoEn        DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    actualizadoEn   DATETIME2      NULL
  );
END;
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CRM_IngestasConocimiento' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.CRM_IngestasConocimiento (
    -- E4·T7 (agente-ia-crm): una ingesta de conocimiento — un documento
    -- o texto pegado que el operador sube y el procesador de la cola
    -- trocea en entradas de CRM_Conocimiento. Sin FK: es una fila de
    -- trabajo autónoma (CRM_AgenteTareas.mensajeId precedent).
    id              BIGINT         IDENTITY(1,1) NOT NULL PRIMARY KEY,
    -- Nombre visible del documento (archivo o título del pegado).
    nombre          NVARCHAR(260)  NOT NULL,
    -- Catálogo cerrado: pegado de texto o archivo subido. El crudo ya
    -- viene EXTRAÍDO a texto (la ruta de subida T8 usa
    -- infrastructure/extraccion/extraerTextoArchivo en el upload) —
    -- tipo describe la procedencia, no el formato de contenidoCrudo.
    tipo            NVARCHAR(10)   NOT NULL CONSTRAINT CK_CRM_IngestasConocimiento_Tipo CHECK (tipo IN ('TEXTO','PDF','TXT','DOCX')),
    tamanoBytes     INT            NOT NULL,
    -- Texto crudo ya extraído (NULL solo si una fila futura cambia el
    -- contrato; el procesador la trata como vacía → COMPLETADA(0)).
    contenidoCrudo  NVARCHAR(MAX)  NULL,
    estado          NVARCHAR(12)   NOT NULL CONSTRAINT DF_CRM_IngestasConocimiento_Estado DEFAULT 'PENDIENTE' CONSTRAINT CK_CRM_IngestasConocimiento_Estado CHECK (estado IN ('PENDIENTE','PROCESANDO','COMPLETADA','FALLIDA')),
    error           NVARCHAR(MAX)  NULL,
    entradasCreadas INT            NOT NULL DEFAULT 0,
    creadoPor       NVARCHAR(60)   NULL,
    -- UTC stamps (Conocimiento precedent).
    creadoEn        DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    procesadoEn     DATETIME2      NULL,
    -- Vigencia heredable: el procesador la copia a cada entrada creada.
    vigenciaDesde   DATETIME2      NULL,
    vigenciaHasta   DATETIME2      NULL
  );
END;
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CRM_AgenteTareas' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.CRM_AgenteTareas (
    id              BIGINT         IDENTITY(1,1) NOT NULL PRIMARY KEY,
    -- CASCADE mirrors CRM_Mensajes: deleting the conversation drops
    -- its tasks. NULLable desde E4·T7: las tareas INGESTAR_CONOCIMIENTO
    -- no tienen conversación — conversacionId NULL (la FK no aplica) y
    -- el id de la ingesta viaja en mensajeId; el dedup UNIQUE considera
    -- los NULL iguales, así que (NULL, ingestaId, tipo) sigue siendo
    -- idempotente. Single FK — no second path into the graph (see the
    -- header note on mensajeId).
    conversacionId  INT            NULL CONSTRAINT FK_CRM_AgenteTareas_Conversacion REFERENCES dbo.CRM_Conversaciones (id) ON DELETE CASCADE,
    -- BIGINT: matches CRM_Mensajes.id (high-volume history,
    -- Transiciones precedent). No FK — header note.
    mensajeId       BIGINT         NOT NULL,
    tipo            VARCHAR(30)    NOT NULL CONSTRAINT CK_CRM_AgenteTareas_Tipo CHECK (tipo IN ('GENERAR_RESPUESTA','RESPONDER_CON_INDICACION')),
    estado          VARCHAR(20)    NOT NULL CONSTRAINT DF_CRM_AgenteTareas_Estado DEFAULT 'PENDIENTE' CONSTRAINT CK_CRM_AgenteTareas_Estado CHECK (estado IN ('PENDIENTE','PROCESANDO','COMPLETADA','FALLIDA')),
    intentos        INT            NOT NULL DEFAULT 0,
    error           NVARCHAR(MAX)  NULL,
    -- UTC stamps (E2·T5 claim/cooling clock — Conocimiento
    -- precedent): the claim compares reclamadaEn against
    -- SYSUTCDATETIME() in the same statement that sets it.
    creadoEn        DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    reclamadaEn     DATETIME2      NULL,
    procesadaEn     DATETIME2      NULL,
    -- Idempotent creation: one task per (conversacion, mensaje,
    -- tipo) — a replayed webhook delivery never double-enqueues.
    CONSTRAINT UQ_CRM_AgenteTareas_ConversacionMensajeTipo UNIQUE (conversacionId, mensajeId, tipo)
  );
END;
-- E4·T7 (agente-ia-crm): conversacionId pasa a NULLable en bases que
-- ya traen la tabla (el CREATE de arriba ya nace NULLable en frescas;
-- el guard corre UNA vez). T-SQL exige soltar primero el índice, la UQ
-- y la FK que tocan la columna; todos se re-crean con sus nombres
-- canónicos y la misma semántica (CASCADE + triple dedup).
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CRM_AgenteTareas') AND name = 'conversacionId' AND is_nullable = 0)
BEGIN
  IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CRM_AgenteTareas_Estado' AND object_id = OBJECT_ID('dbo.CRM_AgenteTareas'))
    DROP INDEX IX_CRM_AgenteTareas_Estado ON dbo.CRM_AgenteTareas;
  IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UQ_CRM_AgenteTareas_ConversacionMensajeTipo' AND parent_object_id = OBJECT_ID('dbo.CRM_AgenteTareas'))
    ALTER TABLE dbo.CRM_AgenteTareas DROP CONSTRAINT UQ_CRM_AgenteTareas_ConversacionMensajeTipo;
  IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_CRM_AgenteTareas_Conversacion' AND parent_object_id = OBJECT_ID('dbo.CRM_AgenteTareas'))
    ALTER TABLE dbo.CRM_AgenteTareas DROP CONSTRAINT FK_CRM_AgenteTareas_Conversacion;
  ALTER TABLE dbo.CRM_AgenteTareas ALTER COLUMN conversacionId INT NULL;
  ALTER TABLE dbo.CRM_AgenteTareas ADD CONSTRAINT FK_CRM_AgenteTareas_Conversacion
    FOREIGN KEY (conversacionId) REFERENCES dbo.CRM_Conversaciones (id) ON DELETE CASCADE;
  ALTER TABLE dbo.CRM_AgenteTareas ADD CONSTRAINT UQ_CRM_AgenteTareas_ConversacionMensajeTipo
    UNIQUE (conversacionId, mensajeId, tipo);
END;
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CRM_SolicitudesAyuda' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.CRM_SolicitudesAyuda (
    id               BIGINT         IDENTITY(1,1) NOT NULL PRIMARY KEY,
    -- CASCADE mirrors CRM_Mensajes/CRM_AgenteTareas: deleting the
    -- conversation drops its help requests. A hueco referencing a
    -- solicitud SURVIVES it (SET NULL on CRM_ConocimientoHuecos.
    -- origenSolicitudId — the curation candidate outlives the chat).
    -- INT: SQL Server error 1778 requires the FK column to match the
    -- referenced column's type EXACTLY (CRM_Mensajes.conversacionId
    -- precedent) — only the PK-side BIGINT tables (mensajes, this
    -- table) take BIGINT keys.
    conversacionId   INT            NOT NULL CONSTRAINT FK_CRM_SolicitudesAyuda_Conversacion REFERENCES dbo.CRM_Conversaciones (id) ON DELETE CASCADE,
    -- BIGINT: matches CRM_Mensajes.id (high-volume history). NO FK —
    -- CRM_AgenteTareas.mensajeId precedent (header note there).
    mensajeId        BIGINT         NULL,
    consulta         NVARCHAR(2000) NOT NULL,
    -- JSON array of strings (terminosBuscados) — adapter (de)serializes.
    terminosBuscados NVARCHAR(MAX)  NULL,
    score            FLOAT          NULL,
    estado           NVARCHAR(20)   NOT NULL DEFAULT 'PENDIENTE' CONSTRAINT CK_CRM_SolicitudesAyuda_Estado CHECK (estado IN ('PENDIENTE','RESUELTA')),
    indicacion       NVARCHAR(2000) NULL,
    resueltaPor      NVARCHAR(100)  NULL,
    creadoEn         DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    resueltaEn       DATETIME2      NULL
  );
END;
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CRM_ConocimientoHuecos' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.CRM_ConocimientoHuecos (
    id                BIGINT         IDENTITY(1,1) NOT NULL PRIMARY KEY,
    consulta          NVARCHAR(2000) NOT NULL,
    -- JSON array of strings (terminos) — adapter (de)serializes.
    terminos          NVARCHAR(MAX)  NULL,
    estado            NVARCHAR(20)   NOT NULL DEFAULT 'ABIERTO' CONSTRAINT CK_CRM_ConocimientoHuecos_Estado CHECK (estado IN ('ABIERTO','CURADO','DESCARTADO')),
    -- SET NULL (Conversaciones.empresaId precedent): deleting the
    -- solicitud (via the conversation CASCADE above) drops only the
    -- provenance — the KB-gap candidate survives for curation (E5).
    origenSolicitudId BIGINT         NULL CONSTRAINT FK_CRM_ConocimientoHuecos_Solicitud REFERENCES dbo.CRM_SolicitudesAyuda (id) ON DELETE SET NULL,
    -- E4 (agente-ia-crm): la respuesta IA deficiente que dejó este
    -- hueco (marcarRespuestaDeficiente). BIGINT: matches
    -- CRM_Mensajes.id (high-volume history). Deliberadamente NO FK —
    -- los mensajes de este dominio NUNCA se borran (webhook append-
    -- only, CRM_AgenteTareas.mensajeId precedent), así la procedencia
    -- es permanente y no necesita regla ON DELETE.
    origenMensajeId   BIGINT         NULL,
    creadoEn          DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CRM_ExtraccionesFicha' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.CRM_ExtraccionesFicha (
    id            BIGINT         IDENTITY(1,1) NOT NULL PRIMARY KEY,
    -- NO ACTION on the contacto FK (Actividades/EnviosCorreos
    -- precedent): SQL Server forbids two cascade paths into the
    -- empresa graph — the empresa CASCADE below already removes the
    -- extraction rows when the empresa goes. Both FK columns are INT:
    -- error 1778 demands an exact type match with the referenced
    -- CRM_Contactos/CRM_Empresas INT ids (Actividades precedent).
    contactoId    INT            NULL CONSTRAINT FK_CRM_ExtraccionesFicha_Contacto REFERENCES dbo.CRM_Contactos (id) ON DELETE NO ACTION,
    empresaId     INT            NULL CONSTRAINT FK_CRM_ExtraccionesFicha_Empresa REFERENCES dbo.CRM_Empresas (id) ON DELETE CASCADE,
    campo         NVARCHAR(50)   NOT NULL CONSTRAINT CK_CRM_ExtraccionesFicha_Campo CHECK (campo IN ('cargo','trabajadores','sedes')),
    valor         NVARCHAR(500)  NOT NULL,
    origen        NVARCHAR(10)   NOT NULL DEFAULT 'IA' CONSTRAINT CK_CRM_ExtraccionesFicha_Origen CHECK (origen IN ('IA','HUMANO')),
    confirmado    BIT            NOT NULL DEFAULT 0,
    actualizadoEn DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
    -- NO unique constraint on (contactoId, empresaId, campo): the
    -- keys are NULLable and SQL Server unique indexes over NULL keys
    -- are unreliable — the dedup is app-level (SELECT then
    -- UPDATE/INSERT in the repository upsert).
  );
END;

-- Normalization columns (rediseno-crm-panel, design D6): gated,
-- additive, nullable — no-ops on fresh installs (the CREATE blocks
-- above already carry them) and on databases where a column was
-- applied out-of-band (sys.columns gate sees it and skips).
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CRM_Empresas') AND name = 'sector')
BEGIN
  ALTER TABLE dbo.CRM_Empresas ADD sector NVARCHAR(60) NULL;
END;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CRM_Empresas') AND name = 'cantidadTrabajadores')
BEGIN
  ALTER TABLE dbo.CRM_Empresas ADD cantidadTrabajadores INT NULL;
END;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CRM_Contactos') AND name = 'cargo')
BEGIN
  ALTER TABLE dbo.CRM_Contactos ADD cargo NVARCHAR(120) NULL;
END;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CRM_Contactos') AND name = 'telefonoNormalizado')
BEGIN
  ALTER TABLE dbo.CRM_Contactos ADD telefonoNormalizado VARCHAR(30) NULL;
END;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CRM_Conversaciones') AND name = 'memoriaActiva')
BEGIN
  -- E3 (agente-ia-crm): per-conversation memory toggle — BIT NOT NULL
  -- DEFAULT 1 (ON by default; the operator can opt the conversation
  -- out of the Engram memory). Guarded column add (telefonoNormalizado
  -- precedent): no-op on fresh installs (the CREATE above carries it).
  ALTER TABLE dbo.CRM_Conversaciones ADD memoriaActiva BIT NOT NULL DEFAULT 1;
END;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CRM_Mensajes') AND name = 'promptVersion')
BEGIN
  -- E4 (agente-ia-crm): prompt audit column — which prompt version
  -- produced this IA message ('v2' today; score/modelo presence
  -- pattern: NULL when no generation happened). Guarded column add
  -- (memoriaActiva precedent): no-op on fresh installs (the CREATE
  -- above carries it).
  ALTER TABLE dbo.CRM_Mensajes ADD promptVersion NVARCHAR(20) NULL;
END;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CRM_Mensajes') AND name = 'fidelidad')
BEGIN
  -- E4 (agente-ia-crm): fidelidad autoevaluada del modelo (0..1) —
  -- DECIMAL(4,3) igual que score. Guarded column add (promptVersion
  -- precedent): no-op on fresh installs (the CREATE above carries it).
  ALTER TABLE dbo.CRM_Mensajes ADD fidelidad DECIMAL(4,3) NULL;
END;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CRM_Mensajes') AND name = 'deficiente')
BEGIN
  -- E4 (agente-ia-crm): marca de respuesta deficiente del operador.
  -- NOT NULL DEFAULT 0 (memoriaActiva precedent): las filas históricas
  -- nacen no deficientes y solo marcarRespuestaDeficiente escribe 1.
  ALTER TABLE dbo.CRM_Mensajes ADD deficiente BIT NOT NULL DEFAULT 0;
END;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CRM_ConocimientoHuecos') AND name = 'origenMensajeId')
BEGIN
  -- E4 (agente-ia-crm): procedencia del hueco — la respuesta IA
  -- deficiente que lo dejó. Sin FK a propósito (ver el comentario en
  -- el CREATE): los mensajes nunca se borran en este dominio.
  ALTER TABLE dbo.CRM_ConocimientoHuecos ADD origenMensajeId BIGINT NULL;
END;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CRM_Conocimiento') AND name = 'origen')
BEGIN
  -- E4·T7 (agente-ia-crm): procedencia de la entrada de conocimiento —
  -- MANUAL (historícas + editor E5), SEMILLA (script de siembra),
  -- SUBIDO (ingesta de archivos). NOT NULL con DEFAULT: las filas
  -- históricas nacen MANUAL (deficiente precedent). DF + CHECK con
  -- nombre viajan inline (memoriaActiva precedent); los backstops del
  -- POSTALTER batch cubren bases con la columna ya aplicada fuera de
  -- banda sin las restricciones.
  ALTER TABLE dbo.CRM_Conocimiento ADD origen NVARCHAR(20) NOT NULL
    CONSTRAINT DF_CRM_Conocimiento_Origen DEFAULT 'MANUAL'
    CONSTRAINT CK_CRM_Conocimiento_Origen CHECK (origen IN ('MANUAL','SEMILLA','SUBIDO'));
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
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CRM_EnviosCorreos_EmpresaFecha' AND object_id = OBJECT_ID('dbo.CRM_EnviosCorreos'))
BEGIN
  -- Send-log reads (design D3/D4): the ficha timeline and the panel's
  -- "first correo" lookup scan per-empresa dispatches, newest first.
  CREATE INDEX IX_CRM_EnviosCorreos_EmpresaFecha
    ON dbo.CRM_EnviosCorreos (empresaId, createdAt DESC);
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_CRM_Conversaciones_CanalIdentificador' AND object_id = OBJECT_ID('dbo.CRM_Conversaciones'))
BEGIN
  -- Inbound routing by canal-scoped remote id (E1: one thread per
  -- Kapso from_user_id); filtered so legacy NULL rows never collide.
  CREATE UNIQUE INDEX UX_CRM_Conversaciones_CanalIdentificador
    ON dbo.CRM_Conversaciones (canal, identificadorCanal)
    WHERE identificadorCanal IS NOT NULL;
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_CRM_Conversaciones_CanalTelefono' AND object_id = OBJECT_ID('dbo.CRM_Conversaciones'))
BEGIN
  -- Inbound routing by E.164 (the vinculación key): one thread per
  -- canal+telefono; filtered so NULL phones never collide.
  CREATE UNIQUE INDEX UX_CRM_Conversaciones_CanalTelefono
    ON dbo.CRM_Conversaciones (canal, telefono)
    WHERE telefono IS NOT NULL;
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CRM_Conversaciones_EstadoUltimo' AND object_id = OBJECT_ID('dbo.CRM_Conversaciones'))
BEGIN
  -- Bandeja scan (E1): the inbox groups by estado and orders by the
  -- last message timestamp, newest first.
  CREATE INDEX IX_CRM_Conversaciones_EstadoUltimo
    ON dbo.CRM_Conversaciones (estado, ultimoMensajeEn DESC);
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_CRM_Mensajes_Idempotencia' AND object_id = OBJECT_ID('dbo.CRM_Mensajes'))
BEGIN
  -- Webhook dedup backstop (E1): the app checks
  -- existePorIdempotenciaKey BEFORE insert; this filtered unique
  -- index makes a racing duplicate impossible to persist.
  CREATE UNIQUE INDEX UX_CRM_Mensajes_Idempotencia
    ON dbo.CRM_Mensajes (idempotenciaKey)
    WHERE idempotenciaKey IS NOT NULL;
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CRM_Mensajes_ConversacionHilo' AND object_id = OBJECT_ID('dbo.CRM_Mensajes'))
BEGIN
  -- Thread read (E1): one page of one conversation, id DESC, with the
  -- antesDeId cursor walking backwards through the same index.
  CREATE INDEX IX_CRM_Mensajes_ConversacionHilo
    ON dbo.CRM_Mensajes (conversacionId, id DESC);
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CRM_Conocimiento_Activo' AND object_id = OBJECT_ID('dbo.CRM_Conocimiento'))
BEGIN
  -- KB reads (E2·T1): listarActivas and the RAG prefilter only ever
  -- scan activo = 1 rows — the E5 editor's inactive drafts never pay.
  CREATE INDEX IX_CRM_Conocimiento_Activo
    ON dbo.CRM_Conocimiento (activo);
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CRM_AgenteTareas_Estado' AND object_id = OBJECT_ID('dbo.CRM_AgenteTareas'))
BEGIN
  -- Sweeper scan (E2·T5): both claim queries filter on estado +
  -- reclamadaEn and order by id — covering so the claim never
  -- leaves the index on the filter side.
  CREATE INDEX IX_CRM_AgenteTareas_Estado
    ON dbo.CRM_AgenteTareas (estado)
    INCLUDE (reclamadaEn, conversacionId, mensajeId, tipo, intentos);
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CRM_SolicitudesAyuda_ConversacionEstado' AND object_id = OBJECT_ID('dbo.CRM_SolicitudesAyuda'))
BEGIN
  -- Help-pattern reads (E3): the bandeja resolves the conversation's
  -- PENDIENTE solicitud and the operator panel lists open requests.
  CREATE INDEX IX_CRM_SolicitudesAyuda_ConversacionEstado
    ON dbo.CRM_SolicitudesAyuda (conversacionId, estado);
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CRM_ExtraccionesFicha_Contacto' AND object_id = OBJECT_ID('dbo.CRM_ExtraccionesFicha'))
BEGIN
  -- Ficha reads (E3): the upsert dedup seek and
  -- listarExtraccionesFicha(contactoId, …) seek on the contacto key.
  CREATE INDEX IX_CRM_ExtraccionesFicha_Contacto
    ON dbo.CRM_ExtraccionesFicha (contactoId);
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CRM_ExtraccionesFicha_Empresa' AND object_id = OBJECT_ID('dbo.CRM_ExtraccionesFicha'))
BEGIN
  -- Ficha reads (E3): the upsert dedup seek and
  -- listarExtraccionesFicha(…, empresaId) seek on the empresa key.
  CREATE INDEX IX_CRM_ExtraccionesFicha_Empresa
    ON dbo.CRM_ExtraccionesFicha (empresaId);
END;
IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_CRM_AgenteTareas_Estado' AND parent_object_id = OBJECT_ID('dbo.CRM_AgenteTareas'))
BEGIN
  -- E2·T5 correction: the very first run of the guarded CREATE block
  -- shipped WITHOUT this default (crearSiNoExiste inserts only the
  -- triple) — databases that already carry the table get the named
  -- default added; fresh installs skip (the CREATE carries it inline).
  ALTER TABLE dbo.CRM_AgenteTareas ADD CONSTRAINT DF_CRM_AgenteTareas_Estado DEFAULT 'PENDIENTE' FOR estado;
END;
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_CRM_Mensajes_EstadoEnvio' AND parent_object_id = OBJECT_ID('dbo.CRM_Mensajes') AND definition NOT LIKE '%PENDIENTE%')
-- Outbox-lite (R4): widen once the old 2-value CHECK (needs PENDIENTE intent rows).
BEGIN
  ALTER TABLE dbo.CRM_Mensajes DROP CONSTRAINT CK_CRM_Mensajes_EstadoEnvio;
  ALTER TABLE dbo.CRM_Mensajes ADD CONSTRAINT CK_CRM_Mensajes_EstadoEnvio CHECK (estadoEnvio IN ('PENDIENTE','ENVIADO','FALLIDO'));
END;
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_CRM_AgenteTareas_Tipo' AND parent_object_id = OBJECT_ID('dbo.CRM_AgenteTareas') AND definition NOT LIKE '%RESPONDER_CON_INDICACION%')
-- Help pattern (E3): widen the E2 single-value CHECK — the domain
-- union TipoTareaAgente now carries RESPONDER_CON_INDICACION (the
-- motor re-reads the indicación from the resolved solicitud — no new
-- TareaAgente fields). CK_CRM_Mensajes_EstadoEnvio widening precedent.
BEGIN
  ALTER TABLE dbo.CRM_AgenteTareas DROP CONSTRAINT CK_CRM_AgenteTareas_Tipo;
  ALTER TABLE dbo.CRM_AgenteTareas ADD CONSTRAINT CK_CRM_AgenteTareas_Tipo CHECK (tipo IN ('GENERAR_RESPUESTA','RESPONDER_CON_INDICACION'));
END;
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_CRM_AgenteTareas_Tipo' AND parent_object_id = OBJECT_ID('dbo.CRM_AgenteTareas') AND definition NOT LIKE '%INGESTAR_CONOCIMIENTO%')
-- Ingesta de conocimiento (E4·T7): widen again — the queue now also
-- carries INGESTAR_CONOCIMIENTO (the ingesta id travels in mensajeId,
-- conversacionId NULL). Same widening pattern as E3.
BEGIN
  ALTER TABLE dbo.CRM_AgenteTareas DROP CONSTRAINT CK_CRM_AgenteTareas_Tipo;
  ALTER TABLE dbo.CRM_AgenteTareas ADD CONSTRAINT CK_CRM_AgenteTareas_Tipo CHECK (tipo IN ('GENERAR_RESPUESTA','RESPONDER_CON_INDICACION','INGESTAR_CONOCIMIENTO'));
END;
`;

/**
 * Post-ALTER batch (agente-ia-crm E2·T8): indexes over columns added
 * by guarded ALTERs in SCHEMA_SQL. SQL Server compiles a whole batch
 * against the PRE-batch schema, so a CREATE INDEX over a column ALTER
 * ADDed earlier in the same batch fails with "Invalid column name" on
 * databases where the table already exists (fresh installs dodge it
 * through deferred resolution — the CREATE TABLE and the index share
 * the first batch). A second batch gives the ALTER room to land first.
 */
const SCHEMA_SQL_POSTALTER = /* sql */ `
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CRM_Conocimiento') AND name = 'origen' AND default_object_id = 0)
BEGIN
  -- E4·T7 backstop: la columna origen existe pero SIN default (aplicada
  -- fuera de banda) — el named default llega aquí porque el segundo
  -- batch ya ve la columna (ver la nota de la función migrate).
  ALTER TABLE dbo.CRM_Conocimiento ADD CONSTRAINT DF_CRM_Conocimiento_Origen DEFAULT 'MANUAL' FOR origen;
END;
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_CRM_Conocimiento_Origen' AND parent_object_id = OBJECT_ID('dbo.CRM_Conocimiento'))
BEGIN
  -- E4·T7 backstop: mismo caso para el CHECK con nombre (el col-add
  -- inline ya lo crea en la vía normal; esto solo cubre fuera de banda).
  ALTER TABLE dbo.CRM_Conocimiento ADD CONSTRAINT CK_CRM_Conocimiento_Origen CHECK (origen IN ('MANUAL','SEMILLA','SUBIDO'));
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CRM_Contactos_TelefonoNormalizado' AND object_id = OBJECT_ID('dbo.CRM_Contactos'))
BEGIN
  -- Autovinculación seek (E2·T8): exact match on the normalized E.164
  -- replaces the free-text table scan (E1 advisory R3). Filtered so
  -- NULL (un-normalized) rows never enter; deliberately NOT unique —
  -- two contactos may share a phone and both stay candidatos.
  CREATE INDEX IX_CRM_Contactos_TelefonoNormalizado
    ON dbo.CRM_Contactos (telefonoNormalizado)
    WHERE telefonoNormalizado IS NOT NULL;
END;
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CRM_Config' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  -- E5·T2 (agente-ia-crm): platform key/value configuration the admin
  -- edits at runtime (agent guardrails, Kapso channel, memory). Secret
  -- rows (esSecreto = 1) hold an already-ENCRYPTED payload
  -- (cifradoSecretos, AES-256-GCM); encryption is the caller's job.
  CREATE TABLE dbo.CRM_Config (
    clave          NVARCHAR(100)  NOT NULL CONSTRAINT PK_CRM_Config PRIMARY KEY,
    valor          NVARCHAR(2000) NOT NULL,
    esSecreto      BIT            NOT NULL CONSTRAINT DF_CRM_Config_EsSecreto DEFAULT 0,
    actualizadoPor NVARCHAR(200)  NOT NULL,
    actualizadoEn  DATETIME2(0)   NOT NULL CONSTRAINT DF_CRM_Config_ActualizadoEn DEFAULT SYSDATETIME()
  );
END;
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CRM_ConfigAuditoria' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  -- E5·T2: append-only change trail. NO foreign key to CRM_Config on
  -- purpose — the trail must outlive a deleted key. valorAnterior /
  -- valorNuevo are NULL for secrets (the value is never recorded, only
  -- the fact of the change) and for the absent side of an insert/delete.
  CREATE TABLE dbo.CRM_ConfigAuditoria (
    id            BIGINT         IDENTITY(1,1) NOT NULL CONSTRAINT PK_CRM_ConfigAuditoria PRIMARY KEY,
    clave         NVARCHAR(100)  NOT NULL,
    usuario       NVARCHAR(200)  NOT NULL,
    valorAnterior NVARCHAR(2000) NULL,
    valorNuevo    NVARCHAR(2000) NULL,
    esSecreto     BIT            NOT NULL CONSTRAINT DF_CRM_ConfigAuditoria_EsSecreto DEFAULT 0,
    creadoEn      DATETIME2(3)   NOT NULL CONSTRAINT DF_CRM_ConfigAuditoria_CreadoEn DEFAULT SYSDATETIME()
  );
  CREATE INDEX IX_CRM_ConfigAuditoria_Clave ON dbo.CRM_ConfigAuditoria (clave, id DESC);
END;
`;

/**
 * Run the CRM registry schema migration against a SQL Server
 * `HOLOMEDIC` connection pool. Idempotent (`IF NOT EXISTS`); safe to
 * call on every first connection (the `getCrmDb()` factory calls it
 * once at startup).
 *
 * Two batches: the main SCHEMA_SQL plus the post-ALTER batch for
 * indexes over guarded-ALTER columns (see SCHEMA_SQL_POSTALTER). Each
 * `IF NOT EXISTS` guard is wrapped in `BEGIN … END` so the parser
 * accepts the DDL inside the conditional.
 */
export async function migrate(pool: mssql.ConnectionPool): Promise<void> {
  await pool.request().batch(SCHEMA_SQL);
  await pool.request().batch(SCHEMA_SQL_POSTALTER);
}

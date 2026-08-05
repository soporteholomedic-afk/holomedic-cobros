-- Migration: 001_add_entrevista_json_to_evaluacion_musculo
-- Target: HOLOMEDIC database (dbo schema)
-- Idempotent: only creates/alters when missing.
-- Depends on: jjc-mapper migration 003_normalize_jjc_evaluacion_3_tables.sql,
--   which creates dbo.Evaluacion and dbo.EvaluacionMusculoEsqueletica. If the
--   HOLOMEDIC database does not have them yet, this script creates them with
--   the same shape so it can also run standalone.
-- Run manually or via your migration runner against HOLOMEDIC.

BEGIN TRANSACTION;

-- 1. Generic base table (shared with medicina evaluations)
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE OBJECT_ID = OBJECT_ID(N'dbo.Evaluacion'))
BEGIN
    CREATE TABLE dbo.Evaluacion (
        idAtencion      VARCHAR(50)    NOT NULL,
        area            VARCHAR(50)    NOT NULL,
        fechaEvaluacion DATE           NOT NULL,
        lugar           VARCHAR(100)   NOT NULL DEFAULT 'HOLOMEDIC',
        observaciones   NVARCHAR(500)  NULL,
        createdBy       NVARCHAR(100)  NULL,
        createdAt       DATETIME       NOT NULL DEFAULT GETDATE(),
        updatedAt       DATETIME       NOT NULL DEFAULT GETDATE(),
        CONSTRAINT PK_Evaluacion PRIMARY KEY (idAtencion, area)
    );
END;

-- 2. Musculo-specific companion table (1:1 with Evaluacion)
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE OBJECT_ID = OBJECT_ID(N'dbo.EvaluacionMusculoEsqueletica'))
BEGIN
    CREATE TABLE dbo.EvaluacionMusculoEsqueletica (
        idAtencion      VARCHAR(50)    NOT NULL,
        area            VARCHAR(50)    NOT NULL,
        CONSTRAINT PK_EvaluacionMusculoEsqueletica PRIMARY KEY (idAtencion, area),
        CONSTRAINT FK_EvaluacionMusculoEsqueletica_Evaluacion
            FOREIGN KEY (idAtencion, area)
            REFERENCES dbo.Evaluacion (idAtencion, area)
    );
END;

-- 3. Column that stores the full osteomuscular interview (incl. the
--    "detalleIrradiacion" fields of CERVICAL / DORSAL / LUMBO SACRA) as JSON.
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE OBJECT_ID = OBJECT_ID(N'dbo.EvaluacionMusculoEsqueletica')
      AND name = 'entrevistaJson'
)
BEGIN
    ALTER TABLE dbo.EvaluacionMusculoEsqueletica
        ADD entrevistaJson NVARCHAR(MAX) NULL;
END;

COMMIT;

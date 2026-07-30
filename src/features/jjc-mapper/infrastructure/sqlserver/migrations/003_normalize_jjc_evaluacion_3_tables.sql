-- Migration: 003_normalize_jjc_evaluacion_3_tables
-- Splits dbo.JjcEvaluacion into 3 properly normalized tables:
--   1. dbo.Evaluacion                   (generic base — idAtencion, area, common fields)
--   2. dbo.EvaluacionMedicina           (medicina-specific — fototipo, lesiones, etc.)
--   3. dbo.EvaluacionMusculoEsqueletica (musculo-specific — placeholder, columns added later)
--
-- The PK on EvaluacionMedicina/EvaluacionMusculoEsqueletica has an FK back to Evaluacion
-- to enforce the 1:1 invariant (one area-specific row per (idAtencion, area)).

BEGIN TRANSACTION;

-- 1. Create Evaluacion (generic base)
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

-- 2. Create EvaluacionMedicina (medicina-specific columns)
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE OBJECT_ID = OBJECT_ID(N'dbo.EvaluacionMedicina'))
BEGIN
    CREATE TABLE dbo.EvaluacionMedicina (
        idAtencion      VARCHAR(50)    NOT NULL,
        area            VARCHAR(50)    NOT NULL,
        fototipo        VARCHAR(20)    NOT NULL,
        fotoprotector   VARCHAR(30)    NULL,
        lesionesJson    NVARCHAR(MAX)  NOT NULL DEFAULT '[]',
        preguntasJson   NVARCHAR(MAX)  NULL,
        CONSTRAINT PK_EvaluacionMedicina PRIMARY KEY (idAtencion, area),
        CONSTRAINT FK_EvaluacionMedicina_Evaluacion
            FOREIGN KEY (idAtencion, area)
            REFERENCES dbo.Evaluacion (idAtencion, area)
    );
END;

-- 3. Create EvaluacionMusculoEsqueletica (placeholder for future musculo fields)
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

-- 4. Migrate data from old JjcEvaluacion (if it still exists)
IF EXISTS (SELECT 1 FROM sys.tables WHERE OBJECT_ID = OBJECT_ID(N'dbo.JjcEvaluacion'))
   AND NOT EXISTS (SELECT 1 FROM dbo.Evaluacion)
BEGIN
    INSERT INTO dbo.Evaluacion (idAtencion, area, fechaEvaluacion, lugar, observaciones, createdBy, createdAt, updatedAt)
    SELECT idAtencion, area, fechaEvaluacion, lugar, observaciones, createdBy, createdAt, updatedAt
    FROM dbo.JjcEvaluacion;

    INSERT INTO dbo.EvaluacionMedicina (idAtencion, area, fototipo, fotoprotector, lesionesJson, preguntasJson)
    SELECT idAtencion, area, fototipo, fotoprotector, lesionesJson, preguntasJson
    FROM dbo.JjcEvaluacion;
END;

-- 5. Drop old JjcEvaluacion
IF EXISTS (SELECT 1 FROM sys.tables WHERE OBJECT_ID = OBJECT_ID(N'dbo.JjcEvaluacion'))
BEGIN
    DROP TABLE dbo.JjcEvaluacion;
END;

COMMIT;

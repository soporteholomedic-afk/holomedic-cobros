-- Migration: 001_create_jjc_evaluacion
-- Target: HOLOMEDIC database (dbo schema)
-- Idempotent: only creates the table if it doesn't exist.
-- Run manually or via your migration runner against HOLOMEDIC.

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE OBJECT_ID = OBJECT_ID(N'dbo.JjcEvaluacion'))
BEGIN
    CREATE TABLE dbo.JjcEvaluacion (
        idAtencion      VARCHAR(50)    NOT NULL PRIMARY KEY,
        fechaEvaluacion DATE           NOT NULL,
        lugar           VARCHAR(100)   NOT NULL DEFAULT 'HOLOMEDIC',
        fototipo        VARCHAR(20)    NOT NULL,
        observaciones   NVARCHAR(500)  NULL,
        lesionesJson    NVARCHAR(MAX)  NOT NULL DEFAULT '[]',
        createdAt       DATETIME       NOT NULL DEFAULT GETDATE(),
        updatedAt       DATETIME       NOT NULL DEFAULT GETDATE()
    );
END;
GO

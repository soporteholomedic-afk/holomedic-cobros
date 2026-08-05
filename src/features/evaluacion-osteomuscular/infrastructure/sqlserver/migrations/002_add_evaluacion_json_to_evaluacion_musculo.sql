-- Migration: 002_add_evaluacion_json_to_evaluacion_musculo
-- Target: HOLOMEDIC database (dbo schema)
-- Idempotent: only alters when missing.
-- Depends on: migration 001_add_entrevista_json_to_evaluacion_musculo.sql
--   (creates dbo.EvaluacionMusculoEsqueletica). The column stores the full
--   osteomuscular clinical evaluation as JSON, next to the interview JSON.
-- Run manually or via your migration runner against HOLOMEDIC.

BEGIN TRANSACTION;

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE OBJECT_ID = OBJECT_ID(N'dbo.EvaluacionMusculoEsqueletica')
      AND name = 'evaluacionJson'
)
BEGIN
    ALTER TABLE dbo.EvaluacionMusculoEsqueletica
        ADD evaluacionJson NVARCHAR(MAX) NULL;
END;

COMMIT;

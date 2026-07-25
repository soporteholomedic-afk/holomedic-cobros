-- Migration: 002_add_fotoprotector
-- Target: HOLOMEDIC database (dbo schema)
-- Idempotent: only adds the column if it doesn't exist.

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE OBJECT_ID = OBJECT_ID(N'dbo.JjcEvaluacion')
    AND name = 'fotoprotector'
)
BEGIN
    ALTER TABLE dbo.JjcEvaluacion
    ADD fotoprotector VARCHAR(30) NULL;
END;
GO

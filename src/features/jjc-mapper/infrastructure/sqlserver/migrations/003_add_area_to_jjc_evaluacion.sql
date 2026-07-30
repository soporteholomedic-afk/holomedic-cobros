-- Migration: 003_add_area_to_jjc_evaluacion
-- Adds an `area` discriminator column to separate evaluations by medical area
-- (medicina, musculoesqueletica, etc.) and changes the PK to composite (idAtencion, area).

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE OBJECT_ID = OBJECT_ID(N'dbo.JjcEvaluacion')
    AND name = 'area'
)
BEGIN
    -- 1. Add nullable column
    ALTER TABLE dbo.JjcEvaluacion ADD area VARCHAR(50) NULL;

    -- 2. Set existing rows to 'medicina'
    UPDATE dbo.JjcEvaluacion SET area = 'medicina';

    -- 3. Make NOT NULL
    ALTER TABLE dbo.JjcEvaluacion ALTER COLUMN area VARCHAR(50) NOT NULL;

    -- 4. Drop old single-column PK
    DECLARE @pkName NVARCHAR(200);
    SELECT @pkName = name FROM sys.key_constraints
      WHERE parent_object_id = OBJECT_ID(N'dbo.JjcEvaluacion') AND type = 'PK';
    DECLARE @dropSql NVARCHAR(MAX) = 'ALTER TABLE dbo.JjcEvaluacion DROP CONSTRAINT ' + QUOTENAME(@pkName);
    EXEC sp_executesql @dropSql;

    -- 5. Create composite PK (idAtencion, area)
    ALTER TABLE dbo.JjcEvaluacion ADD CONSTRAINT PK_JjcEvaluacion PRIMARY KEY (idAtencion, area);
END;

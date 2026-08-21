import mssql from 'mssql';
import bcrypt from 'bcryptjs';

/**
 * SQL Server schema for `dbo.usuarios` (dual-column identity,
 * usuarios-nombre-firma).
 *
 * Fresh installs: the CREATE block carries BOTH `usuario` (login
 * identifier) and `nombre` (display full name); the sys.columns gates
 * below then see both columns and skip the legacy rename/ADD.
 *
 * Pre-change databases: a single `nombre` column held the login
 * identifier. The migration repurposes it in two gated steps:
 *   1. `sp_rename nombre → usuario` (runs only when `usuario` is
 *      missing — the rename gate);
 *   2. `ALTER ADD nombre NVARCHAR(200) NOT NULL DEFAULT ''` with the
 *      backfill `UPDATE ... SET nombre = usuario` NESTED inside the
 *      same gate, so it runs exactly once (an intentionally cleared
 *      `nombre` is never re-backfilled on later startups).
 *
 * Partial-failure self-heal: if the process dies between steps, the
 * next startup re-enters only the unfinished gate. Idempotency is
 * structural (`sys.columns` gates) — no version table.
 *
 * The backfill UPDATE runs via `sp_executesql` ON PURPOSE: SQL Server
 * compiles the whole batch against the pre-migration schema before any
 * statement executes, so a bare `UPDATE ... SET nombre = usuario` fails
 * at compile time with "Invalid column name 'usuario'" (error 207) and
 * NOTHING in the batch runs — the rename never happens, and every
 * startup re-fails the same way. Dynamic SQL defers that statement's
 * compilation to runtime, after the `ALTER TABLE` has committed.
 */
const SCHEMA_SQL = /* sql */ `
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'usuarios' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.usuarios (
    idUsuario       NVARCHAR(50)   NOT NULL PRIMARY KEY,
    usuario         NVARCHAR(200)  NOT NULL,
    nombre          NVARCHAR(200)  NOT NULL DEFAULT '',
    area            NVARCHAR(50)   NOT NULL,
    permisos        NVARCHAR(MAX)  NOT NULL,
    contrasenaHash  NVARCHAR(255)  NOT NULL,
    firma           VARBINARY(MAX) NULL,
    activo          BIT            NOT NULL DEFAULT 1,
    createdAt       DATETIME2(3)   NOT NULL DEFAULT SYSUTCDATETIME(),
    updatedAt       DATETIME2(3)   NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.usuarios') AND name = 'usuario')
BEGIN
  EXEC sp_rename 'dbo.usuarios.nombre', 'usuario', 'COLUMN';
END;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.usuarios') AND name = 'nombre')
BEGIN
  ALTER TABLE dbo.usuarios ADD nombre NVARCHAR(200) NOT NULL DEFAULT '';
  EXEC sp_executesql N'UPDATE dbo.usuarios SET nombre = usuario';
END;
`;

async function seedAdmin(pool: mssql.ConnectionPool): Promise<void> {
  const result = await pool.request().query(
    `SELECT 1 FROM dbo.usuarios WHERE idUsuario = 'admin-001'`,
  );
  if (result.recordset.length > 0) return;

  const hash = await bcrypt.hash('Nortel01$', 10);
  const id = 'admin-001';
  const usuario = 'soporte';
  const nombre = 'soporte';
  const area = 'admin';
  const permisos = JSON.stringify(['admin']);

  await pool
    .request()
    .input('idUsuario', mssql.NVarChar(50), id)
    .input('usuario', mssql.NVarChar(200), usuario)
    .input('nombre', mssql.NVarChar(200), nombre)
    .input('area', mssql.NVarChar(50), area)
    .input('permisos', mssql.NVarChar(mssql.MAX), permisos)
    .input('contrasenaHash', mssql.NVarChar(255), hash).query(`
      INSERT INTO dbo.usuarios (idUsuario, usuario, nombre, area, permisos, contrasenaHash)
      VALUES (@idUsuario, @usuario, @nombre, @area, @permisos, @contrasenaHash)
    `);
}

export async function migrate(pool: mssql.ConnectionPool): Promise<void> {
  await pool.request().batch(SCHEMA_SQL);
  await seedAdmin(pool);
}

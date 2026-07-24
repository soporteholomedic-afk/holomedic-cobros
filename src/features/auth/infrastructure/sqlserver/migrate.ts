import mssql from 'mssql';
import bcrypt from 'bcryptjs';

const SCHEMA_SQL = /* sql */ `
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'usuarios' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.usuarios (
    idUsuario       NVARCHAR(50)   NOT NULL PRIMARY KEY,
    nombre          NVARCHAR(200)  NOT NULL,
    area            NVARCHAR(50)   NOT NULL,
    permisos        NVARCHAR(MAX)  NOT NULL,
    contrasenaHash  NVARCHAR(255)  NOT NULL,
    firma           VARBINARY(MAX) NULL,
    activo          BIT            NOT NULL DEFAULT 1,
    createdAt       DATETIME2(3)   NOT NULL DEFAULT SYSUTCDATETIME(),
    updatedAt       DATETIME2(3)   NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;
`;

async function seedAdmin(pool: mssql.ConnectionPool): Promise<void> {
  const result = await pool.request().query(
    `SELECT 1 FROM dbo.usuarios WHERE idUsuario = 'admin-001'`,
  );
  if (result.recordset.length > 0) return;

  const hash = await bcrypt.hash('Nortel01$', 10);
  const id = 'admin-001';
  const nombre = 'soporte';
  const area = 'admin';
  const permisos = JSON.stringify(['admin']);

  await pool
    .request()
    .input('idUsuario', mssql.NVarChar(50), id)
    .input('nombre', mssql.NVarChar(200), nombre)
    .input('area', mssql.NVarChar(50), area)
    .input('permisos', mssql.NVarChar(mssql.MAX), permisos)
    .input('contrasenaHash', mssql.NVarChar(255), hash).query(`
      INSERT INTO dbo.usuarios (idUsuario, nombre, area, permisos, contrasenaHash)
      VALUES (@idUsuario, @nombre, @area, @permisos, @contrasenaHash)
    `);
}

export async function migrate(pool: mssql.ConnectionPool): Promise<void> {
  await pool.request().batch(SCHEMA_SQL);
  await seedAdmin(pool);
}

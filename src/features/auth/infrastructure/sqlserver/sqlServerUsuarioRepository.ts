import { randomUUID } from 'node:crypto';
import mssql from 'mssql';
import bcrypt from 'bcryptjs';

import type { IUsuarioRepository } from '../../domain/ports';
import type { UsuarioRow, CreateUsuarioInput, UpdateUsuarioInput, Permiso } from '../../domain/entities';
import { UsuarioNotFoundError } from './errors';

interface UsuarioDbRow {
  idUsuario: string;
  nombre: string;
  area: string;
  permisos: string;
  contrasenaHash: string;
  firma: Buffer | null;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function rowToRow(row: UsuarioDbRow): UsuarioRow {
  return {
    idUsuario: row.idUsuario,
    nombre: row.nombre,
    area: row.area,
    permisos: JSON.parse(row.permisos) as Permiso[],
    contrasenaHash: row.contrasenaHash,
    firma: row.firma,
    activo: row.activo,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class SqlServerUsuarioRepository implements IUsuarioRepository {
  constructor(private readonly pool: mssql.ConnectionPool) {}

  async findByUsuario(nombre: string): Promise<UsuarioRow | null> {
    const result = await this.pool
      .request()
      .input('nombre', mssql.NVarChar(200), nombre)
      .query(`SELECT * FROM dbo.usuarios WHERE nombre = @nombre`);

    return result.recordset.length > 0 ? rowToRow(result.recordset[0]) : null;
  }

  async getById(id: string): Promise<UsuarioRow | null> {
    const result = await this.pool
      .request()
      .input('id', mssql.NVarChar(50), id)
      .query(`SELECT * FROM dbo.usuarios WHERE idUsuario = @id`);

    return result.recordset.length > 0 ? rowToRow(result.recordset[0]) : null;
  }

  async list(): Promise<UsuarioRow[]> {
    const result = await this.pool.request().query(`
      SELECT * FROM dbo.usuarios ORDER BY createdAt DESC
    `);
    return result.recordset.map(rowToRow);
  }

  async create(input: CreateUsuarioInput): Promise<UsuarioRow> {
    const id = randomUUID();
    const hash = await bcrypt.hash(input.contrasena, 10);
    const permisosJson = JSON.stringify(input.permisos);

    const result = await this.pool
      .request()
      .input('idUsuario', mssql.NVarChar(50), id)
      .input('nombre', mssql.NVarChar(200), input.nombre)
      .input('area', mssql.NVarChar(50), input.area)
      .input('permisos', mssql.NVarChar(mssql.MAX), permisosJson)
      .input('contrasenaHash', mssql.NVarChar(255), hash).query(`
        INSERT INTO dbo.usuarios (idUsuario, nombre, area, permisos, contrasenaHash)
        OUTPUT INSERTED.*
        VALUES (@idUsuario, @nombre, @area, @permisos, @contrasenaHash)
      `);

    return rowToRow(result.recordset[0]);
  }

  async update(id: string, input: UpdateUsuarioInput): Promise<UsuarioRow> {
    const existing = await this.getById(id);
    if (!existing) throw new UsuarioNotFoundError(id);

    const sets: string[] = [];
    const request = this.pool.request().input('id', mssql.NVarChar(50), id);

    if (input.nombre !== undefined) {
      sets.push('nombre = @nombre');
      request.input('nombre', mssql.NVarChar(200), input.nombre);
    }
    if (input.area !== undefined) {
      sets.push('area = @area');
      request.input('area', mssql.NVarChar(50), input.area);
    }
    if (input.permisos !== undefined) {
      sets.push('permisos = @permisos');
      request.input('permisos', mssql.NVarChar(mssql.MAX), JSON.stringify(input.permisos));
    }
    if (input.contrasena !== undefined) {
      const hash = await bcrypt.hash(input.contrasena, 10);
      sets.push('contrasenaHash = @contrasenaHash');
      request.input('contrasenaHash', mssql.NVarChar(255), hash);
    }
    if (input.activo !== undefined) {
      sets.push('activo = @activo');
      request.input('activo', mssql.Bit, input.activo);
    }

    if (sets.length === 0) return existing;

    sets.push('updatedAt = SYSUTCDATETIME()');

    const result = await request.query(`
      UPDATE dbo.usuarios SET ${sets.join(', ')}
      OUTPUT INSERTED.*
      WHERE idUsuario = @id
    `);

    return rowToRow(result.recordset[0]);
  }

  async softDelete(id: string): Promise<void> {
    const result = await this.pool
      .request()
      .input('id', mssql.NVarChar(50), id)
      .query(`
        UPDATE dbo.usuarios SET activo = 0, updatedAt = SYSUTCDATETIME()
        WHERE idUsuario = @id
      `);

    if (result.rowsAffected[0] === 0) throw new UsuarioNotFoundError(id);
  }

  async updateFirma(id: string, firma: Buffer): Promise<void> {
    const result = await this.pool
      .request()
      .input('id', mssql.NVarChar(50), id)
      .input('firma', mssql.VarBinary(mssql.MAX), firma)
      .query(`
        UPDATE dbo.usuarios SET firma = @firma, updatedAt = SYSUTCDATETIME()
        WHERE idUsuario = @id
      `);

    if (result.rowsAffected[0] === 0) throw new UsuarioNotFoundError(id);
  }

  async getFirma(id: string): Promise<Buffer | null> {
    const result = await this.pool
      .request()
      .input('id', mssql.NVarChar(50), id)
      .query(`SELECT firma FROM dbo.usuarios WHERE idUsuario = @id`);

    if (result.recordset.length === 0) throw new UsuarioNotFoundError(id);
    return result.recordset[0].firma;
  }
}

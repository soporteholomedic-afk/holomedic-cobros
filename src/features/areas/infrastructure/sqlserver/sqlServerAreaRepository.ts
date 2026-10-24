import { randomUUID } from 'node:crypto';
import mssql from 'mssql';

import type { IAreaRepository } from '../../domain/ports';
import type { Area, CreateAreaInput, UpdateAreaInput } from '../../domain/entities';
import { AreaNotFoundError } from '../../domain/errors';

interface AreaDbRow {
  idArea: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function rowToArea(row: AreaDbRow): Area {
  return {
    idArea: row.idArea,
    nombre: row.nombre,
    descripcion: row.descripcion ?? null,
    activo: row.activo,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class SqlServerAreaRepository implements IAreaRepository {
  constructor(private readonly pool: mssql.ConnectionPool) {}

  async getById(id: string): Promise<Area | null> {
    const result = await this.pool
      .request()
      .input('id', mssql.NVarChar(50), id)
      .query(`SELECT * FROM dbo.areas WHERE idArea = @id`);

    return result.recordset.length > 0 ? rowToArea(result.recordset[0]) : null;
  }

  async findByNombre(nombre: string): Promise<Area | null> {
    const result = await this.pool
      .request()
      .input('nombre', mssql.NVarChar(200), nombre)
      .query(`SELECT TOP 1 * FROM dbo.areas WHERE nombre = @nombre`);

    return result.recordset.length > 0 ? rowToArea(result.recordset[0]) : null;
  }

  async list(): Promise<Area[]> {
    const result = await this.pool.request().query(`
      SELECT * FROM dbo.areas ORDER BY nombre ASC
    `);
    return result.recordset.map(rowToArea);
  }

  async create(input: CreateAreaInput): Promise<Area> {
    const id = randomUUID();

    const result = await this.pool
      .request()
      .input('idArea', mssql.NVarChar(50), id)
      .input('nombre', mssql.NVarChar(200), input.nombre)
      .input('descripcion', mssql.NVarChar(500), input.descripcion ?? null).query(`
        INSERT INTO dbo.areas (idArea, nombre, descripcion)
        OUTPUT INSERTED.*
        VALUES (@idArea, @nombre, @descripcion)
      `);

    return rowToArea(result.recordset[0]);
  }

  async update(id: string, input: UpdateAreaInput): Promise<Area> {
    const existing = await this.getById(id);
    if (!existing) throw new AreaNotFoundError(id);

    const sets: string[] = [];
    const request = this.pool.request().input('id', mssql.NVarChar(50), id);

    if (input.nombre !== undefined) {
      sets.push('nombre = @nombre');
      request.input('nombre', mssql.NVarChar(200), input.nombre);
    }
    if (input.descripcion !== undefined) {
      sets.push('descripcion = @descripcion');
      request.input('descripcion', mssql.NVarChar(500), input.descripcion);
    }
    if (input.activo !== undefined) {
      sets.push('activo = @activo');
      request.input('activo', mssql.Bit, input.activo);
    }

    if (sets.length === 0) return existing;

    sets.push('updatedAt = SYSUTCDATETIME()');

    const result = await request.query(`
      UPDATE dbo.areas SET ${sets.join(', ')}
      OUTPUT INSERTED.*
      WHERE idArea = @id
    `);

    return rowToArea(result.recordset[0]);
  }

  async softDelete(id: string): Promise<void> {
    const result = await this.pool
      .request()
      .input('id', mssql.NVarChar(50), id)
      .query(`
        UPDATE dbo.areas SET activo = 0, updatedAt = SYSUTCDATETIME()
        WHERE idArea = @id
      `);

    if (result.rowsAffected[0] === 0) throw new AreaNotFoundError(id);
  }
}

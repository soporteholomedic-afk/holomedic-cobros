import { randomUUID } from 'node:crypto';
import mssql from 'mssql';

import type { ICrmEmpresaRepository } from '../../domain/ports';
import type { Empresa, Etapa, NuevaEmpresa, Sector } from '../../domain/entities';
import { EmpresaNotFoundError, RucDuplicadoError } from '../../domain/errors';

interface EmpresaDbRow {
  idEmpresa: string;
  razonSocial: string;
  ruc: string;
  sector: string | null;
  contactoNombre: string;
  contactoTelefono: string;
  contactoCorreo: string | null;
  notas: string | null;
  etapa: string;
  createdAt: Date;
  updatedAt: Date;
}

/** SQL Server error numbers for a violated PRIMARY KEY/UNIQUE constraint or unique index. */
const UNIQUE_VIOLATION = new Set([2627, 2601]);

function rowToEmpresa(row: EmpresaDbRow): Empresa {
  return {
    idEmpresa: row.idEmpresa,
    razonSocial: row.razonSocial,
    ruc: row.ruc,
    sector: (row.sector as Sector | null) ?? null,
    contactoNombre: row.contactoNombre,
    contactoTelefono: row.contactoTelefono,
    contactoCorreo: row.contactoCorreo ?? null,
    notas: row.notas ?? null,
    etapa: row.etapa as Etapa,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class SqlServerCrmEmpresaRepository implements ICrmEmpresaRepository {
  constructor(private readonly pool: mssql.ConnectionPool) {}

  async getById(id: string): Promise<Empresa | null> {
    const result = await this.pool
      .request()
      .input('id', mssql.NVarChar(50), id)
      .query(`SELECT * FROM dbo.CrmEmpresa WHERE idEmpresa = @id`);
    return result.recordset.length > 0 ? rowToEmpresa(result.recordset[0]) : null;
  }

  async findByRuc(ruc: string): Promise<Empresa | null> {
    const result = await this.pool
      .request()
      .input('ruc', mssql.Char(11), ruc)
      .query(`SELECT TOP 1 * FROM dbo.CrmEmpresa WHERE ruc = @ruc`);
    return result.recordset.length > 0 ? rowToEmpresa(result.recordset[0]) : null;
  }

  async list(): Promise<Empresa[]> {
    const result = await this.pool
      .request()
      .query(`SELECT * FROM dbo.CrmEmpresa ORDER BY updatedAt DESC`);
    return result.recordset.map(rowToEmpresa);
  }

  async create(input: NuevaEmpresa): Promise<Empresa> {
    try {
      const result = await this.pool
        .request()
        .input('idEmpresa', mssql.NVarChar(50), randomUUID())
        .input('razonSocial', mssql.NVarChar(200), input.razonSocial)
        .input('ruc', mssql.Char(11), input.ruc)
        .input('sector', mssql.NVarChar(50), input.sector)
        .input('contactoNombre', mssql.NVarChar(200), input.contactoNombre)
        .input('contactoTelefono', mssql.NVarChar(50), input.contactoTelefono)
        .input('contactoCorreo', mssql.NVarChar(200), input.contactoCorreo)
        .input('notas', mssql.NVarChar(mssql.MAX), input.notas)
        .input('etapa', mssql.NVarChar(20), input.etapa).query(`
          INSERT INTO dbo.CrmEmpresa
            (idEmpresa, razonSocial, ruc, sector, contactoNombre, contactoTelefono,
             contactoCorreo, notas, etapa)
          OUTPUT INSERTED.*
          VALUES
            (@idEmpresa, @razonSocial, @ruc, @sector, @contactoNombre, @contactoTelefono,
             @contactoCorreo, @notas, @etapa)
        `);
      return rowToEmpresa(result.recordset[0]);
    } catch (error) {
      // Two concurrent creates can both pass the use case's RUC check;
      // the unique constraint is the real guard.
      const number = (error as { number?: number } | null)?.number;
      if (number !== undefined && UNIQUE_VIOLATION.has(number)) {
        throw new RucDuplicadoError(input.ruc);
      }
      throw error;
    }
  }

  async updateEtapa(id: string, etapa: Etapa): Promise<Empresa> {
    const result = await this.pool
      .request()
      .input('id', mssql.NVarChar(50), id)
      .input('etapa', mssql.NVarChar(20), etapa).query(`
        UPDATE dbo.CrmEmpresa SET etapa = @etapa, updatedAt = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE idEmpresa = @id
      `);
    if (result.recordset.length === 0) throw new EmpresaNotFoundError(id);
    return rowToEmpresa(result.recordset[0]);
  }
}

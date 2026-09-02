import * as mssql from 'mssql';

import type { EntradaAuditoria } from '../../domain/entities';
import type { IAuditoriaRepository } from '../../domain/ports';

/**
 * SQL Server adapter for the RRHH audit trail (dbo.auditoria). One row
 * per mutation: table + record id, action, before/after JSON and the
 * session user (usuarioId NVARCHAR(50) — dbo.usuarios.idUsuario UUID).
 * Append-only by contract: this adapter only ever INSERTs.
 */
export class SqlServerAuditoriaRepository implements IAuditoriaRepository {
  constructor(private readonly pool: mssql.ConnectionPool) {}

  async registrar(entrada: EntradaAuditoria): Promise<void> {
    await this.pool
      .request()
      .input('tabla', mssql.NVarChar(60), entrada.tabla)
      .input('registroId', mssql.BigInt, entrada.registroId ?? null)
      .input('accion', mssql.VarChar(10), entrada.accion)
      .input('datosAnteriores', mssql.NVarChar(mssql.MAX), entrada.datosAnteriores ?? null)
      .input('datosNuevos', mssql.NVarChar(mssql.MAX), entrada.datosNuevos ?? null)
      .input('usuarioId', mssql.NVarChar(50), entrada.usuarioId)
      .query(`
INSERT INTO dbo.auditoria (tabla, registroId, accion, datosAnteriores, datosNuevos, usuarioId)
VALUES (@tabla, @registroId, @accion, @datosAnteriores, @datosNuevos, @usuarioId)`);
  }
}

import * as mssql from 'mssql';

import { NotFoundError } from '../../domain/errors';
import type {
  AsignacionAPersistir,
  AsignacionHistorial,
  CrmAsignacionesRepositoryPort,
} from '../../domain/ports';

import { withCrmTransaction } from './withCrmTransaction';

/**
 * SQL Server adapter for the assignment port (tasks pr14/WU2, spec G5,
 * design §2d). The assignment write is genuinely cross-table — the
 * `CRM_Empresas.responsable` UPDATE (current single owner, NULL =
 * pool) and the `CRM_Asignaciones` event INSERT (traceable history)
 * land inside ONE `withCrmTransaction`: a mid-flight failure leaves
 * the owner untouched with zero orphan event rows.
 *
 * Like the pipeline adapter this class is a thin, dumb persister: the
 * use case owns the policy (who may assign/return, the
 * ASIGNADO/REASIGNADO/DEVUELTO derivation) and this adapter validates
 * nothing but existence (a missing empresa raises the typed
 * `NotFoundError` from rowsAffected 0).
 */

/** CRM_Asignaciones read row — BIGINT id crosses tedious as a string. */
interface FilaAsignacionLeida {
  id: number | string;
  empresaId: number;
  accion: string;
  responsablePrevio: string | null;
  responsableNuevo: string | null;
  actorUsuario: string;
  createdAt: Date;
}

export class SqlServerAsignacionesRepository implements CrmAsignacionesRepositoryPort {
  constructor(private readonly pool: mssql.ConnectionPool) {}

  async registrarAsignacion(datos: AsignacionAPersistir): Promise<void> {
    await withCrmTransaction(this.pool, async (tx) => {
      const update = await tx
        .request()
        .input('empresaId', mssql.Int, datos.empresaId)
        .input('responsable', mssql.NVarChar(200), datos.responsableNuevo)
        .input('usuario', mssql.NVarChar(200), datos.actorUsuario).query(`
          UPDATE dbo.CRM_Empresas
          SET responsable = @responsable, updatedBy = @usuario, updatedAt = SYSDATETIME()
          WHERE id = @empresaId
        `);
      if ((update.rowsAffected[0] ?? 0) === 0) {
        throw new NotFoundError('Empresa no encontrada');
      }

      await tx
        .request()
        .input('empresaId', mssql.Int, datos.empresaId)
        .input('accion', mssql.VarChar(12), datos.accion)
        .input('responsablePrevio', mssql.NVarChar(200), datos.responsablePrevio)
        .input('responsableNuevo', mssql.NVarChar(200), datos.responsableNuevo)
        .input('actorUsuario', mssql.NVarChar(200), datos.actorUsuario).query(`
          INSERT INTO dbo.CRM_Asignaciones
            (empresaId, accion, responsablePrevio, responsableNuevo, actorUsuario)
          VALUES (@empresaId, @accion, @responsablePrevio, @responsableNuevo, @actorUsuario)
        `);
    });
  }

  async listarAsignaciones(empresaId: number): Promise<AsignacionHistorial[]> {
    const result = await this.pool
      .request()
      .input('empresaId', mssql.Int, empresaId).query(`
        SELECT id, empresaId, accion, responsablePrevio, responsableNuevo,
               actorUsuario, createdAt
        FROM dbo.CRM_Asignaciones
        WHERE empresaId = @empresaId
        ORDER BY createdAt DESC, id DESC
      `);
    return (result.recordset as FilaAsignacionLeida[]).map((row) => ({
      id: Number(row.id),
      empresaId: row.empresaId,
      accion: row.accion as AsignacionHistorial['accion'],
      responsablePrevio: row.responsablePrevio,
      responsableNuevo: row.responsableNuevo,
      actorUsuario: row.actorUsuario,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}

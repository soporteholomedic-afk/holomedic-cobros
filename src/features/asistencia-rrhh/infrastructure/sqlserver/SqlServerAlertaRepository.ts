import * as mssql from 'mssql';

import type { Alerta } from '../../domain/entities';
import type { IAlertaRepository } from '../../domain/ports';

/**
 * SQL Server adapter for capture alerts. `crear` backs the ingestion
 * alerts (USER_ID_DESCONOCIDO) and the heartbeat drift alert;
 * `recientes` feeds the dashboard panel (REQ-F1-11) — most recent
 * first, covered by idx_alertas_fecha.
 */
export class SqlServerAlertaRepository implements IAlertaRepository {
  constructor(private readonly pool: mssql.ConnectionPool) {}

  async crear(tipo: string, detalle: string, dispositivoId?: number): Promise<void> {
    await this.pool
      .request()
      .input('tipo', mssql.VarChar(40), tipo)
      .input('detalle', mssql.NVarChar(500), detalle)
      .input('dispositivoId', mssql.Int, dispositivoId ?? null)
      .query(`
INSERT INTO dbo.alertas (tipo, detalle, dispositivoId)
VALUES (@tipo, @detalle, @dispositivoId)`);
  }

  async recientes(limite: number): Promise<Alerta[]> {
    const result = await this.pool
      .request()
      .input('limite', mssql.Int, limite)
      .query(`
SELECT TOP (@limite) id, tipo, empleadoId, dispositivoId, detalle, fecha, atendida
FROM dbo.alertas
ORDER BY fecha DESC, id DESC`);
    return (result.recordset as unknown as Alerta[]).map((fila) => ({
      ...fila,
      atendida: Boolean(fila.atendida),
    }));
  }
}

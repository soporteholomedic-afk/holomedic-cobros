import * as mssql from 'mssql';

import type { IAlertaRepository } from '../../domain/ports';

/**
 * SQL Server adapter for capture alerts. `crear` backs the ingestion
 * alerts (USER_ID_DESCONOCIDO) and later the heartbeat drift alert
 * (WU7); `recientes` feeds the dashboard panel (WU13) and fails loudly
 * until then.
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

  async recientes(): Promise<never> {
    throw new Error(
      'SqlServerAlertaRepository.recientes llega con el dashboard (WU13 del plan asistencia-rrhh-fase1)',
    );
  }
}

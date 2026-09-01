import * as mssql from 'mssql';

import type { IParametroRepository } from '../../domain/ports';

/**
 * SQL Server adapter for dbo.parametros_sistema (read-only in F1 —
 * seedParametros plants the values at startup and nothing in F1 writes
 * them). `valor` backs the heartbeat drift threshold
 * (TARDANZA_ALARMA_RELOJ_SEG, REQ-F1-03) and later the dashboard's
 * WORKER_CAIDO_SEG evaluation (ADR-5, WU13).
 */
export class SqlServerParametroRepository implements IParametroRepository {
  constructor(private readonly pool: mssql.ConnectionPool) {}

  async valor(clave: string): Promise<string | null> {
    const result = await this.pool
      .request()
      .input('clave', mssql.VarChar(50), clave)
      .query('SELECT valor FROM dbo.parametros_sistema WHERE clave = @clave');
    const fila = (result.recordset as unknown as Array<{ valor: string }>)[0];
    return fila ? String(fila.valor) : null;
  }
}

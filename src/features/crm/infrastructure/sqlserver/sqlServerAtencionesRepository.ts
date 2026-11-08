import mssql from 'mssql';
import type { IAtencionesServicio } from '../../domain/ports';

/**
 * Read-only SIGLA adapter: the date of the last performed service per
 * empresa RUC (`Cliente.NroRuc` -> `Orden.CodCli` -> `MAX(Orden.FecAte)`).
 *
 * Only real attention data answers this port — winning a deal or logging a
 * call never does (regla S6.5/S6.6). `null` means SIGLA has no attention for
 * the RUC: callers must treat that as "Sin información / Pendiente de
 * primera atención", never as inactivity (regla S6.7).
 */
export class SqlServerAtencionesRepository implements IAtencionesServicio {
  private readonly getPool: () => Promise<mssql.ConnectionPool>;

  constructor(getPool: () => Promise<mssql.ConnectionPool>) {
    this.getPool = getPool;
  }

  /** Lima calendar date (`YYYY-MM-DD`) of the last attention; `null` when none. */
  async ultimaAtencion(ruc: string): Promise<string | null> {
    const pool = await this.getPool();
    // getPool() hands out an UNCONNECTED pool (lazy singleton, lib/db): every
    // consumer connects explicitly — mssql v12 request() on a closed pool
    // throws ECONNCLOSED. Connecting an already-connected pool is a no-op.
    await pool.connect();
    const resultado = await pool
      .request()
      .input('ruc', mssql.VarChar(15), ruc)
      .query(
        `SELECT MAX(O.FecAte) AS UltimaAtencion
           FROM Cliente C
           LEFT JOIN Orden O ON O.CodCli = C.CodCli
          WHERE C.NroRuc = @ruc
            AND C.IndReg = 1`,
      );
    const fecha = resultado.recordset[0]?.UltimaAtencion;
    return fecha ? fechaLima(fecha as Date) : null;
  }
}

/** Format a timestamp as the calendar day it falls on in Lima (`YYYY-MM-DD`). */
export function fechaLima(fecha: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(fecha);
}

import mssql from 'mssql';
import type { ClienteSiglaConActividad, IAtencionesServicio } from '../../domain/ports';

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

  /** Whole RUCs per SQL round-trip; keeps every query under the mssql parameter cap. */
  private static readonly CHUNK_RUCS = 500;

  async ultimaAtencionPorRucs(rucs: string[]): Promise<Map<string, string | null>> {
    const resultado = new Map<string, string | null>();
    const lista = [...new Set(rucs.filter((ruc) => ruc.length > 0))];
    for (let i = 0; i < lista.length; i += SqlServerAtencionesRepository.CHUNK_RUCS) {
      const lote = lista.slice(i, i + SqlServerAtencionesRepository.CHUNK_RUCS);
      const pool = await this.getPool();
      // getPool() hands out an UNCONNECTED pool (lazy singleton, lib/db): every
      // consumer connects explicitly — mssql v12 request() on a closed pool
      // throws ECONNCLOSED. Connecting an already-connected pool is a no-op.
      await pool.connect();
      const request = pool.request();
      lote.forEach((ruc, idx) => request.input(`ruc${idx}`, mssql.VarChar(15), ruc));
      const respuesta = await request.query(
        `SELECT C.NroRuc, MAX(O.FecAte) AS UltimaAtencion
           FROM Cliente C
           LEFT JOIN Orden O ON O.CodCli = C.CodCli
          WHERE C.IndReg = 1
            AND C.NroRuc IN (${lote.map((_, idx) => `@ruc${idx}`).join(', ')})
          GROUP BY C.NroRuc`,
      );
      for (const fila of respuesta.recordset) {
        resultado.set(fila.NroRuc as string, fila.UltimaAtencion ? fechaLima(fila.UltimaAtencion as Date) : null);
      }
    }
    // A RUC the answer never mentions has no Cliente row in SIGLA at all —
    // the same NULL signal the single-RUC lookup gives (regla S6.7).
    for (const ruc of lista) {
      if (!resultado.has(ruc)) resultado.set(ruc, null);
    }
    return resultado;
  }

  async clientesConActividad(): Promise<ClienteSiglaConActividad[]> {
    const pool = await this.getPool();
    await pool.connect();
    const respuesta = await pool.request().query(`
      SELECT C.NroRuc, MAX(C.RazSoc) AS RazSoc, MAX(C.NomCon) AS NomCon,
             MAX(C.NroTlf) AS NroTlf, MAX(C.CorElC) AS CorElC, MAX(O.FecAte) AS UltimaAtencion
        FROM Cliente C
        LEFT JOIN Orden O ON O.CodCli = C.CodCli
       WHERE C.IndReg = 1
       GROUP BY C.NroRuc
    `);
    return respuesta.recordset
      .filter((fila) => fila.NroRuc !== null)
      .map((fila) => ({
        razonSocial: (fila.RazSoc as string | null) ?? '',
        ruc: fila.NroRuc as string,
        telefono: (fila.NroTlf as string | null) ?? null,
        contacto: (fila.NomCon as string | null) ?? null,
        correo: (fila.CorElC as string | null) ?? null,
        ultimaAtencion: fila.UltimaAtencion ? fechaLima(fila.UltimaAtencion as Date) : null,
      }));
  }
}

/** Format a timestamp as the calendar day it falls on in Lima (`YYYY-MM-DD`). */
export function fechaLima(fecha: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(fecha);
}

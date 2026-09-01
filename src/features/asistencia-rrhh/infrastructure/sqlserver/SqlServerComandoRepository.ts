import * as mssql from 'mssql';

import type { Comando, EstadoComando, TipoComando } from '../../domain/entities';
import type { IComandoRepository, ResultadoConfirmacion } from '../../domain/ports';

/**
 * SQL Server adapter for the device command lifecycle. The claim is ONE
 * atomic UPDATE…OUTPUT statement: rows flip PENDIENTE→ENVIADO (with
 * SYSDATETIME stamp, ADR-9) and are returned in the same statement, so
 * a command is delivered exactly once even under concurrent workers.
 * `confirmar` mirrors that shape: ONE UPDATE…OUTPUT restricted to the
 * device's own PENDIENTE/ENVIADO row, falling back to a read-only
 * lookup to tell NO_EXISTE (unknown id) from AJENO (another device's
 * command) from a same-device terminal row — the no-op re-confirm
 * returns the ORIGINAL confirmadoAt and never writes again.
 */

interface ComandoRow {
  id: number;
  dispositivoId: number;
  tipo: TipoComando;
  payload: string | null;
  estado: EstadoComando;
  createdAt: Date;
  enviadoAt: Date | null;
  confirmadoAt: Date | null;
}

function filaAComando(fila: ComandoRow): Comando {
  return {
    id: fila.id,
    dispositivoId: fila.dispositivoId,
    tipo: fila.tipo,
    payload: fila.payload,
    estado: fila.estado,
    createdAt: fila.createdAt,
    enviadoAt: fila.enviadoAt,
    confirmadoAt: fila.confirmadoAt,
  };
}

export class SqlServerComandoRepository implements IComandoRepository {
  constructor(private readonly pool: mssql.ConnectionPool) {}

  async pendientesYMarcarEnviados(dispositivoId: number): Promise<Comando[]> {
    const result = await this.pool
      .request()
      .input('dispositivoId', mssql.Int, dispositivoId)
      .query(`
UPDATE dbo.comandos_dispositivo
   SET estado = 'ENVIADO', enviadoAt = SYSDATETIME()
 OUTPUT inserted.id, inserted.dispositivoId, inserted.tipo, inserted.payload,
        inserted.estado, inserted.createdAt, inserted.enviadoAt, inserted.confirmadoAt
 WHERE dispositivoId = @dispositivoId AND estado = 'PENDIENTE'`);
    return (result.recordset as unknown as ComandoRow[]).map(filaAComando);
  }

  async confirmar(id: number, dispositivoId: number): Promise<ResultadoConfirmacion> {
    const update = await this.pool
      .request()
      .input('id', mssql.BigInt, id)
      .input('dispositivoId', mssql.Int, dispositivoId)
      .query(`
UPDATE dbo.comandos_dispositivo
   SET estado = 'CONFIRMADO', confirmadoAt = SYSDATETIME()
 OUTPUT inserted.id, inserted.dispositivoId, inserted.tipo, inserted.payload,
        inserted.estado, inserted.createdAt, inserted.enviadoAt, inserted.confirmadoAt
 WHERE id = @id AND dispositivoId = @dispositivoId AND estado IN ('PENDIENTE','ENVIADO')`);
    // rowsAffected is the authoritative transition signal — an UPDATE…OUTPUT
    // that matches zero rows yields an empty recordset AND a zero count.
    if ((update.rowsAffected[0] ?? 0) > 0) {
      const confirmada = (update.recordset as unknown as ComandoRow[])[0];
      return { estado: 'CONFIRMADO', confirmadoAt: confirmada?.confirmadoAt ?? null };
    }

    // Nothing transitioned: unknown id, another device's command, or a
    // same-device terminal row (CONFIRMADO/ERROR) — the no-op keeps the
    // original confirmadoAt untouched.
    const lookup = await this.pool
      .request()
      .input('id', mssql.BigInt, id)
      .query(
        'SELECT dispositivoId, estado, confirmadoAt FROM dbo.comandos_dispositivo WHERE id = @id',
      );
    const fila = (
      lookup.recordset as unknown as Array<{
        dispositivoId: number;
        estado: EstadoComando;
        confirmadoAt: Date | null;
      }>
    )[0];
    if (!fila) return { estado: 'NO_EXISTE' };
    if (fila.dispositivoId !== dispositivoId) return { estado: 'AJENO' };
    return { estado: 'CONFIRMADO', confirmadoAt: fila.confirmadoAt };
  }
}

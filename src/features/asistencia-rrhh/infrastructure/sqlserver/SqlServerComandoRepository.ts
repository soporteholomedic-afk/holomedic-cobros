import * as mssql from 'mssql';

import type { Comando, EstadoComando, TipoComando } from '../../domain/entities';
import type { IComandoRepository } from '../../domain/ports';

/**
 * SQL Server adapter for the device command lifecycle. The claim is ONE
 * atomic UPDATE…OUTPUT statement: rows flip PENDIENTE→ENVIADO (with
 * SYSDATETIME stamp, ADR-9) and are returned in the same statement, so
 * a command is delivered exactly once even under concurrent workers.
 * `confirmar` lands with its route (WU8) and fails loudly until then.
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

  async confirmar(): Promise<never> {
    throw new Error(
      'SqlServerComandoRepository.confirmar llega con su route (WU8 del plan asistencia-rrhh-fase1)',
    );
  }
}

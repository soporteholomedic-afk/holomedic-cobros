import * as mssql from 'mssql';

import type { Dispositivo } from '../../domain/entities';
import type { IDispositivoRepository } from '../../domain/ports';

/**
 * SQL Server adapter for biometric devices. `porTokenHash` is the
 * Bearer-auth lookup shared by the three `/api/asistencia/*` endpoints
 * (REQ-F1-14/15): exact byte equality on the VARBINARY(32) SHA-256
 * digest (ADR-7). The hash column is never selected into the domain
 * model. `registrarHeartbeat` stamps the heartbeat liveness read by the
 * dashboard (ADR-5); estados (WU13) fails loudly until its work unit
 * lands.
 */

interface DispositivoRow {
  id: number;
  codigo: string;
  sede: string | null;
  ip: string | null;
  activo: boolean;
  ultimaSincronizacion: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function filaADispositivo(fila: DispositivoRow): Dispositivo {
  return {
    id: fila.id,
    codigo: fila.codigo,
    sede: fila.sede,
    ip: fila.ip,
    activo: Boolean(fila.activo),
    ultimaSincronizacion: fila.ultimaSincronizacion,
    createdAt: fila.createdAt,
    updatedAt: fila.updatedAt,
  };
}

export class SqlServerDispositivoRepository implements IDispositivoRepository {
  constructor(private readonly pool: mssql.ConnectionPool) {}

  async porTokenHash(hash: Buffer): Promise<Dispositivo | null> {
    const result = await this.pool
      .request()
      .input('hash', mssql.VarBinary(32), hash)
      .query(`
SELECT id, codigo, sede, ip, activo, ultimaSincronizacion, createdAt, updatedAt
FROM dbo.dispositivos
WHERE apiTokenHash = @hash`);
    const fila = (result.recordset as unknown as DispositivoRow[])[0];
    return fila ? filaADispositivo(fila) : null;
  }

  /**
   * Stamp the device's liveness timestamp (REQ-F1-03) and return the
   * stored server time — OUTPUT makes the stamp and the read one
   * statement. A vanished row (post-auth race) fails loudly instead of
   * silently no-oping.
   */
  async registrarHeartbeat(id: number): Promise<Date> {
    const result = await this.pool
      .request()
      .input('id', mssql.Int, id)
      .query(`
UPDATE dbo.dispositivos
   SET ultimaSincronizacion = SYSDATETIME()
 OUTPUT inserted.ultimaSincronizacion
 WHERE id = @id`);
    const fila = (result.recordset as unknown as Array<{ ultimaSincronizacion: Date }>)[0];
    if (!fila) {
      throw new Error(`registrarHeartbeat: el dispositivo ${id} no existe en dbo.dispositivos`);
    }
    return fila.ultimaSincronizacion;
  }

  async estados(): Promise<never> {
    throw new Error(
      'SqlServerDispositivoRepository.estados llega con el dashboard (WU13 del plan asistencia-rrhh-fase1)',
    );
  }
}

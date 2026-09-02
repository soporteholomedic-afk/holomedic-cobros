import * as mssql from 'mssql';

import type { Dispositivo } from '../../domain/entities';
import type { IDispositivoRepository } from '../../domain/ports';

/**
 * SQL Server adapter for biometric devices. `porTokenHash` is the
 * Bearer-auth lookup shared by the three `/api/asistencia/*` endpoints
 * (REQ-F1-14/15): exact byte equality on the VARBINARY(32) SHA-256
 * digest (ADR-7). The hash column is never selected into the domain
 * model. registrarHeartbeat (WU7) and estados (WU13) fail loudly until
 * their work units land.
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

  async registrarHeartbeat(): Promise<never> {
    throw new Error(
      'SqlServerDispositivoRepository.registrarHeartbeat llega con el heartbeat (WU7 del plan asistencia-rrhh-fase1)',
    );
  }

  async estados(): Promise<never> {
    throw new Error(
      'SqlServerDispositivoRepository.estados llega con el dashboard (WU13 del plan asistencia-rrhh-fase1)',
    );
  }
}

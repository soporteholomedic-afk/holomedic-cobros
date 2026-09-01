import * as mssql from 'mssql';

import type { UsuarioEquipo } from '../../domain/entities';
import type { IEmpleadoRepository } from '../../domain/ports';

/**
 * SQL Server adapter for employee fichas. `upsertPendientes` is the
 * heartbeat bootstrap channel (ADR-1, REQ-F1-03/09): it creates ONLY
 * the missing fichas (UNIQUE userId) — the DB defaults plant them as
 * PENDIENTE_FICHA/PAGAR — and never touches existing rows (R5: a
 * renamed device user does not rewrite an existing ficha; convergence
 * comes from the heartbeat's periodicity, not from updates).
 *
 * The statement is the ADR-4 family (INSERT…SELECT VALUES + WHERE NOT
 * EXISTS), chunked under SQL Server's 2100-parameter limit with one
 * transaction per chunk. pendientes/completar land with RRHH completion
 * (WU12) and fail loudly until then.
 */

/** Rows per statement: 300 × 2 params = 601 (≤ 2100). */
const FILAS_POR_CHUNK = 300;

const INSERT_BASE = `
INSERT INTO dbo.empleados (userId, nombres)
SELECT v.userId, v.nombres
FROM (VALUES`;

const INSERT_TAIL = `) AS v(userId, nombres)
WHERE NOT EXISTS (
  SELECT 1 FROM dbo.empleados e WHERE e.userId = v.userId
)`;

export class SqlServerEmpleadoRepository implements IEmpleadoRepository {
  constructor(private readonly pool: mssql.ConnectionPool) {}

  async upsertPendientes(usuarios: UsuarioEquipo[]): Promise<number> {
    if (usuarios.length === 0) return 0;

    // DISTINCT intra-lote (ADR-4 family): two equal user_ids inside one
    // statement would violate the UNIQUE userId constraint.
    const unicos = new Map<string, UsuarioEquipo>();
    for (const u of usuarios) unicos.set(u.userId, u);
    const filas = [...unicos.values()];

    let creadas = 0;
    for (let i = 0; i < filas.length; i += FILAS_POR_CHUNK) {
      const chunk = filas.slice(i, i + FILAS_POR_CHUNK);
      const tx = this.pool.transaction();
      await tx.begin();
      try {
        const request = tx.request();
        const tuplas = chunk.map((fila, j) => {
          request.input(`u${j}`, mssql.VarChar(20), fila.userId);
          request.input(`n${j}`, mssql.NVarChar(100), fila.nombre);
          return `(@u${j}, @n${j})`;
        });
        const result = await request.query(`${INSERT_BASE} ${tuplas.join(', ')} ${INSERT_TAIL}`);
        creadas += result.rowsAffected[0] ?? 0;
        await tx.commit();
      } catch (error) {
        await tx.rollback();
        throw error;
      }
    }
    return creadas;
  }

  async pendientes(): Promise<never> {
    throw new Error(
      'SqlServerEmpleadoRepository.pendientes llega con completarFicha (WU12 del plan asistencia-rrhh-fase1)',
    );
  }

  async completar(): Promise<never> {
    throw new Error(
      'SqlServerEmpleadoRepository.completar llega con completarFicha (WU12 del plan asistencia-rrhh-fase1)',
    );
  }
}

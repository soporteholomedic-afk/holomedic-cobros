import * as mssql from 'mssql';

import type { DatosFicha, Empleado, UsuarioEquipo } from '../../domain/entities';
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
 * transaction per chunk. `completar` is the RRHH write path (REQ-F1-10,
 * WU12) and `pendientes` feeds the RRHH queue UI (REQ-F1-13, WU15) —
 * the port is fully real since WU15.
 */

/** Thrown by `completar` when the id does not exist — routes map it to 404. */
export class FichaNoEncontradaError extends Error {
  constructor(id: number) {
    super(`la ficha ${id} no existe en dbo.empleados`);
    this.name = 'FichaNoEncontradaError';
  }
}

/** Rows per statement: 300 × 2 params = 601 (≤ 2100). */
const FILAS_POR_CHUNK = 300;

interface EmpleadoRow {
  id: number;
  userId: string;
  dni: string | null;
  nombres: string | null;
  apellidos: string | null;
  area: string | null;
  cargo: string | null;
  fechaIngreso: Date | null;
  fechaBaja: Date | null;
  estado: string;
  modoExtras: string;
  createdAt: Date;
  updatedAt: Date;
}

function filaAEmpleado(fila: EmpleadoRow): Empleado {
  return {
    id: fila.id,
    userId: fila.userId,
    dni: fila.dni,
    nombres: fila.nombres,
    apellidos: fila.apellidos,
    area: fila.area,
    cargo: fila.cargo,
    // DATE columns render as plain calendar dates at the domain boundary.
    fechaIngreso: fila.fechaIngreso instanceof Date ? fila.fechaIngreso.toISOString().slice(0, 10) : null,
    fechaBaja: fila.fechaBaja instanceof Date ? fila.fechaBaja.toISOString().slice(0, 10) : null,
    estado: fila.estado as Empleado['estado'],
    modoExtras: fila.modoExtras,
    createdAt: fila.createdAt,
    updatedAt: fila.updatedAt,
  };
}

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

  /** Fichas waiting for RRHH completion — oldest first (queue order). */
  async pendientes(): Promise<Empleado[]> {
    const result = await this.pool.request().query(`
SELECT id, userId, dni, nombres, apellidos, area, cargo, fechaIngreso, fechaBaja,
       estado, modoExtras, createdAt, updatedAt
FROM dbo.empleados
WHERE estado = 'PENDIENTE_FICHA'
ORDER BY createdAt, id`);
    return (result.recordset as unknown as EmpleadoRow[]).map(filaAEmpleado);
  }

  async completar(id: number, datos: DatosFicha): Promise<Empleado> {
    const result = await this.pool
      .request()
      .input('id', mssql.Int, id)
      .input('dni', mssql.VarChar(15), datos.dni)
      .input('apellidos', mssql.NVarChar(100), datos.apellidos)
      .input('area', mssql.NVarChar(80), datos.area)
      .input('fechaIngreso', mssql.Date, new Date(`${datos.fechaIngreso}T00:00:00`))
      .input('nombres', mssql.NVarChar(100), datos.nombres ?? null)
      .input('cargo', mssql.NVarChar(80), datos.cargo ?? null)
      .query(`
UPDATE dbo.empleados
   SET dni = @dni,
       apellidos = @apellidos,
       area = @area,
       fechaIngreso = @fechaIngreso,
       nombres = COALESCE(@nombres, nombres),
       cargo = COALESCE(@cargo, cargo),
       estado = 'ACTIVO',
       updatedAt = SYSDATETIME()
 OUTPUT inserted.*
 WHERE id = @id`);
    const fila = (result.recordset as unknown as EmpleadoRow[])[0];
    if (!fila) throw new FichaNoEncontradaError(id);
    return filaAEmpleado(fila);
  }
}

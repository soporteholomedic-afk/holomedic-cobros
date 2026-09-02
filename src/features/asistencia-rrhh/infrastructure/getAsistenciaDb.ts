import type {
  IAlertaRepository,
  IAuditoriaRepository,
  IComandoRepository,
  IDispositivoRepository,
  IEmpleadoRepository,
  IMarcacionRepository,
  IParametroRepository,
} from '../domain/ports';
import { getHolomedicPool } from '@/lib/db';

import { migrate, seedParametros } from './sqlserver/migrate';
import { SqlServerAlertaRepository } from './sqlserver/SqlServerAlertaRepository';
import { SqlServerComandoRepository } from './sqlserver/SqlServerComandoRepository';
import { SqlServerDispositivoRepository } from './sqlserver/SqlServerDispositivoRepository';
import { SqlServerEmpleadoRepository } from './sqlserver/SqlServerEmpleadoRepository';
import { SqlServerMarcacionRepository } from './sqlserver/SqlServerMarcacionRepository';
import { SqlServerParametroRepository } from './sqlserver/SqlServerParametroRepository';

/**
 * The asistencia-rrhh feature container (ADR-3): one factory owning ONE
 * pool, ONE idempotent `migrate()` + `seedParametros()` and the seven
 * SQL Server adapters (one per domain port).
 *
 * Deliberate deviation from the plantillas/cobranza one-factory-per-repo
 * pattern: seven separate factories would run seven migrations and
 * seven pools for one feature. Use cases still depend on the individual
 * ports only — this container is the composition root the API routes
 * resolve adapters from.
 */
export interface AsistenciaDb {
  dispositivos: IDispositivoRepository;
  marcaciones: IMarcacionRepository;
  empleados: IEmpleadoRepository;
  comandos: IComandoRepository;
  alertas: IAlertaRepository;
  parametros: IParametroRepository;
  auditoria: IAuditoriaRepository;
}

/**
 * Skeleton adapter for the port whose SQL Server class has not landed
 * yet (auditoria → WU12). Every method access fails loudly with the
 * port name, so nothing can silently no-op before the adapter arrives.
 * The ingestion-side ports (dispositivos/marcaciones/comandos/alertas)
 * are real adapters since WU6, and empleados/parametros since WU7.
 */
function adaptadorEsqueleto<T extends object>(puerto: string): T {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        throw new Error(
          `AsistenciaDb.${puerto}.${String(prop)} aún no está implementado ` +
            '(llega en un work unit posterior del plan asistencia-rrhh-fase1)',
        );
      },
    },
  ) as T;
}

let cached: Promise<AsistenciaDb> | null = null;

/**
 * Return the process-wide asistencia-rrhh container (a cached Promise).
 *
 * The first call:
 *   1. Opens the singleton `HOLOMEDIC` SQL Server pool via
 *      `getHolomedicPool()` (env vars: `HOLOMEDIC_DB_*`).
 *   2. Runs the idempotent `migrate()` + `seedParametros()` so the
 *      schema and base parameters exist on first connection.
 *   3. Assembles the seven adapters (ADR-3).
 *
 * Every subsequent call returns the same cached promise. Mirrors the
 * `getTemplateDb` singleton + async-signature philosophy for uniform
 * `await` at call sites.
 */
export function getAsistenciaDb(): Promise<AsistenciaDb> {
  if (cached) return cached;
  cached = (async (): Promise<AsistenciaDb> => {
    const pool = await getHolomedicPool();
    await pool.connect();
    await migrate(pool);
    await seedParametros(pool);
    return {
      dispositivos: new SqlServerDispositivoRepository(pool),
      marcaciones: new SqlServerMarcacionRepository(pool),
      empleados: new SqlServerEmpleadoRepository(pool),
      comandos: new SqlServerComandoRepository(pool),
      alertas: new SqlServerAlertaRepository(pool),
      parametros: new SqlServerParametroRepository(pool),
      auditoria: adaptadorEsqueleto('auditoria'),
    };
  })();
  return cached;
}

/**
 * Test seam — replaces (or clears) the cached container so unit tests
 * for the API routes and use cases can inject a mock `AsistenciaDb`
 * without ever opening a real SQL Server connection. Pass `null` to
 * clear so the next `getAsistenciaDb()` call rebuilds the real adapter.
 */
export function __setAsistenciaDbForTests(db: AsistenciaDb | null): void {
  cached = db ? Promise.resolve(db) : null;
}

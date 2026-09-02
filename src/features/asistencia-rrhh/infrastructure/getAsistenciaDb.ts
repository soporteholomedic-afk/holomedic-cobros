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
 * Skeleton adapter (this batch ships only the schema + seed — T-F1-02/03).
 * Every method access fails loudly with the port name, so nothing can
 * silently no-op before the adapters land in their work units
 * (dispositivos/marcaciones/comandos/alertas: WU6-WU8; empleados:
 * WU7/WU12; parametros/auditoria: WU12/WU13). Swapping a slot for its
 * real `SqlServer*Repository` class is a one-line change per port.
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
      dispositivos: adaptadorEsqueleto('dispositivos'),
      marcaciones: adaptadorEsqueleto('marcaciones'),
      empleados: adaptadorEsqueleto('empleados'),
      comandos: adaptadorEsqueleto('comandos'),
      alertas: adaptadorEsqueleto('alertas'),
      parametros: adaptadorEsqueleto('parametros'),
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

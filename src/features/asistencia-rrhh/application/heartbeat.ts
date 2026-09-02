import type { Dispositivo, UsuarioEquipo } from '../domain/entities';
import type {
  IAlertaRepository,
  IDispositivoRepository,
  IEmpleadoRepository,
  IParametroRepository,
} from '../domain/ports';

/**
 * Device heartbeat (REQ-F1-03/09, ADR-1). Orchestration only:
 *
 *  1. `registrarHeartbeat` stamps dispositivos.ultimaSincronizacion and
 *     answers the server time — the dashboard's WORKER_CAIADO read
 *     (ADR-5) evaluates this timestamp later, on read.
 *  2. Clock drift — a reported `drift_seg` STRICTLY greater than the
 *     seeded TARDANZA_ALARMA_RELOJ_SEG parameter raises one DRIFT_RELOJ
 *     alert for manual action (R6: drift may persist despite set_time).
 *     The threshold is read from dbo.parametros_sistema; if the row was
 *     removed by hand, the seeded default 60 applies (never a silent
 *     no-threshold).
 *  3. User bootstrap (ADR-1) — the device's user report rides the same
 *     heartbeat; missing fichas are created PENDIENTE_FICHA and existing
 *     ones are never overwritten (R5), so the 60s periodicity converges
 *     without errors and the upsert stays idempotent server-side.
 */
export interface HeartbeatDeps {
  dispositivos: IDispositivoRepository;
  alertas: IAlertaRepository;
  empleados: IEmpleadoRepository;
  parametros: IParametroRepository;
}

export interface EntradaHeartbeat {
  /** Seconds the device clock drifts from the server, as measured by the worker. */
  drift_seg?: number;
  /** Device user report riding the heartbeat (ADR-1). */
  usuarios?: UsuarioEquipo[];
}

export interface ResultadoHeartbeat {
  /** Server time stored by registrarHeartbeat (naive America/Lima, ADR-9). */
  horaServidor: Date;
}

const CLAVE_TARDANZA = 'TARDANZA_ALARMA_RELOJ_SEG';
/** Same value seedParametros plants; used only if the row was hand-removed. */
const TARDANZA_POR_DEFECTO_SEG = 60;
const TIPO_ALERTA_DRIFT = 'DRIFT_RELOJ';

export class HeartbeatUseCase {
  constructor(private readonly deps: HeartbeatDeps) {}

  async execute(dispositivo: Dispositivo, entrada: EntradaHeartbeat): Promise<ResultadoHeartbeat> {
    const horaServidor = await this.deps.dispositivos.registrarHeartbeat(dispositivo.id);

    if (typeof entrada.drift_seg === 'number') {
      const umbral = await this.leerUmbralTardanza();
      if (entrada.drift_seg > umbral) {
        await this.deps.alertas.crear(
          TIPO_ALERTA_DRIFT,
          `Deriva de reloj ${entrada.drift_seg}s > umbral ${umbral}s`,
          dispositivo.id,
        );
      }
    }

    if (entrada.usuarios && entrada.usuarios.length > 0) {
      await this.deps.empleados.upsertPendientes(entrada.usuarios);
    }

    return { horaServidor };
  }

  private async leerUmbralTardanza(): Promise<number> {
    const valor = await this.deps.parametros.valor(CLAVE_TARDANZA);
    const parseado = valor === null ? Number.NaN : Number(valor);
    return Number.isFinite(parseado) ? parseado : TARDANZA_POR_DEFECTO_SEG;
  }
}

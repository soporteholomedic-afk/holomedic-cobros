import type { Alerta, MarcacionRaw } from '../domain/entities';
import type {
  IAlertaRepository,
  IDispositivoRepository,
  IMarcacionRepository,
  IParametroRepository,
} from '../domain/ports';
import { aFechaHoraNaiva } from '../domain/fechaNaive';

/**
 * Dashboard de captura (REQ-F1-11). Orchestration only:
 *
 *  1. `marcaciones.listarDelDia(hoy)` — today's punches (naive Lima,
 *     ADR-9: the host runs at America/Lima, risk R3 verified at rollout).
 *  2. `alertas.recientes(LIMITE)` — the recent capture alerts.
 *  3. WORKER_CAIADO evaluated ON READ (ADR-5): F1 has no scheduler, so
 *     the dashboard compares each active device's ultimaSincronizacion
 *     against WORKER_CAIDO_SEG — read from dbo.parametros_sistema with
 *     the seeded 600 as documented fallback (never a silent
 *     no-threshold). A device older than the threshold — or one that
 *     never synced — becomes a synthetic WORKER_CAIADO entry merged
 *     into the alert list.
 */

export interface VistaAlerta {
  tipo: string;
  empleadoId: number | null;
  dispositivoId: number | null;
  detalle: string;
  fecha: Date;
  atendida: boolean;
}

export interface ListarDashboardDeps {
  marcaciones: IMarcacionRepository;
  alertas: IAlertaRepository;
  dispositivos: IDispositivoRepository;
  parametros: IParametroRepository;
}

export interface ResultadoDashboard {
  /** Today's calendar date (YYYY-MM-DD, naive Lima) the punches were queried with. */
  fecha: string;
  marcaciones: MarcacionRaw[];
  alertas: VistaAlerta[];
}

const CLAVE_CAIDO = 'WORKER_CAIDO_SEG';
/** Same value seedParametros plants; used only if the row was hand-removed. */
const CAIDO_POR_DEFECTO_SEG = 600;
const LIMITE_ALERTAS = 50;

export class ListarDashboardUseCase {
  constructor(private readonly deps: ListarDashboardDeps) {}

  async execute(ahora: Date = new Date()): Promise<ResultadoDashboard> {
    const fecha = aFechaHoraNaiva(ahora).slice(0, 10);

    const [marcaciones, alertasBd, estados, umbralCaido] = await Promise.all([
      this.deps.marcaciones.listarDelDia(fecha),
      this.deps.alertas.recientes(LIMITE_ALERTAS),
      this.deps.dispositivos.estados(),
      this.leerUmbralCaido(),
    ]);

    const alertas: VistaAlerta[] = alertasBd.map(aVista);
    for (const estado of estados) {
      if (!estado.ultimaSincronizacion) {
        alertas.push({
          tipo: 'WORKER_CAIADO',
          empleadoId: null,
          dispositivoId: estado.id,
          detalle: `${estado.codigo}: sin sincronización registrada (nunca conectó)`,
          fecha: ahora,
          atendida: false,
        });
        continue;
      }
      const antiguedadSeg = Math.floor((ahora.getTime() - estado.ultimaSincronizacion.getTime()) / 1000);
      if (antiguedadSeg > umbralCaido) {
        alertas.push({
          tipo: 'WORKER_CAIADO',
          empleadoId: null,
          dispositivoId: estado.id,
          detalle: `${estado.codigo}: última sincronización hace ${antiguedadSeg}s > umbral ${umbralCaido}s`,
          fecha: ahora,
          atendida: false,
        });
      }
    }

    return { fecha, marcaciones, alertas };
  }

  private async leerUmbralCaido(): Promise<number> {
    const valor = await this.deps.parametros.valor(CLAVE_CAIDO);
    const parseado = valor === null ? Number.NaN : Number(valor);
    return Number.isFinite(parseado) ? parseado : CAIDO_POR_DEFECTO_SEG;
  }
}

function aVista(alerta: Alerta): VistaAlerta {
  return {
    tipo: alerta.tipo,
    empleadoId: alerta.empleadoId,
    dispositivoId: alerta.dispositivoId,
    detalle: alerta.detalle ?? '',
    fecha: alerta.fecha,
    atendida: alerta.atendida,
  };
}

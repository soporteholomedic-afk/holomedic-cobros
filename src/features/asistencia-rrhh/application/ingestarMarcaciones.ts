import type { Comando, Dispositivo, MarcacionWire } from '../domain/entities';
import type {
  IAlertaRepository,
  IComandoRepository,
  IMarcacionRepository,
} from '../domain/ports';

/**
 * Punch-batch ingestion (REQ-F1-01/02/04). Orchestration only:
 *
 *  1. `insertarLote` — idempotent bulk insert; the repository resolves
 *     empleadoId for ANY ficha estado (REQ-F1-02: a PENDIENTE_FICHA
 *     ficha is a known user) and reports only truly unknown user_ids.
 *  2. One USER_ID_DESCONOCIDO alert per DISTINCT unknown user_id —
 *     never one per punch.
 *  3. `pendientesYMarcarEnviados` — claims the device's PENDIENTE
 *     commands (marks them ENVIADO) so they are delivered exactly once;
 *     already-CONFIRMADO commands are never re-sent.
 */
export interface IngestarMarcacionesDeps {
  marcaciones: IMarcacionRepository;
  alertas: IAlertaRepository;
  comandos: IComandoRepository;
}

export interface ResultadoIngesta {
  recibidos: number;
  insertados: number;
  duplicados: number;
  comandos: Comando[];
}

const TIPO_ALERTA_DESCONOCIDO = 'USER_ID_DESCONOCIDO';

export class IngestarMarcacionesUseCase {
  constructor(private readonly deps: IngestarMarcacionesDeps) {}

  async execute(dispositivo: Dispositivo, items: MarcacionWire[]): Promise<ResultadoIngesta> {
    const { insertados, userIdsDesconocidos } = await this.deps.marcaciones.insertarLote(
      dispositivo.id,
      items,
    );

    for (const userId of userIdsDesconocidos) {
      await this.deps.alertas.crear(
        TIPO_ALERTA_DESCONOCIDO,
        `Marcación de user_id sin ficha: "${userId}"`,
        dispositivo.id,
      );
    }

    const comandos = await this.deps.comandos.pendientesYMarcarEnviados(dispositivo.id);

    return {
      recibidos: items.length,
      insertados,
      duplicados: items.length - insertados,
      comandos,
    };
  }
}

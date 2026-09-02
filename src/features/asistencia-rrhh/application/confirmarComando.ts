import type { Dispositivo } from '../domain/entities';
import type { IComandoRepository, ResultadoConfirmacion } from '../domain/ports';

/**
 * Command confirmation (REQ-F1-04): the worker acknowledges an applied
 * command by id. Thin orchestration — the outcome mapping to HTTP lives
 * in the route:
 *  - CONFIRMADO → 200 {ok, estado, confirmadoAt}
 *  - NO_EXISTE  → 404 (unknown id)
 *  - AJENO      → 403 (another device's command)
 * A re-confirm of an already-terminal same-device command arrives as
 * CONFIRMADO with the ORIGINAL confirmadoAt — a 200 no-op, the row is
 * never rewritten (the SQL contract pins that).
 */
export class ConfirmarComandoUseCase {
  constructor(private readonly comandos: IComandoRepository) {}

  async execute(comandoId: number, dispositivo: Dispositivo): Promise<ResultadoConfirmacion> {
    return this.comandos.confirmar(comandoId, dispositivo.id);
  }
}

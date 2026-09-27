import { fechaHoy } from '../domain/cadence';
import type { Clock, CrmPanelRepositoryPort, FilaPanelCrm } from '../domain/ports';

/**
 * The panel read model (rediseno-crm-panel task 7.2, design D4): ONE
 * fetch of every empresa row (pipeline projection + principal contacto
 * rides the repository's single JOIN query) plus the injected business
 * date the client-side derivation needs (estadoPanel.ts `hoy`).
 *
 * Deliberately NO classification lives here: KPIs, the 7 tab counts,
 * search and the per-row panel status are CLIENT-SIDE derivations from
 * this single payload (mock parity, no per-tab endpoints). The use
 * case is the hexagonal seam that keeps the route free of repository
 * wiring — the same shape ListarColaHoyUseCase uses for the queue.
 */
export interface PanelCrm {
  /** Injected business date `YYYY-MM-DD` — the derivation's "hoy". */
  hoy: string;
  /** Every empresa with its panel projection (repo order, verbatim). */
  filas: FilaPanelCrm[];
}

export class ListarPanelCrmUseCase {
  constructor(
    private readonly panel: CrmPanelRepositoryPort,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<PanelCrm> {
    const filas = await this.panel.listarEmpresasPanel();
    return { hoy: fechaHoy(this.clock), filas };
  }
}

import { fechaHoy, seccionCola } from '../domain/cadence';
import type { Clock, CrmPipelineRepositoryPort, CandidatoCola } from '../domain/ports';

/** The daily queue ("a quién le toca hoy") — four sections, design §3. */
export interface ColaHoy {
  /** ACTIVE stage, under the 3-strike, proximo ≤ hoy → log the weekly send. */
  vencidasHoy: CandidatoCola[];
  /** DESCANSO expired → the next logged send re-enters the cadence (T9). */
  reinicios: CandidatoCola[];
  /** INBOUND/SEGUIMIENTO agotada → the user decides: T13 (outbound) or T14 (rechazo). */
  decisionRequerida: CandidatoCola[];
  /** RECHAZADO expired → the user may reactivate (T15). */
  reactivables: CandidatoCola[];
}

/**
 * ListarColaHoyUseCase (tasks pr13/WU2, spec G4, design §3) — the
 * daily queue DERIVED ON REQUEST: one read of every pipeline row
 * (covering index IX_CRM_Pipeline_Etapa) classified in memory by the
 * pure pr12 predicates (`seccionCola`). Zero background jobs, zero
 * cron, zero auto-send — the only writes happen on user actions.
 *
 * Scope note: the whole queue renders for every `crm` holder (spec G4
 * frames it as a team tool); per-user scoping arrives with the
 * cartera slice (pr15), whose list use case owns the own-vs-all rule.
 */
export class ListarColaHoyUseCase {
  constructor(
    private readonly pipelines: CrmPipelineRepositoryPort,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<ColaHoy> {
    const candidatos = await this.pipelines.listarCandidatosCola();
    const hoy = fechaHoy(this.clock);

    const cola: ColaHoy = { vencidasHoy: [], reinicios: [], decisionRequerida: [], reactivables: [] };
    for (const candidato of candidatos) {
      const seccion = seccionCola(candidato, hoy);
      if (seccion) cola[seccion].push(candidato);
    }
    return cola;
  }
}

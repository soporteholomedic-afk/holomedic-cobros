import { esperaPrimerContacto, fechaHoy, seccionCola } from '../domain/cadence';
import type { Clock, CrmPipelineRepositoryPort, CandidatoCola } from '../domain/ports';

/** The daily queue ("a quién le toca hoy") — four derived sections
 * (design §3) plus the session user's fresh empresas. */
export interface ColaHoy {
  /** ACTIVE stage, under the 3-strike, proximo ≤ hoy → log the weekly send. */
  vencidasHoy: CandidatoCola[];
  /** DESCANSO expired → the next logged send re-enters the cadence (T9). */
  reinicios: CandidatoCola[];
  /** INBOUND/SEGUIMIENTO agotada → the user decides: T13 (outbound) or T14 (rechazo). */
  decisionRequerida: CandidatoCola[];
  /** RECHAZADO expired → the user may reactivate (T15). */
  reactivables: CandidatoCola[];
  /**
   * The session user's empresas awaiting their FIRST contacto (crm-ux
   * redesign): taken from the pool or quick-captured, never sent yet
   * (`esperaPrimerContacto`). User-scoped by design — the four due
   * sections above stay team-wide.
   */
  sinGestion: CandidatoCola[];
}

/**
 * ListarColaHoyUseCase (tasks pr13/WU2, spec G4, design §3) — the
 * daily queue DERIVED ON REQUEST: one read of every pipeline row
 * (covering index IX_CRM_Pipeline_Etapa) classified in memory by the
 * pure pr12 predicates (`seccionCola`). Zero background jobs, zero
 * cron, zero auto-send — the only writes happen on user actions.
 *
 * Scope note: the four due sections render for every `crm` holder
 * (spec G4 frames them as a team tool); the fifth (`sinGestion`) is
 * scoped to `usuario` — the session's resolved LOGIN NAME (the same
 * currency CRM_Empresas.responsable stores; the route resolves it
 * from the opaque session.sub, cartera route precedent).
 */
export class ListarColaHoyUseCase {
  constructor(
    private readonly pipelines: CrmPipelineRepositoryPort,
    private readonly clock: Clock,
  ) {}

  async execute(usuario: string): Promise<ColaHoy> {
    const candidatos = await this.pipelines.listarCandidatosCola();
    const hoy = fechaHoy(this.clock);

    const cola: ColaHoy = {
      vencidasHoy: [],
      reinicios: [],
      decisionRequerida: [],
      reactivables: [],
      sinGestion: [],
    };
    for (const candidato of candidatos) {
      const seccion = seccionCola(candidato, hoy);
      if (seccion) {
        cola[seccion].push(candidato);
        continue;
      }
      // Due sections keep precedence (a due row always has sends, so
      // the sets cannot overlap — the guard keeps that explicit).
      if (candidato.responsable === usuario && esperaPrimerContacto(candidato)) {
        cola.sinGestion.push(candidato);
      }
    }
    return cola;
  }
}

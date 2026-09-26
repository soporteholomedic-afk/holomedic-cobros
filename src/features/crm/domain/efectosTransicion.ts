/**
 * Denormalized-counter effects of a pipeline transition (tasks pr10/WU1).
 *
 * The state machine (pr9) owns `{flujo, etapa}`; THIS module owns the
 * CRM_Pipeline cadence counters and DATE markers each T-row writes
 * (design D3 effects column, design §3 cadence rules). Pure — the
 * stored row is never mutated; the use case composes
 * machine + effects and hands ONE bundle to the port (the adapter
 * persists everything in a single `withCrmTransaction`).
 *
 * Effects key on the resolved TRANSITION ROW ID, not the event name:
 * two rows share `PresentaciónEnviada` (T3 passthrough vs T7 arm) and
 * two share `CotizaciónEnviada` (T2/T12) — the machine's
 * `resolverTransicion` disambiguates by the row the (estado, evento)
 * pair actually fires.
 *
 * Pinned effects (tests are the contract):
 * - T2/T7/T12 (arm/re-arm): ciclo=1, enviosCiclo=1, fechaCicloInicio =
 *   fechaUltimoEnvio = hoy — the cotización/presentación send counts
 *   as send #1 of the fresh cycle.
 * - T8: descansoHasta = fechaUltimoEnvio + 3 calendar months (fallback
 *   hoy when no send was ever logged); counters untouched.
 * - T9: ciclo+1, enviosCiclo=1, dates = hoy, descansoHasta cleared.
 * - T14: rechazadoHasta = hoy + 3 months, motivoRechazo = motivo.
 * - T13/T15 (entries into the unarmed NUEVO stage): enviosCiclo back
 *   to 0; T15 additionally clears the rejection markers; ciclo keeps
 *   its history.
 * - Plain stage changes (T3/T4/T5/T10/T11): full passthrough — they
 *   write audit/result rows, not counters.
 */

import { agregarMeses } from './cadence';
import type { PipelineEmpresa } from './entities';
import { resolverTransicion, type EventoPipeline } from './maquinaEstados';

/** The CRM_Pipeline counter/marker projection written by a transition. */
export interface EfectosDenormalizados {
  ciclo: number;
  enviosCiclo: number;
  fechaCicloInicio: string | null;
  fechaUltimoEnvio: string | null;
  descansoHasta: string | null;
  rechazadoHasta: string | null;
  motivoRechazo: string | null;
}

/**
 * Project `fila`'s counters onto the state AFTER `evento` fires.
 * `hoy` is the injected business date (DATE-only); `motivo` is only
 * read by T14 (already validated/trimmed by the caller). An unresolved
 * (estado, evento) pair passes through untouched — the use case runs
 * `transitar` first, so an illegal move never reaches this function.
 */
export function efectosTransicion(
  fila: PipelineEmpresa,
  evento: EventoPipeline,
  hoy: string,
  motivo: string | null = null,
): EfectosDenormalizados {
  const base: EfectosDenormalizados = {
    ciclo: fila.ciclo,
    enviosCiclo: fila.enviosCiclo,
    fechaCicloInicio: fila.fechaCicloInicio,
    fechaUltimoEnvio: fila.fechaUltimoEnvio,
    descansoHasta: fila.descansoHasta,
    rechazadoHasta: fila.rechazadoHasta,
    motivoRechazo: fila.motivoRechazo,
  };

  const filaTransicion = resolverTransicion({ flujo: fila.flujo, etapa: fila.etapa }, evento);

  switch (filaTransicion?.id) {
    // T2/T7/T12 — arm (or re-arm after the T12 flow flip): fresh cycle.
    case 'T2':
    case 'T7':
    case 'T12':
      return {
        ...base,
        ciclo: 1,
        enviosCiclo: 1,
        fechaCicloInicio: hoy,
        fechaUltimoEnvio: hoy,
      };

    // T8 — 3 envíos sin respuesta: 3-month rest from the last send.
    case 'T8':
      return {
        ...base,
        descansoHasta: agregarMeses(fila.fechaUltimoEnvio ?? hoy, 3),
      };

    // T9 — reinicio after the rest: next cycle, send #1 logged today.
    case 'T9':
      return {
        ...base,
        ciclo: fila.ciclo + 1,
        enviosCiclo: 1,
        fechaCicloInicio: hoy,
        fechaUltimoEnvio: hoy,
        descansoHasta: null,
      };

    // T14 — rechazo + motivo: 3-month cooldown, motivo mirrored.
    case 'T14':
      return {
        ...base,
        rechazadoHasta: agregarMeses(hoy, 3),
        motivoRechazo: motivo,
      };

    // T13/T15 — into the unarmed NUEVO stage: send counter back to 0.
    // T15 additionally clears the rejection markers (cooldown served;
    // the audit rows keep the history).
    case 'T13':
      return { ...base, enviosCiclo: 0 };

    case 'T15':
      return {
        ...base,
        enviosCiclo: 0,
        rechazadoHasta: null,
        motivoRechazo: null,
      };

    // T3/T4/T5/T10/T11 — plain stage changes: passthrough.
    default:
      return base;
  }
}

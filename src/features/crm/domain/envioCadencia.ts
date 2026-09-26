/**
 * The cadence send (tasks pr13/WU1, design §3): a user logs the
 * ENVIO_CADENCIA activity by hand — there is NO auto-send — and the
 * logged send is the event the cadence engine derives from. Pure:
 * given the stored pipeline row and the injected `hoy`, it projects
 * the denormalized counters to persist next to the activity row, plus
 * the machine transition the send DERIVES (if any):
 *
 * - Weekly due send (pr12's `estaVencidaHoy`): plain counter
 *   projection — enviosCiclo+1, fechaUltimoEnvio = hoy, so the next
 *   `proximoEnvio` is exactly hoy + 7d and the empresa surfaces in
 *   the queue exactly once that week.
 * - 3rd send on OUTBOUND/CADENCIA: T8 fires AUTOMATICALLY — the
 *   machine (`transitar`) moves CADENCIA → DESCANSO and the pr10
 *   effects layer (`efectosTransicion`, keyed on the resolved T-row,
 *   never on the event name) sets descansoHasta = send date + 3
 *   months from the JUST-LOGGED fechaUltimoEnvio.
 * - A send logged on an expired DESCANSO (pr12's
 *   `esReinicioDeCadencia`): T9 fires — CADENCIA again, ciclo+1,
 *   envios=1, descansoHasta cleared.
 * - INBOUND's 3rd strike deliberately derives NOTHING (the T13/T14
 *   fork is a user decision): the counter projection lands and
 *   pr12's `requiereDecision` lights the decision queue up.
 *
 * Any send outside the cadence (early send, running rest, rejection
 * cooldown, unarmed/disarmed stages) is a `ValidationError` with a
 * Spanish message — the API maps it to 400 verbatim.
 */

import { ENVIOS_POR_CICLO, estaVencidaHoy, esReinicioDeCadencia } from './cadence';
import type { PipelineEmpresa } from './entities';
import { ValidationError } from './errors';
import { efectosTransicion, type EfectosDenormalizados } from './efectosTransicion';
import { transitar, type EstadoPipeline, type EventoPipeline } from './maquinaEstados';

/** The machine transition a logged send may DERIVE (T8 auto / T9 re-entry). */
export interface TransicionDerivada {
  evento: EventoPipeline;
  estadoPrevio: EstadoPipeline;
  estadoNuevo: EstadoPipeline;
}

export interface ResultadoEnvioCadencia {
  /** Counter/marker projection to persist next to the activity row. */
  efectos: EfectosDenormalizados;
  /** The derived machine transition, or null for a plain weekly send. */
  transicion: TransicionDerivada | null;
}

/** Weekly counter projection: the send counts, the cycle keeps running. */
function proyeccionEnvioSemanal(fila: PipelineEmpresa, hoy: string): EfectosDenormalizados {
  return {
    ciclo: fila.ciclo,
    enviosCiclo: fila.enviosCiclo + 1,
    fechaCicloInicio: fila.fechaCicloInicio,
    fechaUltimoEnvio: hoy,
    descansoHasta: fila.descansoHasta,
    rechazadoHasta: fila.rechazadoHasta,
    motivoRechazo: fila.motivoRechazo,
  };
}

/**
 * Project the effects of logging ONE cadence send on `fila` at `hoy`.
 * Throws `ValidationError` when the empresa has no send due today —
 * the queue (pr13's union of pr12 predicates) is the only surface
 * that should offer the action.
 */
export function aplicarEnvioCadencia(fila: PipelineEmpresa, hoy: string): ResultadoEnvioCadencia {
  const estadoPrevio: EstadoPipeline = { flujo: fila.flujo, etapa: fila.etapa };

  // T9 — the logged send IS the rest-exit event (descansoHasta ≤ hoy).
  if (esReinicioDeCadencia(fila, hoy)) {
    const evento: EventoPipeline = 'ReinicioCadencia';
    const { estado: estadoNuevo } = transitar(estadoPrevio, evento);
    return {
      efectos: efectosTransicion(fila, evento, hoy),
      transicion: { evento, estadoPrevio, estadoNuevo },
    };
  }

  // Weekly window: ACTIVE stage, under the 3-strike, proximo ≤ hoy.
  if (estaVencidaHoy(fila, hoy)) {
    const proyeccion = proyeccionEnvioSemanal(fila, hoy);

    // 3rd OUTBOUND strike: T8 is AUTOMATIC (design D3 asymmetry).
    // The effects read the row AFTER the increment, so descansoHasta
    // derives from the send being logged right now.
    if (fila.flujo === 'OUTBOUND' && proyeccion.enviosCiclo >= ENVIOS_POR_CICLO) {
      const evento: EventoPipeline = 'EnviosAgotados';
      const { estado: estadoNuevo } = transitar(estadoPrevio, evento);
      const trasEnvio: PipelineEmpresa = {
        ...fila,
        enviosCiclo: proyeccion.enviosCiclo,
        fechaUltimoEnvio: hoy,
      };
      return {
        efectos: efectosTransicion(trasEnvio, evento, hoy),
        transicion: { evento, estadoPrevio, estadoNuevo },
      };
    }

    return { efectos: proyeccion, transicion: null };
  }

  throw new ValidationError('La empresa no tiene un envío de cadencia pendiente hoy');
}

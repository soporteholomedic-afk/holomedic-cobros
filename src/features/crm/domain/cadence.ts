/**
 * Pure cadence engine (design §3) — no cron, no auto-send, no wall
 * clock: every predicate receives `hoy` as an injected DATE-only
 * string (`fechaHoy` bridges Clock → string at the boundary).
 *
 * Weekly window: proximo = fechaUltimoEnvio + 7d exact; an ACTIVE
 * stage (SEGUIMIENTO | CADENCIA) is vencida when enviosCiclo < 4 and
 * proximo ≤ hoy. 4-strike: an agotada INBOUND/SEGUIMIENTO asks the
 * user for a decision (T13/T14 fork); the OUTBOUND rest (T8→T9) and
 * the rejection cooldown (T14→T15) share `agregarMeses`' DATEADD
 * month math. The queue (pr13) is the union of these four predicates,
 * derived on request — the only writes happen on user actions.
 *
 * DATE-only strings (`YYYY-MM-DD`) are the domain's date currency for
 * pipeline markers (design §2: DATE columns, day granularity,
 * timezone-free); the SQL adapter owns the `DATE` ↔ string mapping.
 * Zero-padded ISO dates compare correctly as plain strings.
 */

import type { PipelineEmpresa } from './entities';
import type { Clock } from './ports';

/** Weekly cadence window (design §3: "proximo = fechaUltimoEnvio + 7 días"). */
const DIAS_POR_SEMANA = 7;

/**
 * Sends per cycle before the 3-month pausa (T8 auto / T13-T14 fork).
 * rediseno-crm-panel decision 6: the carta counts as envío #1, so the
 * cycle is carta + semanas 1-3 = FOUR sends before the exit.
 */
export const ENVIOS_POR_CICLO = 4;

/** Stages where the weekly cadence is ACTIVE (design D3 table). */
function esEtapaCadenciaActiva(etapa: PipelineEmpresa['etapa']): boolean {
  return etapa === 'SEGUIMIENTO' || etapa === 'CADENCIA';
}

/**
 * Add whole calendar months to a `YYYY-MM-DD` date with SQL Server
 * `DATEADD(month, n, x)` clamping semantics: a day beyond the target
 * month's end clamps to that month's last day (Jan 31 + 3m → Apr 30).
 */
export function agregarMeses(fecha: string, meses: number): string {
  const [y, m, d] = fecha.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) {
    throw new Error(`Fecha inválida: "${fecha}" (se espera YYYY-MM-DD)`);
  }
  const mes0Destino = m - 1 + meses;
  const anioDestino = y + Math.floor(mes0Destino / 12);
  const mesDestino = (((mes0Destino % 12) + 12) % 12) + 1;
  // Day 0 of month index `mesDestino` = last day of that month.
  const ultimoDia = new Date(Date.UTC(anioDestino, mesDestino, 0)).getUTCDate();
  const diaDestino = Math.min(d, ultimoDia);
  return (
    `${anioDestino}-` +
    `${String(mesDestino).padStart(2, '0')}-` +
    `${String(diaDestino).padStart(2, '0')}`
  );
}

/** The injected clock's LOCAL calendar date as `YYYY-MM-DD` (ADR-9 naive wall clock). */
export function fechaHoy(clock: Clock): string {
  const ahora = clock();
  const anio = ahora.getFullYear();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

/** Shift a `YYYY-MM-DD` date by whole days (UTC arithmetic — no DST drift). */
function agregarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) {
    throw new Error(`Fecha inválida: "${fecha}" (se espera YYYY-MM-DD)`);
  }
  const utc = new Date(Date.UTC(y, m - 1, d + dias));
  return (
    `${utc.getUTCFullYear()}-` +
    `${String(utc.getUTCMonth() + 1).padStart(2, '0')}-` +
    `${String(utc.getUTCDate()).padStart(2, '0')}`
  );
}

/**
 * Next weekly follow-up date: last send + 7 days, exact across month,
 * year and leap-February boundaries.
 */
export function proximoEnvio(fechaUltimoEnvio: string): string {
  return agregarDias(fechaUltimoEnvio, DIAS_POR_SEMANA);
}

/**
 * The weekly follow-up is DUE today: an ACTIVE cadence stage
 * (SEGUIMIENTO | CADENCIA) with fewer than 4 sends in the cycle whose
 * next send date has arrived (proximo ≤ hoy — stays due until the user
 * logs the send, so it surfaces exactly once per week).
 */
export function estaVencidaHoy(p: PipelineEmpresa, hoy: string): boolean {
  return (
    esEtapaCadenciaActiva(p.etapa) &&
    p.enviosCiclo < ENVIOS_POR_CICLO &&
    p.fechaUltimoEnvio !== null &&
    proximoEnvio(p.fechaUltimoEnvio) <= hoy
  );
}

/**
 * 4-strike fork flag (design D2 outbound/inbound asymmetry): an INBOUND
 * seguimiento that burned its 4 sends needs a USER decision — move to
 * Outbound (T13) or reject (T14). NOT fired for OUTBOUND, whose 4th
 * strike transitions to DESCANSO automatically (deliberate asymmetry).
 */
export function requiereDecision(p: PipelineEmpresa): boolean {
  return p.flujo === 'INBOUND' && p.etapa === 'SEGUIMIENTO' && p.enviosCiclo >= ENVIOS_POR_CICLO;
}

/**
 * Outbound rest finished (T9): a DESCANSO row whose 3-month
 * `descansoHasta` (set by T8) has arrived re-enters the cadence on the
 * next logged send (ciclo+1, envíos=1).
 */
export function esReinicioDeCadencia(p: PipelineEmpresa, hoy: string): boolean {
  return p.etapa === 'DESCANSO' && p.descansoHasta !== null && p.descansoHasta <= hoy;
}

/**
 * Rejection cooldown expired (T15): a RECHAZADO row whose 3-month
 * `rechazadoHasta` (set by T14) has arrived can be reactivated — by
 * user action only, never automatic.
 */
export function esReactivable(p: PipelineEmpresa, hoy: string): boolean {
  return p.etapa === 'RECHAZADO' && p.rechazadoHasta !== null && p.rechazadoHasta <= hoy;
}

/**
 * Freshly taken/created empresa awaiting its FIRST contacto (crm-ux
 * redesign). NOT keyed on fechaUltimoEnvio: the CRM_Pipeline column
 * carries a schema DEFAULT (creation day), so "never sent" is never
 * NULL in stored rows. The honest signals are the STAGE and the
 * counters: REGISTRADO (inbound birth, T1) and NUEVO (outbound birth,
 * T6) exist precisely to await the first contacto; a SEGUIMIENTO/
 * CADENCIA row with zero sends in the cycle was taken over mid-flow
 * and nobody has written to it yet. Post-win stages (PRESENTACION…
 * DATOS) move through their own events and DESCANSO/RECHAZADO have
 * their own cooldown lifecycle — none of them wait for a first send.
 */
export function esperaPrimerContacto(p: PipelineEmpresa): boolean {
  if (p.etapa === 'REGISTRADO' || p.etapa === 'NUEVO') return true;
  return esEtapaCadenciaActiva(p.etapa) && p.enviosCiclo === 0;
}

/** The four queue sections (design §3) — a row lands in at most one. */
export type SeccionCola = 'vencidasHoy' | 'reinicios' | 'decisionRequerida' | 'reactivables';

/**
 * Which queue section `p` belongs to today, or null when it is not
 * due (derived on request — zero background jobs, pr13/WU2). The four
 * predicates are mutually exclusive by stage and counters: vencida
 * requires an ACTIVE stage under the 3-strike, decision the agotada
 * INBOUND fork, reinicio an expired DESCANSO, reactivable an expired
 * RECHAZADO.
 */
export function seccionCola(p: PipelineEmpresa, hoy: string): SeccionCola | null {
  if (estaVencidaHoy(p, hoy)) return 'vencidasHoy';
  if (requiereDecision(p)) return 'decisionRequerida';
  if (esReinicioDeCadencia(p, hoy)) return 'reinicios';
  if (esReactivable(p, hoy)) return 'reactivables';
  return null;
}

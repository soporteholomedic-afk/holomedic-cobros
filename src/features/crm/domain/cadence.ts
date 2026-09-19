/**
 * Pure date helpers for the cadence engine (design §3).
 *
 * `pr12` will add the weekly windows, the 3-strike rule and the queue
 * derivations; `pr10` needs the SHARED 3-month arithmetic first —
 * design §3 pins that the T8 rest (`descansoHasta`) and the T14
 * rejection cooldown (`rechazadoHasta`) use the SAME
 * `DATEADD(month, 3, x)` calendar-month math, so it lives here from
 * the start and both effects call one function.
 *
 * DATE-only strings (`YYYY-MM-DD`) are the domain's date currency for
 * pipeline markers (design §2: DATE columns, day granularity,
 * timezone-free); the SQL adapter owns the `DATE` ↔ string mapping.
 */

import type { Clock } from './ports';

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

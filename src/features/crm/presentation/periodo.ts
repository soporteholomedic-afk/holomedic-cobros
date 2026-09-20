/**
 * The productivity period selector's shared vocabulary (tasks
 * pr16/WU3). Kept OUT of the 'use client' component module so the
 * `/crm/productividad` Server Component can compute the default
 * period server-side — exports of a client module become opaque
 * client references, not callable functions, on the server.
 */

/** Inclusive DATE-only window ('YYYY-MM-DD' both ends). */
export interface Periodo {
  desde: string;
  hasta: string;
}

/**
 * Default selector window: the current month to date, built from the
 * host's LOCAL date parts (naive America/Lima wall clock, ADR-9 —
 * the same convention the API and the DATE columns share).
 */
export function periodoPorDefecto(hoy: Date): Periodo {
  const anio = hoy.getFullYear();
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  const dia = String(hoy.getDate()).padStart(2, '0');
  return { desde: `${anio}-${mes}-01`, hasta: `${anio}-${mes}-${dia}` };
}

import { crearProcesadorTareasAgente } from './crearProcesadorTareasAgente';

/**
 * Lazy task sweeper (agente-ia-crm E2·T5) — the interval backstop
 * that drains the durable CRM_AgenteTareas queue. The webhook and
 * simulator routes trigger an immediate fire-and-forget drain right
 * after enqueuing a task; this sweeper is what answers the tasks that
 * trigger misses (process restart, crashed run) and the
 * FUERA_DE_HORARIO / AGENTE_DESHABILITADO rows waiting for their
 * window.
 *
 * Node-only by construction (the interval API) and by guard: on any
 * window-bearing environment (client bundle, jsdom) this is a no-op —
 * the sweeper never runs in a browser. A globalThis flag makes
 * repeated calls idempotent: Next.js HMR and the several route
 * modules that call this at module scope all converge on ONE
 * interval per process. The handle is unref'd (when available) so
 * tests and CLI runs exit without waiting out the interval.
 */

/** The stored interval handle (cleared by the test reset). */
let handle: ReturnType<typeof setInterval> | null = null;

interface GlobalConBarredor {
  __barredorTareasIniciado?: boolean;
}

export function iniciarBarredorTareas(intervaloMs = 20000): void {
  // Node-only guard: no sweeper in any window-bearing environment.
  if (typeof window !== 'undefined') return;
  const globales = globalThis as typeof globalThis & GlobalConBarredor;
  if (globales.__barredorTareasIniciado === true) return;
  globales.__barredorTareasIniciado = true;

  handle = setInterval(() => {
    void crearProcesadorTareasAgente()
      .procesar()
      .catch((error: unknown) => {
        console.error(
          '[agente] barredor',
          error instanceof Error ? error.message : error,
        );
      });
  }, intervaloMs);
  // unref when the platform provides it: the process must be able to
  // exit with a live (idle) sweeper.
  handle?.unref?.();
}

/** Test-only: clear the interval AND the flag so a new start works. */
export function __resetBarredorForTests(): void {
  if (handle !== null) {
    clearInterval(handle);
    handle = null;
  }
  const globales = globalThis as typeof globalThis & GlobalConBarredor;
  globales.__barredorTareasIniciado = false;
}

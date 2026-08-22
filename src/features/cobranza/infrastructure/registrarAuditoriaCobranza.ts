import type { RegistroEnvioCobranzaInput } from '../domain/entities';

import { getCobranzaHistorialDb } from './getCobranzaHistorialDb';

/**
 * Append one immutable audit row for a cobranza send attempt (REQ-02,
 * design D2 — best-effort, exactly-once-per-attempt).
 *
 * NEVER THROWS: every failure path (pool unavailable, INSERT
 * rejected, malformed value) is caught here, logged server-side as a
 * `[cobranza-audit]` warning and swallowed. An audit outage MUST NOT
 * change the send outcome returned to the operator — the warning is
 * the only trace. Callers await this between the send attempt
 * resolving and the response being returned, so the promise must be
 * settled (never rejected, never un-awaited) by the time the route
 * responds.
 *
 * Route-independent by design: unit-testable through the
 * `__setCobranzaHistorialForTests` seam without a real SQL Server.
 */
export async function registrarAuditoriaCobranza(
  input: RegistroEnvioCobranzaInput,
): Promise<void> {
  try {
    const repo = await getCobranzaHistorialDb();
    await repo.insert(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[cobranza-audit] best-effort audit insert failed:', message);
  }
}

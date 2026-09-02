/**
 * Naive America/Lima wall-clock formatting (ADR-9). Every timestamp in
 * this feature is a DATETIME2(0) without timezone; this helper renders a
 * JS Date back into the same "YYYY-MM-DDTHH:mm:ss" wall-clock string the
 * wire contract uses — local-time getters only, no UTC conversion ever
 * applied (the Node host runs at America/Lima like the SQL host, risk
 * R3, verified at rollout).
 */
export function aFechaHoraNaiva(fecha: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}` +
    `T${pad(fecha.getHours())}:${pad(fecha.getMinutes())}:${pad(fecha.getSeconds())}`
  );
}

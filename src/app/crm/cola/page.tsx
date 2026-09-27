import { redirect } from 'next/navigation';

/**
 * Retired view (rediseno-crm-panel task 11.1, spec "Retirement of
 * Superseded Views"): the kanban "Cola de hoy" was superseded by the
 * /crm operator panel. Deep links land on the panel; the proxy still
 * gates this path with the `crm` permission (the /crm prefix entry)
 * before the redirect runs.
 */
export default function ColaPage() {
  redirect('/crm');
}

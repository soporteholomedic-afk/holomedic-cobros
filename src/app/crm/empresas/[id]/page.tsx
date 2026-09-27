import { redirect } from 'next/navigation';

/**
 * Retired view (rediseno-crm-panel task 11.1, spec "Retirement of
 * Superseded Views"): the empresa detail PAGE was superseded by the
 * "Ver Ficha" modal in the /crm operator panel (task 9.1). Deep links
 * land on the panel; the proxy still gates this path with the `crm`
 * permission (the /crm prefix entry) before the redirect runs.
 */
export default function EmpresaDetallePage() {
  redirect('/crm');
}

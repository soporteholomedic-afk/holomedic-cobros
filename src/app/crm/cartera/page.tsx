import { redirect } from 'next/navigation';

/**
 * Retired view (rediseno-crm-panel task 11.1, spec "Retirement of
 * Superseded Views"): "Mi cartera" was superseded by the /crm operator
 * panel (the table shows every empresa with its derived status). Deep
 * links land on the panel; the proxy still gates this path with the
 * `crm` permission (the /crm prefix entry) before the redirect runs.
 */
export default function CarteraPage() {
  redirect('/crm');
}

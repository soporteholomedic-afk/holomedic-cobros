import { PanelCrm } from '@/features/crm/presentation/components/panel/PanelCrm';

/**
 * `/crm` — the operator panel (task 8.5, design D4, spec OP-1/OP-9).
 * Server Component wrapper that renders the client PanelCrm shell:
 * the page owns no data and no session read — the proxy gates /crm
 * with the `crm` permission (RUTAS_PROTEGIDAS, unchanged), the panel
 * fetches its ONE aggregate from /api/crm/panel client-side, and the
 * alta POST gate relax (crm_admin → crm) arrives with task 10.1.
 * The old registry list is superseded here; /crm/cola, /crm/cartera,
 * /crm/empresas/nueva and /crm/empresas/[id] stay alive until tasks
 * 11.x retire them (PanelCrm still deep-links to the ficha/alta pages
 * in the interim).
 */
export default function CrmPage() {
  return (
    <main className="space-y-6 p-6">
      <PanelCrm />
    </main>
  );
}
